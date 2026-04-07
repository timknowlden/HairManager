import express from 'express';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// --- Public routes (token-based auth for mobile upload) ---

// POST /api/expenses/mobile-upload - Upload receipt from mobile (no login, uses short-lived token)
router.post('/mobile-upload', express.json({ limit: '10mb' }), (req, res) => {
  const { token, image } = req.body;
  if (!token || !image) {
    return res.status(400).json({ error: 'Token and image are required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'receipt-upload') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const db = req.app.locals.db;
    const userId = decoded.userId;
    const now = new Date().toISOString();

    // Store as a pending receipt (no expense yet)
    db.run(
      'INSERT INTO pending_receipts (user_id, image_data, created_at) VALUES (?, ?, ?)',
      [userId, image, now],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
});

// GET /api/expenses/pending-receipts - Get pending receipts for current user
router.get('/pending-receipts', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  db.all(
    'SELECT id, created_at FROM pending_receipts WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// GET /api/expenses/pending-receipts/:id - Get a specific pending receipt image
router.get('/pending-receipts/:id', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  db.get(
    'SELECT image_data FROM pending_receipts WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ image_data: row.image_data });
    }
  );
});

// DELETE /api/expenses/pending-receipts/:id - Delete a pending receipt
router.delete('/pending-receipts/:id', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  db.run(
    'DELETE FROM pending_receipts WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// POST /api/expenses/upload-token - Generate a short-lived token for mobile upload
router.post('/upload-token', authenticateToken, (req, res) => {
  const token = jwt.sign(
    { userId: req.userId, type: 'receipt-upload' },
    JWT_SECRET,
    { expiresIn: '30m' }
  );
  res.json({ token });
});

// --- Authenticated routes ---
router.use(authenticateToken);

const SCAN_PROMPT = `Extract the following details from this receipt/invoice. Return ONLY a JSON object with these fields:
{
  "date": "YYYY-MM-DD format, or empty string if not found",
  "amount": numeric total amount (the final total paid, not subtotals),
  "vendor": "shop/business name",
  "description": "brief description of what was purchased",
  "category": "one of: Travel, Supplies & Materials, Equipment, Insurance, Phone & Internet, Professional Fees, Marketing, Repairs & Maintenance, Office Costs, Training, Clothing & Uniform, Other"
}
Return ONLY the JSON, no other text.`;

async function scanWithAnthropic(apiKey, mediaType, base64Data) {
  const anthropic = new Anthropic({ apiKey });
  const isPdf = mediaType === 'application/pdf';
  const content = isPdf ? [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
    { type: 'text', text: SCAN_PROMPT }
  ] : [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
    { type: 'text', text: SCAN_PROMPT }
  ];
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 500,
    messages: [{ role: 'user', content }]
  });
  return response.content[0]?.text || '';
}

async function scanWithOpenAI(apiKey, mediaType, base64Data) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Data}` } },
          { type: 'text', text: SCAN_PROMPT }
        ]
      }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || '';
}

async function scanWithGemini(apiKey, mediaType, base64Data) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Data } },
          { text: SCAN_PROMPT }
        ]
      }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// POST /api/expenses/scan-receipt - Use AI to extract expense details from a receipt image
router.post('/scan-receipt', express.json({ limit: '10mb' }), async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { image } = req.body;

  if (!image) return res.status(400).json({ error: 'Image data is required' });

  // Get user's AI settings
  const settings = await new Promise((resolve, reject) => {
    db.get('SELECT ai_provider, ai_api_key FROM admin_settings WHERE user_id = ?', [userId], (err, row) => err ? reject(err) : resolve(row));
  });

  const provider = settings?.ai_provider || process.env.AI_PROVIDER || 'anthropic';
  const apiKey = settings?.ai_api_key || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'AI API key not configured. Go to Profile Settings to set your AI provider and API key.' });
  }

  try {
    const match = image.match(/^data:(image\/[^;]+|application\/pdf);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image format' });

    const mediaType = match[1];
    const base64Data = match[2];

    let text;
    switch (provider) {
      case 'openai':
        text = await scanWithOpenAI(apiKey, mediaType, base64Data);
        break;
      case 'google':
        text = await scanWithGemini(apiKey, mediaType, base64Data);
        break;
      case 'anthropic':
      default:
        text = await scanWithAnthropic(apiKey, mediaType, base64Data);
        break;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'Could not parse receipt data', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({
      date: parsed.date || '',
      amount: typeof parsed.amount === 'number' ? parsed.amount.toFixed(2) : parsed.amount || '',
      vendor: parsed.vendor || '',
      description: parsed.description || '',
      category: parsed.category || 'Other'
    });
  } catch (err) {
    console.error('[Receipt Scan] Error:', err);
    res.status(500).json({ error: 'Scan failed: ' + (err.message || 'Unknown error') });
  }
});

const DEFAULT_CATEGORIES = [
  { name: 'Travel', hmrc_category: 'travel' },
  { name: 'Supplies & Materials', hmrc_category: 'cost_of_goods' },
  { name: 'Equipment', hmrc_category: 'depreciation' },
  { name: 'Insurance', hmrc_category: 'insurance' },
  { name: 'Phone & Internet', hmrc_category: 'phone' },
  { name: 'Professional Fees', hmrc_category: 'professional_fees' },
  { name: 'Marketing', hmrc_category: 'advertising' },
  { name: 'Repairs & Maintenance', hmrc_category: 'repairs' },
  { name: 'Office Costs', hmrc_category: 'admin' },
  { name: 'Training', hmrc_category: 'training' },
  { name: 'Clothing & Uniform', hmrc_category: 'clothing' },
  { name: 'Other', hmrc_category: 'other' }
];

// Ensure default categories exist for a user
function ensureDefaultCategories(db, userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expense_categories WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      if (row.count > 0) return resolve();

      const stmt = db.prepare('INSERT OR IGNORE INTO expense_categories (user_id, name, hmrc_category) VALUES (?, ?, ?)');
      DEFAULT_CATEGORIES.forEach(cat => {
        stmt.run(userId, cat.name, cat.hmrc_category);
      });
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// --- Categories ---

// Get all categories
router.get('/categories', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  try {
    await ensureDefaultCategories(db, userId);
  } catch (err) {
    console.error('Error ensuring default categories:', err);
  }

  db.all(
    'SELECT * FROM expense_categories WHERE user_id = ? ORDER BY name ASC',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Create category
router.post('/categories', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { name, hmrc_category } = req.body;

  if (!name) return res.status(400).json({ error: 'Category name is required' });

  db.run(
    'INSERT INTO expense_categories (user_id, name, hmrc_category) VALUES (?, ?, ?)',
    [userId, name, hmrc_category || 'other'],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Category already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, name, hmrc_category });
    }
  );
});

// Update category
router.put('/categories/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  const { name, hmrc_category } = req.body;

  db.run(
    'UPDATE expense_categories SET name = ?, hmrc_category = ? WHERE id = ? AND user_id = ?',
    [name, hmrc_category, id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
      res.json({ message: 'Category updated' });
    }
  );
});

// Delete category
router.delete('/categories/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;

  db.run(
    'DELETE FROM expense_categories WHERE id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
      res.json({ message: 'Category deleted' });
    }
  );
});

// --- Expenses ---

// UK tax year helper
function getTaxYearDateRange(startYear) {
  const y = parseInt(startYear, 10);
  if (isNaN(y)) return null;
  return { from: `${y}-04-06`, to: `${y + 1}-04-05` };
}

// Get all expenses (with optional filters)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { tax_year, category_id, from, to } = req.query;

  let query = `
    SELECT e.*, ec.name as category_name, ec.hmrc_category
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.id
    WHERE e.user_id = ?
  `;
  const params = [userId];

  if (tax_year) {
    const range = getTaxYearDateRange(tax_year);
    if (range) {
      query += ' AND e.date >= ? AND e.date <= ?';
      params.push(range.from, range.to);
    }
  } else {
    if (from) { query += ' AND e.date >= ?'; params.push(from); }
    if (to) { query += ' AND e.date <= ?'; params.push(to); }
  }

  if (category_id) {
    query += ' AND e.category_id = ?';
    params.push(category_id);
  }

  query += ' ORDER BY e.date DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get single expense
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;

  // Skip if id matches a sub-route
  if (id === 'categories' || id === 'export') return;

  db.get(
    `SELECT e.*, ec.name as category_name, ec.hmrc_category
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     WHERE e.id = ? AND e.user_id = ?`,
    [id, userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Expense not found' });
      res.json(row);
    }
  );
});

// Create expense
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { date, description, category_id, amount, vendor, notes, receipt_path } = req.body;

  if (!date || !description || amount == null) {
    return res.status(400).json({ error: 'Date, description, and amount are required' });
  }

  db.run(
    `INSERT INTO expenses (user_id, date, description, category_id, amount, vendor, notes, receipt_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, date, description, category_id || null, parseFloat(amount), vendor || '', notes || '', receipt_path || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, date, description, category_id, amount, vendor, notes });
    }
  );
});

// Update expense
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  const { date, description, category_id, amount, vendor, notes, receipt_path } = req.body;

  db.run(
    `UPDATE expenses SET date = ?, description = ?, category_id = ?, amount = ?, vendor = ?, notes = ?, receipt_path = ?
     WHERE id = ? AND user_id = ?`,
    [date, description, category_id || null, parseFloat(amount), vendor || '', notes || '', receipt_path || null, id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
      res.json({ message: 'Expense updated' });
    }
  );
});

// Delete expense
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;

  db.run(
    'DELETE FROM expenses WHERE id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
      res.json({ message: 'Expense deleted' });
    }
  );
});

// Export expenses as CSV
router.get('/export/csv', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { tax_year } = req.query;

  let query = `
    SELECT e.date, e.description, ec.name as category, e.amount, e.vendor, e.notes
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.id
    WHERE e.user_id = ?
  `;
  const params = [userId];

  if (tax_year) {
    const range = getTaxYearDateRange(tax_year);
    if (range) {
      query += ' AND e.date >= ? AND e.date <= ?';
      params.push(range.from, range.to);
    }
  }

  query += ' ORDER BY e.date ASC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const header = 'Date,Description,Category,Amount,Vendor,Notes\n';
    const csv = rows.map(r =>
      `${r.date},"${(r.description || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",${r.amount},"${(r.vendor || '').replace(/"/g, '""')}","${(r.notes || '').replace(/"/g, '""')}"`
    ).join('\n');

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${tax_year || date}.csv"`);
    res.send(header + csv);
  });
});

export default router;
