import express from 'express';
import sqlite3 from 'sqlite3';
import nodemailer from 'nodemailer';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Middleware to log all requests to profile router
router.use((req, res, next) => {
  console.log(`\n[Profile Router Middleware] ${req.method} ${req.path}`);
  next();
});

// Test route to verify router is working
router.get('/test', (req, res) => {
  console.log('[Profile Router] GET /test handler called');
  res.json({ message: 'Profile routes are working!' });
});

// POST /api/profile/test-email - Test email connection
router.post('/test-email', async (req, res) => {
  try {
    const { email, email_password } = req.body;

    if (!email || !email_password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Detect email provider
    const emailDomain = email.split('@')[1]?.toLowerCase() || '';
    let transporter;

    if (emailDomain.includes('gmail.com')) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: email,
          pass: email_password
        }
      });
    } else {
      // Default to Outlook/Office365
      transporter = nodemailer.createTransport({
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
          user: email,
          pass: email_password
        },
        tls: {
          ciphers: 'SSLv3'
        }
      });
    }

    // Test connection by verifying credentials
    await transporter.verify();
    
    res.json({ success: true, message: 'Email connection test successful' });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to connect to email server. Please check your credentials.' 
    });
  }
});

// Get profile settings (only one record expected)
router.get('/', (req, res) => {
  console.log('[Profile Route] GET / - Route handler called');
  console.log('[Profile Route] Request URL:', req.url);
  console.log('[Profile Route] Request path:', req.path);
  console.log('[Profile Route] Request originalUrl:', req.originalUrl);
  
  const db = req.app.locals.db;
  
  if (!db) {
    console.error('[Profile Route] ERROR: Database not available');
    res.status(500).json({ error: 'Database connection not available' });
    return;
  }
  
  console.log('[Profile Route] Database connection available');
  
  // First, check if the table exists
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_settings'",
    [],
    (tableErr, tableRow) => {
      if (tableErr) {
        console.error('[Profile Route] Error checking for table:', tableErr);
        res.status(500).json({ error: `Error checking table: ${tableErr.message}` });
        return;
      }
      
      if (!tableRow) {
        console.error('[Profile Route] ERROR: admin_settings table does not exist!');
        res.status(500).json({ 
          error: 'admin_settings table does not exist. Please run database migration.' 
        });
        return;
      }
      
      console.log('[Profile Route] Table exists, querying admin_settings...');
      const userId = req.userId;
      db.get(
        'SELECT * FROM admin_settings WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            console.error('[Profile Route] Error fetching profile settings:', err);
            console.error('[Profile Route] Error code:', err.code);
            console.error('[Profile Route] Error message:', err.message);
            res.status(500).json({ error: err.message });
            return;
          }
          // Return empty object with defaults if no settings exist
          if (!row) {
            console.log('[Profile Route] No profile settings found, returning defaults');
            res.json({
              name: '',
              phone: '',
              email: '',
              bank_account_name: '',
              sort_code: '',
              account_number: '',
              home_address: '',
              home_postcode: '',
              currency: 'GBP',
              postcode_resync_needed: 0
            });
            return;
          }
          console.log('[Profile Route] Profile settings found, returning data');
          res.json(row);
        }
      );
    }
  );
});

// Update or create profile settings
router.put('/', (req, res) => {
  console.log('[Profile Route] PUT / - Route handler called');
  const db = req.app.locals.db;
  
  if (!db) {
    res.status(500).json({ error: 'Database connection not available' });
    return;
  }

  const {
    name,
    phone,
    email,
    business_name,
    bank_account_name,
    sort_code,
    account_number,
    home_address,
    home_postcode,
    currency,
    google_maps_api_key,
    email_password,
    email_relay_service,
    email_relay_api_key,
    email_relay_from_email,
    email_relay_from_name,
    email_relay_bcc_enabled
  } = req.body;

      const userId = req.userId;
      
      // Check if settings already exist for this user
      db.get(
        'SELECT id, postcode_resync_needed FROM admin_settings WHERE user_id = ?',
        [userId],
        (err, existing) => {
      if (err) {
        console.error('Error checking existing settings:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      const now = new Date().toISOString();

      if (existing) {
        // Update existing settings
        // Check if postcode changed
        db.get(
          'SELECT home_postcode FROM admin_settings WHERE id = ?',
          [existing.id],
          (postcodeErr, oldRow) => {
            if (postcodeErr) {
              console.error('Error fetching old postcode:', postcodeErr);
              res.status(500).json({ error: postcodeErr.message });
              return;
            }

            const oldPostcode = (oldRow?.home_postcode || '').trim().toUpperCase().replace(/\s+/g, '');
            const newPostcode = (home_postcode || '').trim().toUpperCase().replace(/\s+/g, '');
            const postcodeChanged = oldPostcode !== '' && newPostcode !== '' && oldPostcode !== newPostcode;
            const postcodeResyncNeeded = postcodeChanged ? 1 : (existing.postcode_resync_needed || 0);
            
            console.log('[Profile Route] Postcode check:', {
              oldPostcode,
              newPostcode,
              postcodeChanged,
              existingResyncNeeded: existing.postcode_resync_needed,
              postcodeResyncNeeded
            });

            // Get current password and API key if new ones are not provided
            db.get('SELECT email_password, email_relay_api_key FROM admin_settings WHERE id = ?', [existing.id], (pwdErr, pwdRow) => {
              if (pwdErr) {
                console.error('Error fetching current password/API key:', pwdErr);
                res.status(500).json({ error: pwdErr.message });
                return;
              }
              
              // Only update password if a new value is provided (not empty)
              const finalEmailPassword = email_password && email_password.trim() !== '' 
                ? email_password 
                : (pwdRow?.email_password || '');
              
              // Only update API key if a new value is provided (not empty)
              const finalEmailRelayApiKey = email_relay_api_key && email_relay_api_key.trim() !== '' 
                ? email_relay_api_key 
                : (pwdRow?.email_relay_api_key || '');

              console.log('[Profile Route] Password/API key update:', {
                passwordProvided: email_password ? 'yes' : 'no',
                apiKeyProvided: email_relay_api_key ? 'yes' : 'no',
                finalPassword: finalEmailPassword ? '***' : '(empty)',
                finalApiKey: finalEmailRelayApiKey ? '***' : '(empty)'
              });

              // Convert boolean checkbox value to integer (0 or 1) for SQLite
              const bccEnabled = email_relay_bcc_enabled === true || email_relay_bcc_enabled === 1 || email_relay_bcc_enabled === '1' ? 1 : 0;

              db.run(
                `UPDATE admin_settings SET 
                 name = ?, phone = ?, email = ?, business_name = ?, bank_account_name = ?, 
                 sort_code = ?, account_number = ?, home_address = ?, 
                 home_postcode = ?, currency = ?, google_maps_api_key = ?, email_password = ?, 
                 email_relay_service = ?, email_relay_api_key = ?, email_relay_from_email = ?, 
                 email_relay_from_name = ?, email_relay_bcc_enabled = ?, postcode_resync_needed = ?, updated_at = ?
                 WHERE id = ? AND user_id = ?`,
                [
                  name || '',
                  phone || '',
                  email || '',
                  business_name || '',
                  bank_account_name || '',
                  sort_code || '',
                  account_number || '',
                  home_address || '',
                  home_postcode || '',
                  currency || 'GBP',
                  google_maps_api_key || '',
                  finalEmailPassword,
                  email_relay_service || 'sendgrid',
                  finalEmailRelayApiKey,
                  email_relay_from_email || '',
                  email_relay_from_name || '',
                  bccEnabled,
                  postcodeResyncNeeded,
                  now,
                  existing.id,
                  userId
                ],
              function(updateErr) {
                if (updateErr) {
                  console.error('Error updating admin settings:', updateErr);
                  res.status(500).json({ error: updateErr.message });
                  return;
                }
                const responseData = { 
                  message: 'Admin settings updated successfully',
                  id: existing.id,
                  postcode_resync_needed: postcodeResyncNeeded
                };
                console.log('[Profile Route] Sending response:', responseData);
                res.json(responseData);
              }
            );
            });
          }
        );
        return;
      } else {
        // Create new settings with user_id
        // Convert boolean checkbox value to integer (0 or 1) for SQLite
        const bccEnabled = email_relay_bcc_enabled === true || email_relay_bcc_enabled === 1 || email_relay_bcc_enabled === '1' ? 1 : 0;
        
        db.run(
          `INSERT INTO admin_settings 
           (user_id, name, phone, email, business_name, bank_account_name, sort_code, account_number, 
            home_address, home_postcode, currency, google_maps_api_key, email_password, 
            email_relay_service, email_relay_api_key, email_relay_from_email, email_relay_from_name, 
            email_relay_bcc_enabled, postcode_resync_needed, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            name || '',
            phone || '',
            email || '',
            business_name || '',
            bank_account_name || '',
            sort_code || '',
            account_number || '',
            home_address || '',
            home_postcode || '',
            currency || 'GBP',
            google_maps_api_key || '',
            email_password || '',
            email_relay_service || 'sendgrid',
            email_relay_api_key || '',
            email_relay_from_email || '',
            email_relay_from_name || '',
            bccEnabled,
            0, // postcode_resync_needed defaults to 0 for new records
            now,
            now
          ],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating admin settings:', insertErr);
              res.status(500).json({ error: insertErr.message });
              return;
            }
            res.json({ 
              message: 'Admin settings created successfully',
              id: this.lastID,
              postcode_resync_needed: 0
            });
          }
        );
      }
    }
  );
});

// Clear postcode resync flag
router.post('/clear-postcode-resync', (req, res) => {
  console.log('[Profile Route] POST /clear-postcode-resync - Route handler called');
  const db = req.app.locals.db;
  const userId = req.userId;
  
  if (!db) {
    res.status(500).json({ error: 'Database connection not available' });
    return;
  }

  db.run(
    'UPDATE admin_settings SET postcode_resync_needed = 0 WHERE user_id = ?',
    [userId],
    function(err) {
      if (err) {
        console.error('[Profile Route] Error clearing postcode resync flag:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Postcode resync flag cleared' });
    }
  );
});

// Export profile settings to JSON
router.get('/export/json', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  if (!db) {
    res.status(500).json({ error: 'Database connection not available' });
    return;
  }

  db.get(
    'SELECT * FROM admin_settings WHERE user_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (!row) {
        res.status(404).json({ error: 'Profile settings not found' });
        return;
      }
      
      // Remove sensitive fields or user_id from export (optional - you may want to keep them)
      const exportData = {
        name: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        business_name: row.business_name || '',
        bank_account_name: row.bank_account_name || '',
        sort_code: row.sort_code || '',
        account_number: row.account_number || '',
        home_address: row.home_address || '',
        home_postcode: row.home_postcode || '',
        currency: row.currency || 'GBP',
        google_maps_api_key: row.google_maps_api_key || '',
        email_relay_service: row.email_relay_service || 'sendgrid',
        email_relay_from_email: row.email_relay_from_email || '',
        email_relay_from_name: row.email_relay_from_name || '',
        email_relay_bcc_enabled: row.email_relay_bcc_enabled === 1 || row.email_relay_bcc_enabled === '1',
        // Note: email_password and email_relay_api_key are intentionally excluded for security
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="profile-settings-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    }
  );
});

// Import profile settings from JSON
router.post('/import/json', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const importData = req.body;
  
  if (!db) {
    res.status(500).json({ error: 'Database connection not available' });
    return;
  }

  if (!importData || typeof importData !== 'object') {
    res.status(400).json({ error: 'Invalid import data' });
    return;
  }

  // Check if settings already exist
  db.get(
    'SELECT id FROM admin_settings WHERE user_id = ?',
    [userId],
    (err, existing) => {
      if (err) {
        console.error('Error checking existing settings:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      const now = new Date().toISOString();
      const bccEnabled = importData.email_relay_bcc_enabled === true || importData.email_relay_bcc_enabled === 1 || importData.email_relay_bcc_enabled === '1' ? 1 : 0;

      if (existing) {
        // Update existing settings (preserve sensitive fields)
        db.get('SELECT email_password, email_relay_api_key FROM admin_settings WHERE id = ?', [existing.id], (pwdErr, pwdRow) => {
          if (pwdErr) {
            console.error('Error fetching current password/API key:', pwdErr);
            res.status(500).json({ error: pwdErr.message });
            return;
          }

          db.run(
            `UPDATE admin_settings SET 
             name = ?, phone = ?, email = ?, business_name = ?, bank_account_name = ?, 
             sort_code = ?, account_number = ?, home_address = ?, 
             home_postcode = ?, currency = ?, google_maps_api_key = ?, 
             email_relay_service = ?, email_relay_from_email = ?, 
             email_relay_from_name = ?, email_relay_bcc_enabled = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
            [
              importData.name || '',
              importData.phone || '',
              importData.email || '',
              importData.business_name || '',
              importData.bank_account_name || '',
              importData.sort_code || '',
              importData.account_number || '',
              importData.home_address || '',
              importData.home_postcode || '',
              importData.currency || 'GBP',
              importData.google_maps_api_key || '',
              importData.email_relay_service || 'sendgrid',
              importData.email_relay_from_email || '',
              importData.email_relay_from_name || '',
              bccEnabled,
              now,
              existing.id,
              userId
            ],
            function(updateErr) {
              if (updateErr) {
                console.error('Error updating profile settings:', updateErr);
                res.status(500).json({ error: updateErr.message });
                return;
              }
              res.json({ message: 'Profile settings imported successfully' });
            }
          );
        });
      } else {
        // Create new settings
        db.run(
          `INSERT INTO admin_settings 
           (user_id, name, phone, email, business_name, bank_account_name, sort_code, account_number, 
            home_address, home_postcode, currency, google_maps_api_key, 
            email_relay_service, email_relay_from_email, email_relay_from_name, 
            email_relay_bcc_enabled, postcode_resync_needed, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            importData.name || '',
            importData.phone || '',
            importData.email || '',
            importData.business_name || '',
            importData.bank_account_name || '',
            importData.sort_code || '',
            importData.account_number || '',
            importData.home_address || '',
            importData.home_postcode || '',
            importData.currency || 'GBP',
            importData.google_maps_api_key || '',
            importData.email_relay_service || 'sendgrid',
            importData.email_relay_from_email || '',
            importData.email_relay_from_name || '',
            bccEnabled,
            0, // postcode_resync_needed defaults to 0
            now,
            now
          ],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating profile settings:', insertErr);
              res.status(500).json({ error: insertErr.message });
              return;
            }
            res.json({ message: 'Profile settings imported successfully' });
          }
        );
      }
    }
  );
});

export default router;
