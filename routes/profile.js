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
    email_password
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

            // Get current password if new one is not provided
            db.get('SELECT email_password FROM admin_settings WHERE id = ?', [existing.id], (pwdErr, pwdRow) => {
              if (pwdErr) {
                console.error('Error fetching current password:', pwdErr);
                res.status(500).json({ error: pwdErr.message });
                return;
              }
              
              // Only update password if a new value is provided (not empty)
              const finalEmailPassword = email_password && email_password.trim() !== '' 
                ? email_password 
                : (pwdRow?.email_password || '');

              console.log('[Profile Route] Password update:', {
                provided: email_password ? 'yes' : 'no',
                hasValue: email_password && email_password.trim() !== '',
                finalPassword: finalEmailPassword ? '***' : '(empty)'
              });

              db.run(
                `UPDATE admin_settings SET 
                 name = ?, phone = ?, email = ?, business_name = ?, bank_account_name = ?, 
                 sort_code = ?, account_number = ?, home_address = ?, 
                 home_postcode = ?, currency = ?, google_maps_api_key = ?, email_password = ?, postcode_resync_needed = ?, updated_at = ?
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
        db.run(
          `INSERT INTO admin_settings 
           (user_id, name, phone, email, business_name, bank_account_name, sort_code, account_number, 
            home_address, home_postcode, currency, google_maps_api_key, email_password, postcode_resync_needed, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export default router;
