import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

// ── CSV Parser (RFC 4180 compliant) ──
function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];

  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = [];
        current = '';
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }
  // Last row
  row.push(current.trim());
  if (row.some(cell => cell !== '')) rows.push(row);

  return rows;
}

// ── Bank Format Definitions ──
const BANK_FORMATS = {
  barclays: {
    name: 'Barclays',
    headerPatterns: ['Number', 'Date', 'Account', 'Amount', 'Subcategory', 'Memo'],
    dateCol: 1,
    descriptionCol: 5, // Memo
    amountCol: 3,
    dateFormat: 'DD/MM/YYYY',
  },
  lloyds: {
    name: 'Lloyds / Halifax',
    headerPatterns: ['Transaction Date', 'Transaction Type', 'Sort Code', 'Account Number', 'Transaction Description', 'Debit Amount', 'Credit Amount', 'Balance'],
    dateCol: 0,
    descriptionCol: 4,
    creditCol: 6,
    debitCol: 5,
    balanceCol: 7,
    dateFormat: 'DD/MM/YYYY',
  },
  natwest: {
    name: 'NatWest / RBS',
    headerPatterns: ['Date', 'Type', 'Description', 'Value', 'Balance', 'Account Name', 'Account Number'],
    dateCol: 0,
    descriptionCol: 2,
    amountCol: 3,
    balanceCol: 4,
    dateFormat: 'DD/MM/YYYY',
  },
  hsbc: {
    name: 'HSBC',
    headerPatterns: ['Date', 'Description', 'Amount'],
    dateCol: 0,
    descriptionCol: 1,
    amountCol: 2,
    dateFormat: 'DD/MM/YYYY',
  },
  monzo: {
    name: 'Monzo',
    headerPatterns: ['Transaction ID', 'Date', 'Time', 'Type', 'Name', 'Emoji', 'Category', 'Amount', 'Currency'],
    dateCol: 1,
    descriptionCol: 4, // Name
    amountCol: 7,
    dateFormat: 'DD/MM/YYYY',
  },
  starling: {
    name: 'Starling',
    headerPatterns: ['Date', 'Counter Party', 'Reference', 'Type', 'Amount'],
    dateCol: 0,
    descriptionCol: 1,
    referenceCol: 2,
    amountCol: 4,
    dateFormat: 'DD/MM/YYYY',
  },
  generic: {
    name: 'Generic',
    dateCol: 0,
    descriptionCol: 1,
    amountCol: 2,
    dateFormat: 'DD/MM/YYYY',
  }
};

function detectBankFormat(headerRow) {
  const headerLower = headerRow.map(h => h.toLowerCase().trim());

  for (const [key, fmt] of Object.entries(BANK_FORMATS)) {
    if (key === 'generic') continue;
    const patterns = fmt.headerPatterns.map(p => p.toLowerCase());
    // Check if most pattern words appear in the header
    const matchCount = patterns.filter(p => headerLower.some(h => h.includes(p))).length;
    if (matchCount >= Math.ceil(patterns.length * 0.6)) {
      return key;
    }
  }

  // Try to detect by common column names
  if (headerLower.includes('date') && (headerLower.includes('amount') || headerLower.includes('credit amount') || headerLower.includes('value'))) {
    return 'generic';
  }

  return null;
}

function parseDate(dateStr, format) {
  if (!dateStr) return null;
  dateStr = dateStr.trim();

  // Try DD/MM/YYYY
  const dmy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD
  const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }

  // Try DD Mon YYYY (e.g. "14 Apr 2026")
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const dMonY = dateStr.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (dMonY && months[dMonY[2].toLowerCase()]) {
    return `${dMonY[3]}-${months[dMonY[2].toLowerCase()]}-${dMonY[1].padStart(2, '0')}`;
  }

  return null;
}

function parseAmount(value) {
  if (!value || typeof value !== 'string') return NaN;
  // Remove currency symbols, commas, spaces
  const cleaned = value.replace(/[£$€,\s]/g, '');
  return parseFloat(cleaned);
}

function extractTransaction(row, format) {
  const fmt = BANK_FORMATS[format] || BANK_FORMATS.generic;

  const dateStr = row[fmt.dateCol];
  const date = parseDate(dateStr, fmt.dateFormat);
  if (!date) return null;

  const description = row[fmt.descriptionCol] || '';
  const reference = fmt.referenceCol != null ? (row[fmt.referenceCol] || '') : '';

  let amount, transactionType;

  if (fmt.creditCol != null && fmt.debitCol != null) {
    // Separate credit/debit columns (Lloyds style)
    const credit = parseAmount(row[fmt.creditCol]);
    const debit = parseAmount(row[fmt.debitCol]);
    if (!isNaN(credit) && credit > 0) {
      amount = credit;
      transactionType = 'credit';
    } else if (!isNaN(debit) && debit > 0) {
      amount = debit;
      transactionType = 'debit';
    } else {
      return null;
    }
  } else {
    // Single amount column
    const val = parseAmount(row[fmt.amountCol]);
    if (isNaN(val)) return null;
    amount = Math.abs(val);
    transactionType = val > 0 ? 'credit' : 'debit';
  }

  const balance = fmt.balanceCol != null ? parseAmount(row[fmt.balanceCol]) : null;

  return {
    transaction_date: date,
    description: description + (reference ? ' ' + reference : ''),
    reference,
    amount,
    transaction_type: transactionType,
    balance: isNaN(balance) ? null : balance,
    raw_row: row.join(','),
  };
}

// ── Helper: promisify db calls ──
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ── POST /upload — Upload and parse CSV ──
router.post('/upload', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { csvData, filename, formatOverride, columnMapping } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: 'No CSV data provided' });
    }

    const rows = parseCSV(csvData);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV file appears empty or invalid' });
    }

    const headerRow = rows[0];
    let format = formatOverride || detectBankFormat(headerRow);

    if (!format) {
      return res.status(400).json({
        error: 'Could not detect bank format',
        headers: headerRow,
        needsMapping: true,
        supportedFormats: Object.entries(BANK_FORMATS).map(([k, v]) => ({ id: k, name: v.name }))
      });
    }

    // If custom column mapping provided, create a temporary format
    if (columnMapping) {
      BANK_FORMATS._custom = {
        name: 'Custom',
        dateCol: columnMapping.dateCol,
        descriptionCol: columnMapping.descriptionCol,
        amountCol: columnMapping.amountCol,
        creditCol: columnMapping.creditCol,
        debitCol: columnMapping.debitCol,
        balanceCol: columnMapping.balanceCol,
        dateFormat: 'DD/MM/YYYY',
      };
      format = '_custom';
    }

    // Create upload record
    const result = await dbRun(db,
      'INSERT INTO bank_statement_uploads (user_id, filename, bank_format) VALUES (?, ?, ?)',
      [req.userId, filename || 'upload.csv', BANK_FORMATS[format]?.name || format]
    );
    const uploadId = result.lastID;

    // Parse transactions (skip header row)
    const dataRows = rows.slice(1);
    let creditCount = 0;
    let totalCredits = 0;

    for (const row of dataRows) {
      const txn = extractTransaction(row, format);
      if (!txn) continue;

      // Only store credit/incoming transactions
      if (txn.transaction_type !== 'credit') continue;

      await dbRun(db, `
        INSERT INTO bank_transactions (user_id, upload_id, transaction_date, description, reference, amount, transaction_type, balance, raw_row)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [req.userId, uploadId, txn.transaction_date, txn.description, txn.reference, txn.amount, txn.transaction_type, txn.balance, txn.raw_row]);

      creditCount++;
      totalCredits += txn.amount;
    }

    await dbRun(db, 'UPDATE bank_statement_uploads SET row_count = ? WHERE id = ?', [creditCount, uploadId]);

    // Clean up custom format
    delete BANK_FORMATS._custom;

    res.json({
      uploadId,
      format: BANK_FORMATS[format]?.name || format,
      totalRows: dataRows.length,
      creditTransactions: creditCount,
      totalCredits: Math.round(totalCredits * 100) / 100,
    });
  } catch (err) {
    console.error('[Bank Reconciliation] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:uploadId/match — Run matching engine ──
router.post('/:uploadId/match', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { uploadId } = req.params;

    // Get unmatched transactions for this upload
    const transactions = await dbAll(db,
      "SELECT * FROM bank_transactions WHERE upload_id = ? AND user_id = ? AND match_status = 'unmatched'",
      [uploadId, req.userId]
    );

    if (transactions.length === 0) {
      return res.json({ matched: 0, total: 0, transactions: [] });
    }

    // Get all unpaid appointments
    const unpaidApts = await dbAll(db,
      'SELECT id, client_name, service, date, location, price FROM appointments WHERE user_id = ? AND paid = 0',
      [req.userId]
    );

    // Build invoice groups (appointments grouped by date+location)
    const invoiceGroups = {};
    for (const apt of unpaidApts) {
      const key = `${apt.date}|${apt.location}`;
      if (!invoiceGroups[key]) {
        invoiceGroups[key] = { date: apt.date, location: apt.location, appointments: [], total: 0 };
      }
      invoiceGroups[key].appointments.push(apt);
      invoiceGroups[key].total += apt.price;
    }

    // Round group totals
    for (const g of Object.values(invoiceGroups)) {
      g.total = Math.round(g.total * 100) / 100;
    }

    // Get unique client names for name matching
    const clientNames = [...new Set(unpaidApts.map(a => a.client_name.toLowerCase()))];

    let matchedCount = 0;

    for (const txn of transactions) {
      const desc = (txn.description || '').toLowerCase() + ' ' + (txn.reference || '').toLowerCase();
      const txnAmount = Math.round(txn.amount * 100) / 100;
      let matched = false;

      // 1. Look for invoice numbers (appointment IDs) in description
      const numbers = desc.match(/\b\d+\b/g) || [];
      for (const numStr of numbers) {
        const aptId = parseInt(numStr);
        const apt = unpaidApts.find(a => a.id === aptId);
        if (!apt) continue;

        // Found an appointment ID reference — check the invoice group
        const groupKey = `${apt.date}|${apt.location}`;
        const group = invoiceGroups[groupKey];
        if (!group) continue;

        if (Math.abs(txnAmount - group.total) <= 0.01) {
          // Amount matches full invoice group — HIGH confidence
          await dbRun(db, `
            UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'high',
            matched_appointment_id = ?, matched_invoice_group = ? WHERE id = ?
          `, [apt.id, JSON.stringify({ date: apt.date, location: apt.location, appointmentIds: group.appointments.map(a => a.id) }), txn.id]);
          matched = true;
          matchedCount++;
          break;
        } else if (Math.abs(txnAmount - apt.price) <= 0.01) {
          // Amount matches single appointment — MEDIUM confidence
          await dbRun(db, `
            UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'medium',
            matched_appointment_id = ? WHERE id = ?
          `, [apt.id, txn.id]);
          matched = true;
          matchedCount++;
          break;
        }
      }

      if (matched) continue;

      // 2. Search for client names in description
      for (const name of clientNames) {
        if (name.length < 3) continue; // Skip very short names
        if (desc.includes(name)) {
          const clientApts = unpaidApts.filter(a => a.client_name.toLowerCase() === name);
          // Check if amount matches any of this client's unpaid appointments or groups
          for (const apt of clientApts) {
            const groupKey = `${apt.date}|${apt.location}`;
            const group = invoiceGroups[groupKey];
            if (group && Math.abs(txnAmount - group.total) <= 0.01) {
              await dbRun(db, `
                UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'medium',
                matched_appointment_id = ?, matched_invoice_group = ? WHERE id = ?
              `, [apt.id, JSON.stringify({ date: apt.date, location: apt.location, appointmentIds: group.appointments.map(a => a.id) }), txn.id]);
              matched = true;
              matchedCount++;
              break;
            }
            if (Math.abs(txnAmount - apt.price) <= 0.01) {
              await dbRun(db, `
                UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'medium',
                matched_appointment_id = ? WHERE id = ?
              `, [apt.id, txn.id]);
              matched = true;
              matchedCount++;
              break;
            }
          }
          if (matched) break;
        }
      }

      if (matched) continue;

      // 3. Amount-only matching — LOW confidence
      // Check against invoice group totals
      for (const group of Object.values(invoiceGroups)) {
        if (Math.abs(txnAmount - group.total) <= 0.01) {
          const firstApt = group.appointments[0];
          await dbRun(db, `
            UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'low',
            matched_appointment_id = ?, matched_invoice_group = ? WHERE id = ?
          `, [firstApt.id, JSON.stringify({ date: group.date, location: group.location, appointmentIds: group.appointments.map(a => a.id) }), txn.id]);
          matched = true;
          matchedCount++;
          break;
        }
      }

      if (matched) continue;

      // Check against individual appointment prices (only if unique price match)
      const priceMatches = unpaidApts.filter(a => Math.abs(txnAmount - a.price) <= 0.01);
      if (priceMatches.length === 1) {
        await dbRun(db, `
          UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'low',
          matched_appointment_id = ? WHERE id = ?
        `, [priceMatches[0].id, txn.id]);
        matchedCount++;
      }
    }

    // Update upload stats
    await dbRun(db, 'UPDATE bank_statement_uploads SET matched_count = ? WHERE id = ?', [matchedCount, uploadId]);

    // Return updated transactions
    const updatedTxns = await dbAll(db,
      'SELECT * FROM bank_transactions WHERE upload_id = ? AND user_id = ? ORDER BY transaction_date ASC',
      [uploadId, req.userId]
    );

    // Enrich with appointment details
    for (const txn of updatedTxns) {
      if (txn.matched_appointment_id) {
        txn.matched_appointment = await dbGet(db,
          'SELECT id, client_name, service, date, location, price FROM appointments WHERE id = ?',
          [txn.matched_appointment_id]
        );
      }
      if (txn.matched_invoice_group) {
        try {
          const group = JSON.parse(txn.matched_invoice_group);
          if (group.appointmentIds) {
            const placeholders = group.appointmentIds.map(() => '?').join(',');
            txn.matched_appointments = await dbAll(db,
              `SELECT id, client_name, service, date, location, price FROM appointments WHERE id IN (${placeholders})`,
              group.appointmentIds
            );
          }
        } catch {}
      }
    }

    res.json({ matched: matchedCount, total: transactions.length, transactions: updatedTxns });
  } catch (err) {
    console.error('[Bank Reconciliation] Match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /uploads — List previous uploads ──
router.get('/uploads', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const uploads = await dbAll(db,
      'SELECT * FROM bank_statement_uploads WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(uploads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:uploadId/transactions — Get transactions for an upload ──
router.get('/:uploadId/transactions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const transactions = await dbAll(db,
      'SELECT * FROM bank_transactions WHERE upload_id = ? AND user_id = ? ORDER BY transaction_date ASC',
      [req.params.uploadId, req.userId]
    );

    // Enrich with appointment details
    for (const txn of transactions) {
      if (txn.matched_appointment_id) {
        txn.matched_appointment = await dbGet(db,
          'SELECT id, client_name, service, date, location, price FROM appointments WHERE id = ?',
          [txn.matched_appointment_id]
        );
      }
      if (txn.matched_invoice_group) {
        try {
          const group = JSON.parse(txn.matched_invoice_group);
          if (group.appointmentIds) {
            const placeholders = group.appointmentIds.map(() => '?').join(',');
            txn.matched_appointments = await dbAll(db,
              `SELECT id, client_name, service, date, location, price FROM appointments WHERE id IN (${placeholders})`,
              group.appointmentIds
            );
          }
        } catch {}
      }
    }

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:uploadId/apply — Confirm and apply matches ──
router.post('/:uploadId/apply', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { matches } = req.body; // [{ transactionId, appointmentIds }]

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: 'No matches provided' });
    }

    let appliedCount = 0;

    for (const { transactionId, appointmentIds } of matches) {
      // Get the transaction to use its date as payment_date
      const txn = await dbGet(db,
        'SELECT * FROM bank_transactions WHERE id = ? AND user_id = ?',
        [transactionId, req.userId]
      );
      if (!txn || txn.match_status === 'applied') continue;

      const paymentDate = txn.transaction_date;

      // Mark appointments as paid
      for (const aptId of appointmentIds) {
        await dbRun(db,
          'UPDATE appointments SET paid = 1, payment_date = ? WHERE id = ? AND user_id = ?',
          [paymentDate, aptId, req.userId]
        );
      }

      // Mark transaction as applied
      await dbRun(db,
        "UPDATE bank_transactions SET match_status = 'applied', applied_at = datetime('now') WHERE id = ?",
        [transactionId]
      );
      appliedCount++;
    }

    // Update upload stats
    const stats = await dbGet(db,
      "SELECT COUNT(*) as applied FROM bank_transactions WHERE upload_id = ? AND match_status = 'applied'",
      [req.params.uploadId]
    );
    await dbRun(db,
      "UPDATE bank_statement_uploads SET applied_count = ?, status = 'applied' WHERE id = ?",
      [stats.applied, req.params.uploadId]
    );

    res.json({ applied: appliedCount });
  } catch (err) {
    console.error('[Bank Reconciliation] Apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:uploadId/ignore — Mark transactions as ignored ──
router.post('/:uploadId/ignore', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { transactionIds } = req.body;

    if (!transactionIds || !Array.isArray(transactionIds)) {
      return res.status(400).json({ error: 'No transaction IDs provided' });
    }

    for (const id of transactionIds) {
      await dbRun(db,
        "UPDATE bank_transactions SET match_status = 'ignored' WHERE id = ? AND user_id = ?",
        [id, req.userId]
      );
    }

    res.json({ ignored: transactionIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
