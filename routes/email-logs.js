import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { readFileSync } from 'fs';

const router = express.Router();

// Webhook route doesn't require authentication (SendGrid calls it)
// GET handler for testing webhook endpoint
router.get('/webhook', (req, res) => {
  res.json({ 
    message: 'SendGrid webhook endpoint is active. SendGrid will POST events here.',
    method: 'POST',
    note: 'This endpoint does not require authentication for SendGrid webhooks'
  });
});

// POST handler for SendGrid webhook events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const db = req.app.locals.db;
  
  // Log webhook receipt
  const webhookReceivedAt = new Date().toISOString();
  console.log('\n[WEBHOOK] ========================================');
  console.log('[WEBHOOK] Webhook received at:', webhookReceivedAt);
  console.log('[WEBHOOK] Content-Type:', req.headers['content-type']);
  console.log('[WEBHOOK] Content-Length:', req.headers['content-length']);
  console.log('[WEBHOOK] User-Agent:', req.headers['user-agent']);
  
  // Log raw webhook body
  let rawBodyString;
  try {
    if (Buffer.isBuffer(req.body)) {
      rawBodyString = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBodyString = req.body;
    } else {
      rawBodyString = JSON.stringify(req.body);
    }
    console.log('[WEBHOOK] Raw JSON Body:');
    console.log(JSON.stringify(JSON.parse(rawBodyString), null, 2));
  } catch (e) {
    rawBodyString = req.body?.toString?.() || String(req.body);
    console.log('[WEBHOOK] Raw Body (could not parse as JSON):', rawBodyString.substring(0, 500));
  }
  console.log('[WEBHOOK] ========================================\n');
  
  try {
    // SendGrid sends events as an array
    let events;
    try {
      if (Array.isArray(req.body)) {
        events = req.body;
      } else {
        events = JSON.parse(req.body.toString());
      }
    } catch (parseErr) {
      console.error('[WEBHOOK] ❌ Error parsing webhook body:', parseErr.message);
      console.error('[WEBHOOK] Body type:', typeof req.body);
      console.error('[WEBHOOK] Body preview:', req.body?.toString?.()?.substring(0, 200));
      return res.status(400).json({ error: 'Invalid webhook format', details: parseErr.message });
    }
    
    if (!Array.isArray(events)) {
      console.error('[WEBHOOK] ❌ Events is not an array. Type:', typeof events);
      console.error('[WEBHOOK] Events value:', events);
      return res.status(400).json({ error: 'Invalid webhook format - expected array' });
    }
    
    console.log(`[WEBHOOK] ✓ Received ${events.length} event(s) from SendGrid\n`);
    
    // Sort events by timestamp (oldest first) to process in chronological order
    // This ensures "delivered" is processed before "open", etc.
    events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    console.log(`[WEBHOOK] Events sorted by timestamp (oldest first)\n`);
    
    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process events sequentially to avoid race conditions
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const eventJson = JSON.stringify(event);
      console.log(`[WEBHOOK] --- Processing event ${index + 1}/${events.length} ---`);
      console.log(`[WEBHOOK] Event JSON:`, eventJson);
      const { sg_message_id, sg_event_id, event: eventType, email, timestamp, reason, status } = event;
      
      processedCount++;
      console.log(`[WEBHOOK] Event type: ${eventType}`);
      console.log(`[WEBHOOK] Message ID: ${sg_message_id}`);
      console.log(`[WEBHOOK] Event ID: ${sg_event_id}`);
      console.log(`[WEBHOOK] Email: ${email}`);
      console.log(`[WEBHOOK] Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
      if (reason) console.log(`[WEBHOOK] Reason: ${reason}`);
      
      // Map SendGrid event types to our status
      // Important: We need to respect status hierarchy - "opened" should only be set if already "delivered"
      let logStatus = null; // null means don't update status for this event
      if (eventType === 'delivered') {
        logStatus = 'delivered';
      } else if (eventType === 'bounce' || eventType === 'dropped' || eventType === 'deferred') {
        logStatus = 'failed';
      } else if (eventType === 'open' || eventType === 'click') {
        // Only set to "opened" if current status is already "delivered"
        // Otherwise, keep the current status (don't skip "delivered" state)
        logStatus = 'opened'; // We'll check current status before updating
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
      
      console.log(`[WEBHOOK] Proposed status: ${logStatus || 'none (will skip)'}`);
      console.log(`[WEBHOOK] Matching: webhook message ID="${sg_message_id}", base="${baseMessageId}"`);
      
      // For "open" events, we need to check current status first
      // Only update to "opened" if current status is "delivered"
      if (logStatus === 'opened') {
        // First, get the current status AND id (we need id for webhook_events table)
        const currentRow = await new Promise((resolve) => {
          db.get(
            `SELECT id, status, user_id FROM email_logs 
             WHERE sendgrid_message_id = ? 
                OR sendgrid_message_id = ?
                OR ? LIKE (sendgrid_message_id || '%')
             LIMIT 1`,
            [sg_message_id, baseMessageId, sg_message_id],
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
          skippedCount++;
          console.warn(`[WEBHOOK] No email log found for message ID: ${sg_message_id} (base: ${baseMessageId})`);
          continue;
        }
        
        // Always store the webhook event, even if we skip the status update
        db.run(
          `INSERT INTO webhook_events 
           (email_log_id, user_id, event_type, sendgrid_message_id, sendgrid_event_id, raw_event_data, processed_at, event_timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            currentRow.id,
            currentRow.user_id,
            eventType,
            sg_message_id,
            sg_event_id || null,
            eventJson,
            webhookReceivedAt,
            timestamp || null
          ],
          (err) => {
            if (err) {
              console.error('[WEBHOOK] Error storing webhook event for opened:', err);
            } else {
              console.log(`[WEBHOOK] ✓ Stored webhook event for opened: email_log_id=${currentRow.id}, status="${currentRow.status}"`);
            }
          }
        );
        
        // Only update to "opened" if current status is "delivered"
        // This prevents skipping the "delivered" state
        if (currentRow.status === 'delivered') {
          const openResult = await new Promise((resolve) => {
            db.run(
              `UPDATE email_logs 
               SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?, webhook_event_data = ?
               WHERE (sendgrid_message_id = ? 
                  OR sendgrid_message_id = ?
                  OR ? LIKE (sendgrid_message_id || '%'))
               AND recipient_email = ?`,
              [
                'opened',
                sg_event_id || null,
                errorMsg,
                now,
                eventJson, // Store latest webhook event data
                sg_message_id,
                baseMessageId,
                sg_message_id,
                email  // Match by recipient email to handle multiple recipients
              ],
              function(updateErr) {
                if (updateErr) {
                  console.error('[WEBHOOK] ❌ Error updating to opened:', updateErr);
                  resolve({ success: false, changes: 0 });
                } else if (this.changes > 0) {
                  console.log(`[WEBHOOK] ✓ Updated to opened (was delivered): ${sg_message_id}`);
                  resolve({ success: true, changes: this.changes });
                } else {
                  console.log(`[WEBHOOK] ⚠ No rows updated for opened event`);
                  resolve({ success: false, changes: 0 });
                }
              }
            );
          });
          
          // Update counters synchronously after await
          if (openResult.success && openResult.changes > 0) {
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          console.log(`[WEBHOOK] ⏭ Skipping "opened" update - current status is "${currentRow.status}", not "delivered"`);
          skippedCount++;
        }
        continue; // Don't continue with the regular update for "open" events
      }
      
      // For all other events, update normally
      if (!logStatus) {
        skippedCount++;
        console.log(`[WEBHOOK] No status mapping for event type: ${eventType}, skipping status update`);
        continue;
      }
      
      // Check current status before updating to respect hierarchy
      // Don't downgrade: delivered > sent, opened > delivered
      const currentStatus = await new Promise((resolve) => {
        db.get(
          `SELECT status FROM email_logs 
           WHERE sendgrid_message_id = ? 
              OR sendgrid_message_id = ?
              OR ? LIKE (sendgrid_message_id || '%')
           LIMIT 1`,
          [sg_message_id, baseMessageId, sg_message_id],
          (err, row) => {
            if (err) {
              console.error('[WEBHOOK] Error checking current status:', err);
              resolve(null);
            } else {
              resolve(row ? row.status : null);
            }
          }
        );
      });
      
      // Respect status hierarchy: don't downgrade or skip states
      // Status progression: sent → delivered/failed → opened
      if (currentStatus) {
        const statusHierarchy = { 'pending': 0, 'sent': 1, 'delivered': 2, 'opened': 3, 'failed': 0 };
        const currentLevel = statusHierarchy[currentStatus] || 0;
        const newLevel = statusHierarchy[logStatus] || 0;
        
        // Don't allow skipping states - e.g., can't go from "sent" directly to "opened"
        if (logStatus === 'opened' && currentStatus !== 'delivered') {
          skippedCount++;
          console.log(`[WEBHOOK] ⏭ Skipping "opened" - current status "${currentStatus}" must be "delivered" first`);
          continue;
        }
        
        // Don't downgrade (except failed can overwrite anything)
        if (newLevel <= currentLevel && logStatus !== 'failed') {
          skippedCount++;
          console.log(`[WEBHOOK] ⏭ Skipping update - current status "${currentStatus}" (level ${currentLevel}) is higher than "${logStatus}" (level ${newLevel})`);
          continue;
        }
      }
      
      // First, find the email_log_id(s) that match this event
      // Match by BOTH message ID AND recipient email to handle multiple recipients correctly
      const matchingLogs = await new Promise((resolve) => {
        db.all(
          `SELECT id, user_id, recipient_email FROM email_logs 
           WHERE (sendgrid_message_id = ? 
              OR sendgrid_message_id = ?
              OR ? LIKE (sendgrid_message_id || '%'))
           AND recipient_email = ?
           LIMIT 10`,
          [sg_message_id, baseMessageId, sg_message_id, email],
          (err, rows) => {
            if (err) {
              console.error('[WEBHOOK] Error finding matching email logs:', err);
              resolve([]);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
      
      // Store webhook event in webhook_events table for debugging (even if no match found)
      // eventJson is already declared at the start of the loop
      if (matchingLogs.length > 0) {
        for (const log of matchingLogs) {
          db.run(
            `INSERT INTO webhook_events 
             (email_log_id, user_id, event_type, sendgrid_message_id, sendgrid_event_id, raw_event_data, processed_at, event_timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              log.id,
              log.user_id,
              eventType,
              sg_message_id,
              sg_event_id || null,
              eventJson,
              webhookReceivedAt,
              timestamp || null
            ],
            (err) => {
              if (err) {
                console.error('[WEBHOOK] Error storing webhook event:', err);
              } else {
                console.log(`[WEBHOOK] ✓ Stored webhook event for email_log_id: ${log.id}`);
              }
            }
          );
        }
      } else {
        // Store event even if no matching email log found (for debugging)
        db.run(
          `INSERT INTO webhook_events 
           (email_log_id, user_id, event_type, sendgrid_message_id, sendgrid_event_id, raw_event_data, processed_at, event_timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null,
            0, // Unknown user - will need to match later
            eventType,
            sg_message_id,
            sg_event_id || null,
            eventJson,
            webhookReceivedAt,
            timestamp || null
          ],
          (err) => {
            if (err) {
              console.error('[WEBHOOK] Error storing unmatched webhook event:', err);
            } else {
              console.log(`[WEBHOOK] ⚠ Stored unmatched webhook event (no email_log found)`);
            }
          }
        );
      }
      
      // Try multiple matching strategies, but also match by recipient email:
      // 1. Exact match with full webhook ID AND recipient email
      // 2. Exact match with base ID AND recipient email
      // 3. LIKE pattern: webhook full ID starts with stored base ID AND recipient email matches
      const updateResult = await new Promise((resolve) => {
        // First try with webhook_event_data column
        db.run(
          `UPDATE email_logs 
           SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?, webhook_event_data = ?
           WHERE (sendgrid_message_id = ? 
              OR sendgrid_message_id = ?
              OR ? LIKE (sendgrid_message_id || '%'))
           AND recipient_email = ?`,
          [
            logStatus, 
            sg_event_id || null, 
            errorMsg, 
            now,
            eventJson, // Store latest webhook event data
            sg_message_id,           // Exact match with full ID
            baseMessageId,           // Exact match with base ID (most common: both are base)
            sg_message_id,           // Webhook full ID starts with stored base (webhook: "base.recvd-...", stored: "base")
            email                     // Match by recipient email to handle multiple recipients
          ],
          function(err) {
            if (err) {
              // If webhook_event_data column doesn't exist, try without it
              if (err.message && err.message.includes('webhook_event_data')) {
                console.warn('[WEBHOOK] webhook_event_data column not found, updating without it');
                db.run(
                  `UPDATE email_logs 
                   SET status = ?, sendgrid_event_id = ?, error_message = ?, updated_at = ?
                   WHERE (sendgrid_message_id = ? 
                      OR sendgrid_message_id = ?
                      OR ? LIKE (sendgrid_message_id || '%'))
                   AND recipient_email = ?`,
                  [
                    logStatus, 
                    sg_event_id || null, 
                    errorMsg, 
                    now,
                    sg_message_id,
                    baseMessageId,
                    sg_message_id,
                    email
                  ],
                  function(retryErr) {
                    if (retryErr) {
                      console.error('[WEBHOOK] ❌ Error updating email log:', retryErr);
                      resolve({ success: false, changes: 0 });
                    } else if (this.changes > 0) {
                      console.log(`[WEBHOOK] ✓ Updated ${this.changes} email log(s): ${sg_message_id} (base: ${baseMessageId}) -> ${logStatus} for ${email}`);
                      resolve({ success: true, changes: this.changes });
                    } else {
                      console.warn(`[WEBHOOK] ⚠ No email log found matching message ID: ${sg_message_id} (base: ${baseMessageId}) and email: ${email}`);
                      resolve({ success: false, changes: 0, notFound: true });
                    }
                  }
                );
              } else {
                console.error('[WEBHOOK] ❌ Error updating email log:', err);
                resolve({ success: false, changes: 0 });
              }
            } else if (this.changes > 0) {
              console.log(`[WEBHOOK] ✓ Updated ${this.changes} email log(s): ${sg_message_id} (base: ${baseMessageId}) -> ${logStatus} for ${email}`);
              resolve({ success: true, changes: this.changes });
            } else {
              console.warn(`[WEBHOOK] ⚠ No email log found matching message ID: ${sg_message_id} (base: ${baseMessageId}) and email: ${email}`);
              resolve({ success: false, changes: 0, notFound: true });
            }
          }
        );
      });
      
      // Update counters synchronously based on result
      if (updateResult.success && updateResult.changes > 0) {
        updatedCount++;
      } else if (updateResult.notFound) {
        skippedCount++;
      }
      
      // If no match found, try fallback matching by email AND message ID
      if (!updateResult.success && updateResult.changes === 0) {
        // Try to find by email, message ID, and recent date as fallback
        db.all(
          `SELECT id, sendgrid_message_id, recipient_email, sent_at FROM email_logs 
           WHERE recipient_email = ? 
           AND (sendgrid_message_id = ? OR sendgrid_message_id = ? OR ? LIKE (sendgrid_message_id || '%'))
           AND sent_at >= datetime('now', '-7 days')
           ORDER BY sent_at DESC LIMIT 5`,
          [email, sg_message_id, baseMessageId, sg_message_id],
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
                      updatedCount++;
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
    
    // Summary log
    console.log('\n[WEBHOOK] ========================================');
    console.log(`[WEBHOOK] Summary: ${processedCount} processed, ${updatedCount} updated, ${skippedCount} skipped`);
    console.log('[WEBHOOK] ========================================\n');
    
    res.status(200).json({ 
      success: true, 
      processed: processedCount,
      updated: updatedCount,
      skipped: skippedCount
    });
  } catch (error) {
    console.error('\n[WEBHOOK] ❌❌❌ ERROR PROCESSING WEBHOOK ❌❌❌');
    console.error('[WEBHOOK] Error:', error.message);
    console.error('[WEBHOOK] Stack:', error.stack);
    console.error('[WEBHOOK] ========================================\n');
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
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

// GET /api/email-logs/:id/webhook-events - Get all webhook events for a specific email log
router.get('/:id/webhook-events', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { id } = req.params;
  
  // First verify the email log belongs to the user
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
      
      // Fetch all webhook events for this email log, ordered by processed_at
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
                  
                  // The Messages API requires additional permissions
                  // This is expected - use webhooks for automatic status updates
                  if (response.status === 400 && errorData.errors && errorData.errors.some(e => e.message && e.message.includes('authorization required'))) {
                    console.log(`[STATUS CHECK] Messages API not available. Use "Mark Delivered" button for local testing, or configure webhook for production.`);
                  } else if (response.status === 403 || (errorData.errors && errorData.errors.some(e => e.message && e.message.includes('permission')))) {
                    console.error('[STATUS CHECK] Messages API requires additional permissions');
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

