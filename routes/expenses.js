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
  const { date, description, category_id, amount, vendor, notes, receipt_path, force } = req.body;

  if (!date || !description || amount == null) {
    return res.status(400).json({ error: 'Date, description, and amount are required' });
  }

  const parsedAmount = parseFloat(amount);

  const insertExpense = () => {
    db.run(
      `INSERT INTO expenses (user_id, date, description, category_id, amount, vendor, notes, receipt_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, date, description, category_id || null, parsedAmount, vendor || '', notes || '', receipt_path || null],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, date, description, category_id, amount, vendor, notes });
      }
    );
  };

  if (force) {
    return insertExpense();
  }

  // Check for an existing expense on the same date with the same amount
  db.get(
    `SELECT e.*, ec.name as category_name FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     WHERE e.user_id = ? AND e.date = ? AND ABS(e.amount - ?) < 0.005
     LIMIT 1`,
    [userId, date, parsedAmount],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) {
        return res.status(409).json({
          error: 'duplicate',
          existing,
          // Frontend will format the amount with the user's currency symbol
          duplicateAmount: parsedAmount,
        });
      }
      insertExpense();
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

// ── Import expenses from Amazon/eBay CSV ──
const ORDER_FORMATS = {
  amazon: {
    name: 'Amazon',
    headerPatterns: ['Order ID', 'Order Date', 'Title', 'Total Owed'],
    // Amazon Order History Report columns
    detect: (headers) => headers.some(h => h.toLowerCase().includes('order id')) && headers.some(h => h.toLowerCase().includes('title')),
    extract: (row, headers) => {
      const get = (name) => {
        const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        return idx >= 0 ? row[idx] : '';
      };
      const amount = parseFloat((get('Total Owed') || get('Item Total') || get('Grand Total') || get('Total') || '0').replace(/[£$€,]/g, ''));
      return {
        date: parseOrderDate(get('Order Date') || get('Date')),
        description: get('Title') || get('Product Name') || get('Item'),
        amount: isNaN(amount) ? 0 : amount,
        vendor: 'Amazon',
        notes: `Order: ${get('Order ID')}`,
        orderId: get('Order ID'),
      };
    }
  },
  ebay: {
    name: 'eBay',
    headerPatterns: ['Order number', 'Item title', 'Total'],
    detect: (headers) => headers.some(h => h.toLowerCase().includes('order number')) && headers.some(h => h.toLowerCase().includes('item title')),
    extract: (row, headers) => {
      const get = (name) => {
        const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        return idx >= 0 ? row[idx] : '';
      };
      const amount = parseFloat((get('Total') || get('Item total') || get('Amount') || '0').replace(/[£$€,]/g, ''));
      return {
        date: parseOrderDate(get('Order date') || get('Date') || get('Purchase date')),
        description: get('Item title') || get('Title'),
        amount: isNaN(amount) ? 0 : amount,
        vendor: get('Seller') || 'eBay',
        notes: `Order: ${get('Order number')}`,
        orderId: get('Order number'),
      };
    }
  }
};

function parseOrderDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  dateStr = dateStr.trim();
  // DD/MM/YYYY
  const dmy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // YYYY-MM-DD
  const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  // Month DD, YYYY (Amazon US format: "January 15, 2026")
  const months = { january:'01', february:'02', march:'03', april:'04', may:'05', june:'06', july:'07', august:'08', september:'09', october:'10', november:'11', december:'12' };
  const mdy = dateStr.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (mdy && months[mdy[1].toLowerCase()]) return `${mdy[3]}-${months[mdy[1].toLowerCase()]}-${mdy[2].padStart(2, '0')}`;
  // DD Mon YYYY
  const shortMonths = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const dMonY = dateStr.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (dMonY && shortMonths[dMonY[2].toLowerCase()]) return `${dMonY[3]}-${shortMonths[dMonY[2].toLowerCase()]}-${dMonY[1].padStart(2, '0')}`;
  return new Date().toISOString().split('T')[0];
}

function parseCSVSimple(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = []; current = '';
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

router.post('/import-csv', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { csvData, source, defaultCategoryId } = req.body;

  if (!csvData) {
    return res.status(400).json({ error: 'No CSV data provided' });
  }

  try {
    const rows = parseCSVSimple(csvData);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV file appears empty' });
    }

    const headers = rows[0];

    // Detect format
    let format = null;
    if (source && ORDER_FORMATS[source]) {
      format = ORDER_FORMATS[source];
    } else {
      for (const [, fmt] of Object.entries(ORDER_FORMATS)) {
        if (fmt.detect(headers)) {
          format = fmt;
          break;
        }
      }
    }

    if (!format) {
      return res.status(400).json({
        error: 'Could not detect CSV format. Please ensure this is an Amazon or eBay order export.',
        headers,
      });
    }

    // Get or default category
    let categoryId = defaultCategoryId || null;
    if (!categoryId) {
      // Try to find "Supplies & Materials" category
      const cat = await new Promise((resolve, reject) => {
        db.get("SELECT id FROM expense_categories WHERE user_id = ? AND name = 'Supplies & Materials'", [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      categoryId = cat?.id || null;
    }

    const dataRows = rows.slice(1);
    let imported = 0;
    let skipped = 0;
    const results = [];

    for (const row of dataRows) {
      const item = format.extract(row, headers);
      if (!item.description || item.amount <= 0) {
        skipped++;
        continue;
      }

      // Check for duplicate (same date + description + amount)
      const existing = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id FROM expenses WHERE user_id = ? AND date = ? AND description = ? AND amount = ?',
          [userId, item.date, item.description, item.amount],
          (err, row) => { if (err) reject(err); else resolve(row); }
        );
      });

      if (existing) {
        skipped++;
        results.push({ ...item, status: 'duplicate' });
        continue;
      }

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO expenses (user_id, date, description, amount, vendor, notes, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, item.date, item.description, item.amount, item.vendor, item.notes, categoryId],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      imported++;
      results.push({ ...item, status: 'imported' });
    }

    res.json({
      source: format.name,
      total: dataRows.length,
      imported,
      skipped,
      results,
    });
  } catch (err) {
    console.error('[Expenses] Import CSV error:', err);
    res.status(500).json({ error: err.message });
  }
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
