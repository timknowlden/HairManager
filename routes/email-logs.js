import express from 'express';
import { Resend } from 'resend';
import { authenticateToken } from '../middleware/auth.js';
import { readFileSync } from 'fs';

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
router.get('/invoice-status', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Get all unique invoice numbers from email logs
  db.all(
    "SELECT DISTINCT invoice_number FROM email_logs WHERE user_id = ? AND invoice_number IS NOT NULL AND invoice_number != ''",
    [userId],
    (err, invoices) => {
      if (err) return res.status(500).json({ error: err.message });

      if (invoices.length === 0) return res.json({});

      const results = {};
      let pending = invoices.length;

      invoices.forEach(({ invoice_number }) => {
        // Find the appointment to get date and location
        db.get(
          'SELECT date, location FROM appointments WHERE id = ? AND user_id = ?',
          [parseInt(invoice_number), userId],
          (err2, apt) => {
            if (err2 || !apt) {
              results[invoice_number] = { paid: false, total: 0, paidCount: 0, unpaidCount: 0 };
              if (--pending === 0) res.json(results);
              return;
            }

            // Get all appointments for that date + location
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

// POST /api/email-logs/resend-unpaid - Resend invoice for unpaid appointments only
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

    // Get email settings
    const settings = await new Promise((resolve, reject) => {
      db.get('SELECT email_relay_api_key, email_relay_from_email, email_relay_from_name, business_name FROM admin_settings WHERE user_id = ?',
        [userId], (err, row) => err ? reject(err) : resolve(row));
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
    const itemsList = unpaidApts.map(a => `${a.client_name} - ${a.service}: £${(a.price || 0).toFixed(2)}`).join('\n');

    const emailBody = body || `
      <div style="font-family: sans-serif; max-width: 600px;">
        <p>This is a reminder that the following items from Invoice ${invoice_number} remain unpaid:</p>
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
        <p>Please arrange payment at your earliest convenience.</p>
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

    // Attach original PDF if available
    if (originalLog?.pdf_file_path) {
      try {
        const pdfData = readFileSync(originalLog.pdf_file_path);
        emailPayload.attachments = [{
          filename: `Invoice_${invoice_number}.pdf`,
          content: pdfData.toString('base64')
        }];
      } catch (pdfErr) {
        console.log('[Resend Unpaid] Could not attach original PDF:', pdfErr.message);
      }
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
