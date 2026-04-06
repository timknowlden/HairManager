import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

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
