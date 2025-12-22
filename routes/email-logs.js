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
      
      console.log(`[WEBHOOK] Received event: ${eventType} for message: ${sg_message_id}, email: ${email}`);
      
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
      
      // Extract the base message ID (before first dot) for matching
      // SendGrid message IDs can be in format: "base.recvd-..." or just "base"
      const baseMessageId = sg_message_id ? sg_message_id.split('.')[0] : null;
      
      if (!baseMessageId) {
        console.warn('[WEBHOOK] No message ID found in event:', event);
        return;
      }
      
      console.log(`[WEBHOOK] Matching: webhook message ID="${sg_message_id}", base="${baseMessageId}"`);
      
      // Try multiple matching strategies:
      // 1. Exact match with full webhook ID
      // 2. Exact match with base ID (most common case: we store base, webhook sends base)
      // 3. LIKE pattern: webhook full ID starts with stored base ID (stored: "base", webhook: "base.recvd-...")
      // The key is: if webhook sends "base.recvd-..." and we stored "base", we need to match
      // We do this by checking if webhook's base matches stored value, OR if webhook full starts with stored
      db.run(
        `UPDATE email_logs 
         SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
         WHERE sendgrid_message_id = ? 
            OR sendgrid_message_id = ?
            OR ? LIKE (sendgrid_message_id || '%')`,
        [
          logStatus, 
          sg_event_id || null, 
          errorMsg, 
          now, 
          sg_message_id,           // Exact match with full ID
          baseMessageId,           // Exact match with base ID (most common: both are base)
          sg_message_id            // Webhook full ID starts with stored base (webhook: "base.recvd-...", stored: "base")
        ],
        function(err) {
          if (err) {
            console.error('[WEBHOOK] Error updating email log from webhook:', err);
          } else if (this.changes > 0) {
            console.log(`[WEBHOOK] ✓ Updated ${this.changes} email log(s): ${sg_message_id} (base: ${baseMessageId}) -> ${logStatus}`);
          } else {
            console.warn(`[WEBHOOK] ⚠ No email log found matching message ID: ${sg_message_id} (base: ${baseMessageId})`);
            // Try to find by email and recent date as fallback
            db.all(
              `SELECT id, sendgrid_message_id, recipient_email, sent_at FROM email_logs 
               WHERE recipient_email = ? AND sent_at >= datetime('now', '-7 days')
               ORDER BY sent_at DESC LIMIT 5`,
              [email],
              (err, rows) => {
                if (err) {
                  console.error('[WEBHOOK] Error finding email log by email:', err);
                  return;
                }
                if (rows && rows.length > 0) {
                  console.log(`[WEBHOOK] Found ${rows.length} potential matches by email. Stored message IDs:`, rows.map(r => ({
                    id: r.id,
                    msg_id: r.sendgrid_message_id,
                    email: r.recipient_email,
                    sent_at: r.sent_at
                  })));
                  // Try to update the most recent one if it's within a few minutes
                  const mostRecent = rows[0];
                  const sentTime = new Date(mostRecent.sent_at);
                  const now = new Date();
                  const minutesDiff = (now - sentTime) / (1000 * 60);
                  
                  if (minutesDiff < 30) { // Within 30 minutes
                    console.log(`[WEBHOOK] Attempting to update most recent log (ID: ${mostRecent.id}) as fallback match`);
                    db.run(
                      `UPDATE email_logs 
                       SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
                       WHERE id = ?`,
                      [logStatus, sg_event_id || null, errorMsg, new Date().toISOString(), mostRecent.id],
                      function(updateErr) {
                        if (updateErr) {
                          console.error('[WEBHOOK] Error updating fallback match:', updateErr);
                        } else if (this.changes > 0) {
                          console.log(`[WEBHOOK] ✓ Updated fallback match (ID: ${mostRecent.id}) -> ${logStatus}`);
                        }
                      }
                    );
                  }
                }
              }
            );
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
      
      const apiKey = profile.email_relay_api_key;
      if (!apiKey || apiKey.trim() === '') {
        console.error('[STATUS CHECK] API key is empty or invalid');
        return res.status(400).json({ error: 'SendGrid API key is empty' });
      }
      
      console.log('[STATUS CHECK] Using API key (first 10 chars):', apiKey.substring(0, 10) + '...');
      
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
            // First, test the API key with a simple request to verify it works
            const authHeader = `Bearer ${apiKey.trim()}`;
            console.log('[STATUS CHECK] Testing API key with SendGrid...');
            
            // Test API key by making a simple request to user profile endpoint
            const testResponse = await fetch('https://api.sendgrid.com/v3/user/profile', {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            });
            
            if (!testResponse.ok) {
              const testErrorText = await testResponse.text();
              let testErrorData;
              try {
                testErrorData = JSON.parse(testErrorText);
              } catch (e) {
                testErrorData = { message: testErrorText };
              }
              console.error('[STATUS CHECK] API key test failed:', testResponse.status, testErrorData);
              return res.status(400).json({ 
                error: 'SendGrid API key is invalid or lacks required permissions',
                details: testErrorData
              });
            }
            
            console.log('[STATUS CHECK] API key is valid, proceeding with status checks...');
            
            // Use SendGrid REST API directly with fetch
            let updatedCount = 0;
            
            const updatePromises = logs.map(async (log) => {
              try {
                // Query SendGrid Messages API by email address
                // This works for both local and production testing
                // Get base message ID (before first dot) for matching
                const baseMessageId = log.sendgrid_message_id ? log.sendgrid_message_id.split('.')[0] : null;
                
                // Query by email - get recent messages for this recipient
                // Note: Messages API requires Email Activity add-on or Pro plan
                const queryParams = new URLSearchParams({
                  query: `to_email="${log.recipient_email}"`,
                  limit: '50' // Get up to 50 recent messages
                });
                
                console.log(`[STATUS CHECK] Checking log ${log.id} for email ${log.recipient_email}, message ID: ${log.sendgrid_message_id} (base: ${baseMessageId})`);
                console.log(`[STATUS CHECK] Query: ${queryParams.toString()}`);
                
                const response = await fetch(
                  `https://api.sendgrid.com/v3/messages?${queryParams}`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': authHeader,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                if (!response.ok) {
                  const errorText = await response.text();
                  let errorData;
                  try {
                    errorData = JSON.parse(errorText);
                  } catch (e) {
                    errorData = { message: errorText };
                  }
                  console.error(`[STATUS CHECK] SendGrid API error for log ${log.id}:`, response.status, response.statusText);
                  console.error('[STATUS CHECK] Error details:', JSON.stringify(errorData, null, 2));
                  
                  // The Messages API requires Email Activity add-on (paid feature)
                  // This is expected if you don't have the add-on
                  if (response.status === 400 && errorData.errors && errorData.errors.some(e => e.message && e.message.includes('authorization required'))) {
                    console.log(`[STATUS CHECK] Messages API requires Email Activity add-on. This is expected. Use "Mark Delivered" button for local testing, or configure webhook for production.`);
                  } else if (response.status === 403 || (errorData.errors && errorData.errors.some(e => e.message && e.message.includes('permission')))) {
                    console.error('[STATUS CHECK] Messages API requires Email Activity add-on or Pro plan');
                  }
                  return;
                }
                
                const data = await response.json();
                
                // Find the message that matches our message ID
                if (data && data.messages && Array.isArray(data.messages)) {
                  // Try to find by exact match first, then by base ID
                  let matchingMessage = data.messages.find(msg => {
                    if (!msg.msg_id) return false;
                    const msgBaseId = msg.msg_id.split('.')[0];
                    return msg.msg_id === log.sendgrid_message_id || 
                           msg.msg_id === baseMessageId ||
                           msgBaseId === baseMessageId ||
                           msg.msg_id.startsWith(baseMessageId);
                  });
                  
                  // If no match by message ID, try matching by events
                  if (!matchingMessage) {
                    matchingMessage = data.messages.find(msg => 
                      msg.events && msg.events.some(evt => {
                        if (!evt.sg_message_id) return false;
                        const evtBaseId = evt.sg_message_id.split('.')[0];
                        return evt.sg_message_id === log.sendgrid_message_id ||
                               evt.sg_message_id === baseMessageId ||
                               evtBaseId === baseMessageId ||
                               evt.sg_message_id.startsWith(baseMessageId);
                      })
                    );
                  }
                  
                  if (matchingMessage && matchingMessage.events && matchingMessage.events.length > 0) {
                    // Get the most recent event (events are sorted by most recent first)
                    const latestEvent = matchingMessage.events[0];
                    const eventType = latestEvent.event;
                    
                    console.log(`[STATUS CHECK] Found matching message for log ${log.id}, latest event: ${eventType}`);
                    
                    // Map SendGrid event types to our status
                    let logStatus = 'sent';
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
                            console.error('[STATUS CHECK] Error updating email log:', updateErr);
                          } else if (this.changes > 0) {
                            updatedCount++;
                            console.log(`[STATUS CHECK] ✓ Updated email log ${log.id}: ${logStatus} (event: ${eventType})`);
                          }
                          resolve();
                        }
                      );
                    });
                  } else {
                    console.log(`[STATUS CHECK] No matching message found for log ${log.id} (msg_id: ${log.sendgrid_message_id}, email: ${log.recipient_email})`);
                    console.log(`[STATUS CHECK] Found ${data.messages.length} messages for this email, but none matched the message ID`);
                  }
                } else {
                  console.log(`[STATUS CHECK] No messages found for log ${log.id} (email: ${log.recipient_email})`);
                }
              } catch (checkErr) {
                console.error(`[STATUS CHECK] Error checking status for log ${log.id}:`, checkErr.message);
                console.error('[STATUS CHECK] Stack:', checkErr.stack);
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

