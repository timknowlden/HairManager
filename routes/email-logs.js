import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { readFileSync } from 'fs';

const router = express.Router();

// Webhook route doesn't require authentication (SendGrid calls it)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const db = req.app.locals.db;
  
  try {
    // SendGrid sends events as an array
    const events = Array.isArray(req.body) ? req.body : JSON.parse(req.body.toString());
    
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid webhook format' });
    }
    
    events.forEach(event => {
      const { sg_message_id, sg_event_id, event: eventType, email, timestamp, reason, status } = event;
      
      // Map SendGrid event types to our status
      let logStatus = 'unknown';
      if (eventType === 'delivered') {
        logStatus = 'delivered';
      } else if (eventType === 'bounce' || eventType === 'dropped' || eventType === 'deferred') {
        logStatus = 'failed';
      } else if (eventType === 'open' || eventType === 'click') {
        logStatus = 'opened';
      } else if (eventType === 'processed') {
        logStatus = 'sent';
      }
      
      const now = new Date(timestamp * 1000).toISOString() || new Date().toISOString();
      const errorMsg = reason || (eventType === 'bounce' ? 'Email bounced' : null) || 
                       (eventType === 'dropped' ? 'Email dropped' : null);
      
      // Update email log by SendGrid message ID
      db.run(
        `UPDATE email_logs 
         SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
         WHERE sendgrid_message_id = ?`,
        [logStatus, sg_event_id || null, errorMsg, now, sg_message_id],
        function(err) {
          if (err) {
            console.error('Error updating email log from webhook:', err);
          } else if (this.changes > 0) {
            console.log(`Updated email log: ${sg_message_id} -> ${logStatus}`);
          }
        }
      );
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing SendGrid webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

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
      
      // Serve the PDF file
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

// POST /api/email-logs/update-status - Update email status from SendGrid webhook
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

// POST /api/email-logs/check-status - Manually check SendGrid status for pending/sent emails
router.post('/check-status', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  try {
    // Get profile settings to access SendGrid API key
    db.get('SELECT email_relay_api_key FROM admin_settings WHERE user_id = ?', [userId], async (err, profile) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        return res.status(500).json({ error: 'Failed to fetch profile settings' });
      }
      
      if (!profile || !profile.email_relay_api_key) {
        return res.status(400).json({ error: 'SendGrid API key not configured' });
      }
      
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
            // Use SendGrid REST API directly with fetch
            const apiKey = profile.email_relay_api_key;
            let updatedCount = 0;
            
            const updatePromises = logs.map(async (log) => {
              try {
                // Query SendGrid Activity API for this message
                // Note: SendGrid Activity API requires specific query format
                // We'll use the Messages API instead which is simpler
                const queryParams = new URLSearchParams({
                  query: `msg_id="${log.sendgrid_message_id}"`,
                  limit: '10'
                });
                
                const response = await fetch(
                  `https://api.sendgrid.com/v3/messages?${queryParams}`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                if (!response.ok) {
                  console.error(`SendGrid API error for log ${log.id}:`, response.status, response.statusText);
                  return;
                }
                
                const data = await response.json();
                
                if (data && data.messages && data.messages.length > 0) {
                  // Get the most recent event for this message
                  const messages = data.messages;
                  // Messages are sorted by most recent first
                  const latestMessage = messages[0];
                  
                  // Map SendGrid event types to our status
                  let logStatus = 'sent';
                  if (latestMessage.events && latestMessage.events.length > 0) {
                    const latestEvent = latestMessage.events[0];
                    const eventType = latestEvent.event;
                    
                    if (eventType === 'delivered') {
                      logStatus = 'delivered';
                    } else if (eventType === 'bounce' || eventType === 'dropped' || eventType === 'deferred') {
                      logStatus = 'failed';
                    } else if (eventType === 'open' || eventType === 'click') {
                      logStatus = 'opened';
                    } else if (eventType === 'processed') {
                      logStatus = 'sent';
                    }
                    
                    const now = new Date().toISOString();
                    const errorMsg = latestEvent.reason || null;
                    
                    // Update the email log
                    return new Promise((resolve) => {
                      db.run(
                        `UPDATE email_logs 
                         SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
                         WHERE id = ?`,
                        [logStatus, latestEvent.sg_event_id || null, errorMsg, now, log.id],
                        function(updateErr) {
                          if (updateErr) {
                            console.error('Error updating email log:', updateErr);
                          } else if (this.changes > 0) {
                            updatedCount++;
                            console.log(`Updated email log ${log.id}: ${logStatus}`);
                          }
                          resolve();
                        }
                      );
                    });
                  }
                }
              } catch (checkErr) {
                console.error(`Error checking status for log ${log.id}:`, checkErr.message);
                // Continue with other logs even if one fails
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
            console.error('Error querying SendGrid API:', apiErr);
            res.status(500).json({ 
              error: 'Failed to check SendGrid status', 
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

export default router;

