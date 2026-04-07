import express from 'express';
import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { authenticateToken } from '../middleware/auth.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate invoice PDF for unpaid appointments
function generateUnpaidInvoicePdf(invoiceNumber, appointments, profile, location) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = '#74c9cb';
    const textDark = '#333333';
    const textLight = '#666666';
    const currency = profile?.currency || 'GBP';
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
    const formatPrice = (n) => `${sym} ${(n || 0).toFixed(2)}`;
    const formatDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const formatSortCode = (sc) => {
      if (!sc) return '';
      const c = sc.replace(/\D/g, '');
      return c.length === 6 ? `${c.slice(0,2)} ${c.slice(2,4)} ${c.slice(4,6)}` : sc;
    };

    const businessName = profile?.business_name || profile?.name || 'Business';
    const total = appointments.reduce((s, a) => s + (a.price || 0), 0);
    const today = formatDate(new Date().toISOString());
    const visitDate = appointments[0]?.date ? formatDate(appointments[0].date) : today;

    // --- HEADER ---
    doc.fontSize(22).fillColor(textDark).font('Helvetica-Bold').text(businessName, 50, 50);
    if (profile?.business_service_description) {
      doc.fontSize(11).fillColor(textLight).font('Helvetica-Oblique').text(profile.business_service_description);
    }
    doc.font('Helvetica').fontSize(10).fillColor(textLight);
    if (profile?.home_address) doc.text(profile.home_address);
    if (profile?.home_postcode) doc.text(profile.home_postcode);
    if (profile?.phone) doc.text(profile.phone);
    const contactLine = [profile?.email, profile?.website].filter(Boolean).join(' | ');
    if (contactLine) doc.text(contactLine);

    // Invoice title - right aligned
    doc.fontSize(32).fillColor(accent).font('Helvetica-Bold').text('INVOICE', 350, 50, { width: 200, align: 'right' });
    doc.fontSize(10).fillColor(textDark).font('Helvetica');
    doc.text(`Invoice #: ${invoiceNumber}`, 350, 90, { width: 200, align: 'right' });
    doc.text(`Date: ${today}`, 350, 105, { width: 200, align: 'right' });
    doc.text(`Payment Reminder`, 350, 120, { width: 200, align: 'right' });

    // Divider
    const divY = Math.max(doc.y, 140) + 10;
    doc.moveTo(50, divY).lineTo(545, divY).strokeColor(accent).lineWidth(2).stroke();

    // --- TO / FOR ---
    let y = divY + 15;
    doc.fontSize(9).fillColor(accent).font('Helvetica-Bold').text('TO', 50, y);
    doc.text('FOR', 300, y);
    y += 14;
    doc.fontSize(10).fillColor(textDark).font('Helvetica');
    const locName = location?.location_name || appointments[0]?.location || '';
    doc.text(locName, 50, y);
    doc.text('Hairdressing or Nail Services', 300, y);
    if (location) {
      const addr = [location.address, location.city_town, location.post_code].filter(Boolean).join(', ');
      if (addr) doc.text(addr, 50, y + 14);
    }

    // --- TABLE ---
    y = Math.max(doc.y, y + 30) + 15;

    // Header row
    doc.rect(50, y, 495, 22).fill('#f8f9fa').stroke();
    doc.fontSize(9).fillColor(textDark).font('Helvetica-Bold');
    doc.text('Service Description', 55, y + 6, { width: 280 });
    doc.text('Date', 340, y + 6, { width: 80 });
    doc.text('Amount', 430, y + 6, { width: 110, align: 'right' });
    doc.moveTo(50, y + 22).lineTo(545, y + 22).strokeColor(accent).lineWidth(2).stroke();
    y += 26;

    // Data rows
    doc.font('Helvetica').fontSize(9).fillColor(textDark);
    appointments.forEach((apt, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.text(`${apt.client_name} - ${apt.service}`, 55, y, { width: 280 });
      doc.text(formatDate(apt.date), 340, y, { width: 80 });
      doc.text(formatPrice(apt.price), 430, y, { width: 110, align: 'right' });
      y += 18;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
      y += 4;
    });

    // Total
    y += 5;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(accent).lineWidth(2).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Total Outstanding', 55, y, { width: 370 });
    doc.text(formatPrice(total), 430, y, { width: 110, align: 'right' });

    // --- FOOTER ---
    y += 35;
    if (y > 680) { doc.addPage(); y = 50; }

    doc.font('Helvetica').fontSize(9).fillColor(textLight);
    doc.text(`Make all checks payable to ${businessName}`, 50, y);
    doc.text('Payment is due within 30 days.', 50, y + 14);

    if (profile?.bank_account_name) {
      y += 32;
      doc.text(`BACS: ${profile.bank_account_name} – account number: ${profile.account_number || ''} – sort code: ${formatSortCode(profile.sort_code)}`, 50, y);
    }

    y += 18;
    doc.text('Please use Invoice Number or Client Name as Reference', 50, y);

    y += 22;
    doc.text(`If you have any questions concerning this invoice, contact`, 50, y);
    const contact = [profile?.name, profile?.phone, profile?.email].filter(Boolean).join(' | ');
    doc.text(contact, 50, y + 14);

    y += 35;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(accent);
    doc.text('Thank you for your business!', 50, y);

    doc.end();
  });
}

const router = express.Router();

// Webhook route doesn't require authentication (Resend calls it)
// GET handler for testing webhook endpoint
router.get('/webhook', (req, res) => {
  res.json({ 
    message: 'Resend webhook endpoint is active. Resend will POST events here.',
    method: 'POST',
    note: 'This endpoint does not require authentication for Resend webhooks'
  });
});

// POST handler for Resend webhook events
// Resend sends individual events (not arrays like SendGrid)
// Event types: email.sent, email.delivered, email.delivery_delayed,
//   email.complained, email.bounced, email.opened, email.clicked
router.post('/webhook', express.json(), async (req, res) => {
  const db = req.app.locals.db;
  
  const webhookReceivedAt = new Date().toISOString();
  console.log('\n[WEBHOOK] ========================================');
  console.log('[WEBHOOK] Webhook received at:', webhookReceivedAt);
  console.log('[WEBHOOK] Content-Type:', req.headers['content-type']);
  
  const event = req.body;
  const eventJson = JSON.stringify(event);
  console.log('[WEBHOOK] Event JSON:', eventJson);
  console.log('[WEBHOOK] ========================================\n');
  
  try {
    // Resend webhook payload structure:
    // { type: "email.delivered", created_at: "...", data: { email_id: "...", to: [...], ... } }
    const eventType = event.type;
    const eventData = event.data || {};
    const emailId = eventData.email_id;
    const toEmails = eventData.to || [];
    const createdAt = event.created_at || new Date().toISOString();
    
    console.log(`[WEBHOOK] Event type: ${eventType}`);
    console.log(`[WEBHOOK] Email ID: ${emailId}`);
    console.log(`[WEBHOOK] To: ${toEmails.join(', ')}`);
    
    if (!emailId) {
      console.warn('[WEBHOOK] No email_id found in event');
      return res.status(200).json({ success: true, message: 'No email_id in event' });
    }
    
    // Map Resend event types to our status
    let logStatus = null;
    if (eventType === 'email.sent') {
      logStatus = 'sent';
    } else if (eventType === 'email.delivered') {
      logStatus = 'delivered';
    } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
      logStatus = 'failed';
    } else if (eventType === 'email.delivery_delayed') {
      logStatus = 'sent'; // Keep as sent, it's still in transit
    } else if (eventType === 'email.opened') {
      logStatus = 'opened';
    } else if (eventType === 'email.clicked') {
      logStatus = 'opened'; // Clicked implies opened
    }
    
    if (!logStatus) {
      console.log(`[WEBHOOK] No status mapping for event type: ${eventType}, acknowledging`);
      return res.status(200).json({ success: true, skipped: true });
    }
    
    const now = createdAt;
    const errorMsg = eventType === 'email.bounced' ? (eventData.bounce?.message || 'Email bounced') : 
                     eventType === 'email.complained' ? 'Recipient marked as spam' : null;
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process each recipient
    for (const recipientEmail of toEmails) {
      // Check current status to respect hierarchy
      const currentRow = await new Promise((resolve) => {
        db.get(
          `SELECT id, status, user_id FROM email_logs 
           WHERE sendgrid_message_id = ? AND recipient_email = ?
           LIMIT 1`,
          [emailId, recipientEmail],
          (err, row) => {
            if (err) {
              console.error('[WEBHOOK] Error checking current status:', err);
              resolve(null);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      if (!currentRow) {
        // Try matching by just the email_id (message ID) without recipient
        const fallbackRow = await new Promise((resolve) => {
          db.get(
            `SELECT id, status, user_id FROM email_logs 
             WHERE sendgrid_message_id = ?
             LIMIT 1`,
            [emailId],
            (err, row) => {
              if (err) {
                console.error('[WEBHOOK] Error in fallback lookup:', err);
                resolve(null);
              } else {
                resolve(row);
              }
            }
          );
        });
        
        if (!fallbackRow) {
          skippedCount++;
          console.warn(`[WEBHOOK] No email log found for email_id: ${emailId}, recipient: ${recipientEmail}`);
          continue;
        }
        
        // Use fallback row
        await processStatusUpdate(db, fallbackRow, logStatus, errorMsg, now, eventJson, emailId, webhookReceivedAt, eventType);
        updatedCount++;
        continue;
      }
      
      // Store webhook event
      db.run(
        `INSERT INTO webhook_events 
         (email_log_id, user_id, event_type, sendgrid_message_id, sendgrid_event_id, raw_event_data, processed_at, event_timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          currentRow.id,
          currentRow.user_id,
          eventType,
          emailId,
          null,
          eventJson,
          webhookReceivedAt,
          null
        ],
        (err) => {
          if (err) {
            console.error('[WEBHOOK] Error storing webhook event:', err);
          }
        }
      );
      
      // Respect status hierarchy
      const statusHierarchy = { 'pending': 0, 'sent': 1, 'delivered': 2, 'opened': 3, 'failed': 0 };
      const currentLevel = statusHierarchy[currentRow.status] || 0;
      const newLevel = statusHierarchy[logStatus] || 0;
      
      // For "opened", require "delivered" first
      if (logStatus === 'opened' && currentRow.status !== 'delivered') {
        console.log(`[WEBHOOK] Skipping "opened" - current status "${currentRow.status}" must be "delivered" first`);
        skippedCount++;
        continue;
      }
      
      // Don't downgrade (except failed can overwrite anything)
      if (newLevel <= currentLevel && logStatus !== 'failed') {
        console.log(`[WEBHOOK] Skipping - current status "${currentRow.status}" is higher than "${logStatus}"`);
        skippedCount++;
        continue;
      }
      
      // Update the email log
      const updateResult = await new Promise((resolve) => {
        db.run(
          `UPDATE email_logs 
           SET status = ?, error_message = ?, updated_at = ?, webhook_event_data = ?
           WHERE id = ?`,
          [logStatus, errorMsg, now, eventJson, currentRow.id],
          function(updateErr) {
            if (updateErr) {
              console.error('[WEBHOOK] Error updating email log:', updateErr);
              resolve(false);
            } else {
              console.log(`[WEBHOOK] Updated email log ${currentRow.id}: ${currentRow.status} -> ${logStatus}`);
              resolve(this.changes > 0);
            }
          }
        );
      });
      
      if (updateResult) {
        updatedCount++;
        
        // If just set to "delivered", check for pending open events
        if (logStatus === 'delivered') {
          const pendingOpen = await new Promise((resolve) => {
            db.get(
              `SELECT id, raw_event_data FROM webhook_events 
               WHERE email_log_id = ? AND event_type IN ('email.opened', 'email.clicked')
               ORDER BY processed_at DESC LIMIT 1`,
              [currentRow.id],
              (err, row) => resolve(err ? null : row)
            );
          });
          
          if (pendingOpen) {
            console.log(`[WEBHOOK] Found pending open event, applying now`);
            db.run(
              `UPDATE email_logs SET status = 'opened', updated_at = ?, webhook_event_data = ? WHERE id = ?`,
              [now, pendingOpen.raw_event_data, currentRow.id],
              (err) => {
                if (err) console.error('[WEBHOOK] Error applying pending open:', err);
                else console.log(`[WEBHOOK] Applied pending open to email_log_id=${currentRow.id}`);
              }
            );
          }
        }
      } else {
        skippedCount++;
      }
    }
    
    // If no recipients in the event, try to update by email_id alone
    if (toEmails.length === 0) {
      const result = await new Promise((resolve) => {
        db.run(
          `UPDATE email_logs SET status = ?, error_message = ?, updated_at = ?, webhook_event_data = ?
           WHERE sendgrid_message_id = ?`,
          [logStatus, errorMsg, now, eventJson, emailId],
          function(err) {
            if (err) {
              console.error('[WEBHOOK] Error updating by email_id:', err);
              resolve(0);
            } else {
              resolve(this.changes);
            }
          }
        );
      });
      updatedCount += result;
    }
    
    console.log(`\n[WEBHOOK] Summary: ${updatedCount} updated, ${skippedCount} skipped`);
    res.status(200).json({ success: true, updated: updatedCount, skipped: skippedCount });
  } catch (error) {
    console.error('\n[WEBHOOK] ERROR PROCESSING WEBHOOK:', error.message);
    console.error('[WEBHOOK] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

// Helper function to process a status update
async function processStatusUpdate(db, row, logStatus, errorMsg, now, eventJson, emailId, webhookReceivedAt, eventType) {
  // Store webhook event
  db.run(
    `INSERT INTO webhook_events 
     (email_log_id, user_id, event_type, sendgrid_message_id, sendgrid_event_id, raw_event_data, processed_at, event_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, eventType, emailId, null, eventJson, webhookReceivedAt, null],
    (err) => {
      if (err) console.error('[WEBHOOK] Error storing webhook event:', err);
    }
  );
  
  // Update the log
  return new Promise((resolve) => {
    db.run(
      `UPDATE email_logs SET status = ?, error_message = ?, updated_at = ?, webhook_event_data = ?
       WHERE id = ?`,
      [logStatus, errorMsg, now, eventJson, row.id],
      function(err) {
        if (err) {
          console.error('[WEBHOOK] Error updating email log:', err);
          resolve(false);
        } else {
          console.log(`[WEBHOOK] Updated fallback email log ${row.id} -> ${logStatus}`);
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// All other routes require authentication
router.use(authenticateToken);

// GET /api/email-logs - Get all email logs for the logged-in user
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM email_logs WHERE user_id = ? ORDER BY sent_at DESC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching email logs:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// GET /api/email-logs/invoice-status - Get paid status for all invoices
// IMPORTANT: Must be before /:id routes to avoid being caught by param matching
router.get('/invoice-status', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  db.all(
    "SELECT DISTINCT invoice_number FROM email_logs WHERE user_id = ? AND invoice_number IS NOT NULL AND invoice_number != ''",
    [userId],
    (err, invoices) => {
      if (err) return res.status(500).json({ error: err.message });
      if (invoices.length === 0) return res.json({});

      const results = {};
      let pending = invoices.length;

      invoices.forEach(({ invoice_number }) => {
        db.get(
          'SELECT date, location FROM appointments WHERE id = ? AND user_id = ?',
          [parseInt(invoice_number), userId],
          (err2, apt) => {
            if (err2 || !apt) {
              results[invoice_number] = { paid: false, total: 0, paidCount: 0, unpaidCount: 0 };
              if (--pending === 0) res.json(results);
              return;
            }

            db.all(
              'SELECT id, client_name, service, price, paid FROM appointments WHERE date = ? AND location = ? AND user_id = ?',
              [apt.date, apt.location, userId],
              (err3, allApts) => {
                if (err3 || !allApts) {
                  results[invoice_number] = { paid: false, total: 0, paidCount: 0, unpaidCount: 0 };
                } else {
                  const total = allApts.length;
                  const paidCount = allApts.filter(a => a.paid === 1).length;
                  const unpaidCount = total - paidCount;
                  const unpaidApts = allApts.filter(a => a.paid !== 1);
                  const unpaidTotal = unpaidApts.reduce((sum, a) => sum + (a.price || 0), 0);
                  results[invoice_number] = {
                    paid: unpaidCount === 0,
                    total,
                    paidCount,
                    unpaidCount,
                    unpaidTotal,
                    date: apt.date,
                    location: apt.location
                  };
                }
                if (--pending === 0) res.json(results);
              }
            );
          }
        );
      });
    }
  );
});

// GET /api/email-logs/:id/webhook-events - Get all webhook events for a specific email log
router.get('/:id/webhook-events', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  
  db.get(
    'SELECT id FROM email_logs WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, log) => {
      if (err) {
        console.error('Error verifying email log:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!log) {
        res.status(404).json({ error: 'Email log not found' });
        return;
      }
      
      db.all(
        `SELECT * FROM webhook_events 
         WHERE email_log_id = ? 
         ORDER BY processed_at ASC, event_timestamp ASC`,
        [id],
        (err, events) => {
          if (err) {
            console.error('Error fetching webhook events:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          res.json(events);
        }
      );
    }
  );
});

// GET /api/email-logs/:id - Get specific email log
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  
  db.get(
    'SELECT * FROM email_logs WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching email log:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'Email log not found' });
        return;
      }
      res.json(row);
    }
  );
});

// DELETE /api/email-logs/:id - Delete an email log
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  
  db.get(
    'SELECT id FROM email_logs WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, row) => {
      if (err) {
        console.error('Error checking email log:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (!row) {
        res.status(404).json({ error: 'Email log not found' });
        return;
      }
      
      db.run(
        'DELETE FROM webhook_events WHERE email_log_id = ?',
        [id],
        (webhookErr) => {
          if (webhookErr) {
            console.error('Error deleting webhook events:', webhookErr);
          }
          
          db.run(
            'DELETE FROM email_logs WHERE id = ? AND user_id = ?',
            [id, userId],
            function(deleteErr) {
              if (deleteErr) {
                console.error('Error deleting email log:', deleteErr);
                res.status(500).json({ error: deleteErr.message });
                return;
              }
              
              if (this.changes === 0) {
                res.status(404).json({ error: 'Email log not found' });
                return;
              }
              
              console.log(`[EMAIL LOGS] Deleted email log ${id} for user ${userId}`);
              res.json({ success: true, message: 'Email log deleted successfully' });
            }
          );
        }
      );
    }
  );
});

// GET /api/email-logs/pdf/:id - Serve PDF file
router.get('/pdf/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  
  db.get(
    'SELECT pdf_file_path FROM email_logs WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching email log:', err);
        return res.status(500).json({ error: err.message });
      }
      if (!row || !row.pdf_file_path) {
        return res.status(404).json({ error: 'PDF not found' });
      }
      
      try {
        const pdfData = readFileSync(row.pdf_file_path);
        res.contentType('application/pdf');
        res.send(pdfData);
      } catch (fileErr) {
        console.error('Error reading PDF file:', fileErr);
        res.status(500).json({ error: 'Failed to read PDF file' });
      }
    }
  );
});

// POST /api/email-logs/update-status - Update email status from webhook
router.post('/update-status', (req, res) => {
  const db = req.app.locals.db;
  const { messageId, eventId, status, errorMessage } = req.body;
  
  if (!messageId) {
    return res.status(400).json({ error: 'messageId is required' });
  }
  
  const now = new Date().toISOString();
  db.run(
    `UPDATE email_logs 
     SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
     WHERE sendgrid_message_id = ?`,
    [status || 'unknown', eventId || null, errorMessage || null, now, messageId],
    function(err) {
      if (err) {
        console.error('Error updating email log status:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        console.warn('No email log found with messageId:', messageId);
        res.status(404).json({ error: 'Email log not found' });
        return;
      }
      res.json({ success: true, message: 'Status updated' });
    }
  );
});

// PUT /api/email-logs/:id/status - Manually update email log status (for local testing)
router.put('/:id/status', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }
  
  const validStatuses = ['pending', 'sent', 'delivered', 'failed', 'opened'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }
  
  const now = new Date().toISOString();
  db.run(
    `UPDATE email_logs 
     SET status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [status, now, id, userId],
    function(err) {
      if (err) {
        console.error('Error updating email log status:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Email log not found' });
        return;
      }
      console.log(`[MANUAL UPDATE] Updated email log ${id} to status: ${status}`);
      res.json({ success: true, message: 'Status updated', status });
    }
  );
});

// POST /api/email-logs/check-status - Check Resend email status via API
router.post('/check-status', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  try {
    db.get('SELECT email_relay_api_key FROM admin_settings WHERE user_id = ?', [userId], async (err, profile) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        return res.status(500).json({ error: 'Failed to fetch profile settings' });
      }
      
      if (!profile || !profile.email_relay_api_key) {
        return res.status(400).json({ error: 'Resend API key not configured' });
      }
      
      const apiKey = profile.email_relay_api_key;
      
      // Get all pending or sent emails for this user
      db.all(
        `SELECT id, sendgrid_message_id, recipient_email, invoice_number 
         FROM email_logs 
         WHERE user_id = ? AND status IN ('pending', 'sent') AND sendgrid_message_id IS NOT NULL
         ORDER BY sent_at DESC
         LIMIT 50`,
        [userId],
        async (err, logs) => {
          if (err) {
            console.error('Error fetching email logs:', err);
            return res.status(500).json({ error: err.message });
          }
          
          if (logs.length === 0) {
            return res.json({ success: true, updated: 0, message: 'No pending emails to check' });
          }
          
          try {
            let updatedCount = 0;
            
            const updatePromises = logs.map(async (log) => {
              try {
                // Use Resend API to get email status
                const response = await fetch(
                  `https://api.resend.com/emails/${log.sendgrid_message_id}`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                if (!response.ok) {
                  console.error(`[STATUS CHECK] Resend API error for log ${log.id}:`, response.status);
                  return;
                }
                
                const data = await response.json();
                
                // Resend returns last_event field with the latest status
                const lastEvent = data.last_event;
                let logStatus = 'sent';
                
                if (lastEvent === 'delivered') {
                  logStatus = 'delivered';
                } else if (lastEvent === 'bounced' || lastEvent === 'complained') {
                  logStatus = 'failed';
                } else if (lastEvent === 'opened' || lastEvent === 'clicked') {
                  logStatus = 'opened';
                } else if (lastEvent === 'sent') {
                  logStatus = 'sent';
                }
                
                const now = new Date().toISOString();
                
                return new Promise((resolve) => {
                  db.run(
                    `UPDATE email_logs 
                     SET status = ?, updated_at = ?
                     WHERE id = ?`,
                    [logStatus, now, log.id],
                    function(updateErr) {
                      if (updateErr) {
                        console.error('[STATUS CHECK] Error updating email log:', updateErr);
                      } else if (this.changes > 0) {
                        updatedCount++;
                        console.log(`[STATUS CHECK] Updated email log ${log.id}: ${logStatus}`);
                      }
                      resolve();
                    }
                  );
                });
              } catch (checkErr) {
                console.error(`[STATUS CHECK] Error checking status for log ${log.id}:`, checkErr.message);
              }
            });
            
            await Promise.all(updatePromises);
            
            res.json({ 
              success: true, 
              updated: updatedCount, 
              checked: logs.length,
              message: `Checked ${logs.length} emails, updated ${updatedCount} statuses` 
            });
          } catch (apiErr) {
            console.error('Error querying Resend API:', apiErr);
            res.status(500).json({ 
              error: 'Failed to check Resend status', 
              details: apiErr.message 
            });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in check-status endpoint:', error);
    res.status(500).json({ error: 'Failed to check email status' });
  }
});

// GET /api/email-logs/invoice-status - Get paid status for all invoices
router.post('/resend-unpaid', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { invoice_number, to, subject, body } = req.body;

  if (!invoice_number || !to) {
    return res.status(400).json({ error: 'Invoice number and recipient(s) required' });
  }

  try {
    // Find original appointment to get date + location
    const apt = await new Promise((resolve, reject) => {
      db.get('SELECT date, location FROM appointments WHERE id = ? AND user_id = ?',
        [parseInt(invoice_number), userId], (err, row) => err ? reject(err) : resolve(row));
    });

    if (!apt) return res.status(404).json({ error: 'Original invoice appointment not found' });

    // Get unpaid appointments for that date + location
    const unpaidApts = await new Promise((resolve, reject) => {
      db.all('SELECT id, client_name, service, price FROM appointments WHERE date = ? AND location = ? AND user_id = ? AND paid != 1',
        [apt.date, apt.location, userId], (err, rows) => err ? reject(err) : resolve(rows));
    });

    if (unpaidApts.length === 0) {
      return res.status(400).json({ error: 'All appointments on this invoice are already paid' });
    }

    // Get full profile settings (for email config and PDF generation)
    const settings = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM admin_settings WHERE user_id = ?',
        [userId], (err, row) => err ? reject(err) : resolve(row));
    });

    // Get location details for PDF
    const locationData = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM address_data WHERE location_name = ? AND user_id = ?',
        [apt.location, userId], (err, row) => err ? reject(err) : resolve(row));
    });

    const apiKey = settings?.email_relay_api_key || process.env.RESEND_API_KEY;
    const fromEmail = settings?.email_relay_from_email || process.env.RESEND_FROM_EMAIL || 'noreply@hairmanager.app';
    const fromName = settings?.email_relay_from_name || settings?.business_name || 'HairManager';

    if (!apiKey) return res.status(400).json({ error: 'Email not configured' });

    // Get the original PDF path to attach if available
    const originalLog = await new Promise((resolve, reject) => {
      db.get('SELECT pdf_file_path FROM email_logs WHERE invoice_number = ? AND user_id = ? AND is_followup = 0 ORDER BY sent_at DESC LIMIT 1',
        [invoice_number, userId], (err, row) => err ? reject(err) : resolve(row));
    });

    const resend = new Resend(apiKey);
    const toEmails = Array.isArray(to) ? to : to.split(/[;,]/).map(e => e.trim()).filter(Boolean);

    // Build unpaid items list for the email body
    const unpaidTotal = unpaidApts.reduce((sum, a) => sum + (a.price || 0), 0);
    // Build the unpaid items HTML table
    const itemsTable = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Client</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Service</th>
            <th style="text-align: right; padding: 8px; border-bottom: 2px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${unpaidApts.map(a => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.client_name}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.service}</td>
              <td style="text-align: right; padding: 8px; border-bottom: 1px solid #e5e7eb;">£${(a.price || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background: #f3f4f6;">
            <td colspan="2" style="padding: 8px; font-weight: bold;">Outstanding Total</td>
            <td style="text-align: right; padding: 8px; font-weight: bold;">£${unpaidTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    // Apply variable substitution to body or template
    const applyVariables = (text) => {
      return text
        .replace(/\{invoiceNumber\}/g, invoice_number)
        .replace(/\{unpaidCount\}/g, unpaidApts.length)
        .replace(/\{unpaidTotal\}/g, `£${unpaidTotal.toFixed(2)}`)
        .replace(/\{totalAppointments\}/g, unpaidApts.length + 'appointments')
        .replace(/\{location\}/g, apt.location || '')
        .replace(/\{date\}/g, apt.date || '')
        .replace(/\{businessName\}/g, fromName)
        .replace(/\n/g, '<br>');
    };

    let messageHtml;
    if (body) {
      messageHtml = applyVariables(body);
    } else if (settings?.reminder_email_template) {
      messageHtml = applyVariables(settings.reminder_email_template);
    } else {
      messageHtml = `This is a reminder that the following items from Invoice ${invoice_number} remain unpaid.`;
    }

    const emailBody = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <div>${messageHtml}</div>
        ${itemsTable}
      </div>
    `;

    const emailSubject = subject || `Payment Reminder - Invoice ${invoice_number}`;

    // Build email payload
    const emailPayload = {
      from: `${fromName} <${fromEmail}>`,
      to: toEmails,
      subject: emailSubject,
      html: emailBody
    };

    // Generate PDF invoice for unpaid items
    try {
      const pdfBuffer = await generateUnpaidInvoicePdf(invoice_number, unpaidApts, settings, locationData);
      emailPayload.attachments = [{
        filename: `Invoice_${invoice_number}_Reminder.pdf`,
        content: pdfBuffer.toString('base64')
      }];

      // Save PDF to disk
      const dataDir = process.env.NODE_ENV === 'production'
        ? join(__dirname, '..', 'data')
        : join(__dirname, '..');
      const invoiceDir = join(dataDir, 'invoices');
      if (!existsSync(invoiceDir)) mkdirSync(invoiceDir, { recursive: true });
      const pdfPath = join(invoiceDir, `Invoice_${invoice_number}_Reminder_${Date.now()}.pdf`);
      writeFileSync(pdfPath, pdfBuffer);
      console.log('[Resend Unpaid] PDF generated:', pdfPath);
    } catch (pdfErr) {
      console.log('[Resend Unpaid] PDF generation failed, sending without attachment:', pdfErr.message);
    }

    const { data, error: resendError } = await resend.emails.send(emailPayload);

    if (resendError) {
      console.error('[Resend Unpaid] Error:', resendError);
      return res.status(500).json({ error: 'Failed to send reminder email' });
    }

    const resendMessageId = data?.id || null;
    const now = new Date().toISOString();

    // Create follow-up email log entries
    for (const email of toEmails) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO email_logs (user_id, invoice_number, recipient_email, subject, status, sendgrid_message_id, is_followup, sent_at, updated_at)
           VALUES (?, ?, ?, ?, 'sent', ?, 1, ?, ?)`,
          [userId, invoice_number, email, emailSubject, resendMessageId, now, now],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    res.json({
      success: true,
      message: `Payment reminder sent to ${toEmails.length} recipient(s)`,
      unpaidCount: unpaidApts.length,
      unpaidTotal
    });
  } catch (err) {
    console.error('[Resend Unpaid] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
