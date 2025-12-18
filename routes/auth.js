import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Register new user
router.post('/register', async (req, res) => {
  const db = req.app.locals.db;
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Check if user already exists
  db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existingUser) => {
    if (err) {
      console.error('Error checking for existing user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    try {
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      db.run(
        'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
        [username, passwordHash, email || null],
        function(insertErr) {
          if (insertErr) {
            console.error('Error creating user:', insertErr);
            return res.status(500).json({ error: 'Error creating user' });
          }

          const userId = this.lastID;

          // Create default services for the new user
          const defaultServices = [
            { service_name: 'Blow Dry', type: 'Hair', price: 15.00 },
            { service_name: 'Shampoo & Set', type: 'Hair', price: 14.00 },
            { service_name: 'Dry Cut', type: 'Hair', price: 14.00 },
            { service_name: 'Cut & Blow Dry', type: 'Hair', price: 25.00 },
            { service_name: 'Cut & Set', type: 'Hair', price: 24.00 },
            { service_name: 'Restyling', type: 'Hair', price: 30.00 },
            { service_name: 'Gents Dry Cut', type: 'Hair', price: 14.50 },
            { service_name: 'Clipper Cuts', type: 'Hair', price: 6.00 },
            { service_name: 'Beard Trim', type: 'Hair', price: 5.00 },
            { service_name: 'Child Cut', type: 'Hair', price: 10.00 },
            { service_name: 'Child Cut & Blow Dry', type: 'Hair', price: 18.00 },
            { service_name: 'Other', type: 'Hair', price: 0.00 },
            { service_name: 'File & Polish', type: 'Nails', price: 10.00 },
            { service_name: 'Manicure', type: 'Nails', price: 18.00 },
            { service_name: 'Gel Polish', type: 'Nails', price: 20.00 },
            { service_name: 'Removal', type: 'Nails', price: 6.00 },
            { service_name: 'Gel Removal & Re-Apply', type: 'Nails', price: 25.00 },
            { service_name: 'Pedicure', type: 'Nails', price: 20.00 },
            { service_name: 'Blow Dry & Fringe Trim', type: 'Hair', price: 17.00 },
            { service_name: 'Nails Cut & Filed', type: 'Nails', price: 6.00 },
            { service_name: 'Wash & Cut', type: 'Hair', price: 20.00 },
            { service_name: 'Colour', type: 'Hair', price: 60.00 },
            { service_name: 'Colour, cut & blow dry', type: 'Hair', price: 45.00 },
            { service_name: 'Hair wash', type: 'Hair', price: 5.00 }
          ];

          // Insert default services for the new user (ignore if already exists)
          const stmt = db.prepare('INSERT OR IGNORE INTO services (user_id, service_name, type, price) VALUES (?, ?, ?, ?)');
          defaultServices.forEach(service => {
            stmt.run([userId, service.service_name, service.type, service.price]);
          });
          stmt.finalize();

          // Generate JWT token
          const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });

          res.json({
            token,
            user: {
              id: userId,
              username,
              email
            }
          });
        }
      );
    } catch (error) {
      console.error('Error hashing password:', error);
      res.status(500).json({ error: 'Error creating user' });
    }
  });
});

// Login
router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Find user
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      console.error('Error finding user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    try {
      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Generate JWT token
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Error verifying password:', error);
      res.status(500).json({ error: 'Error verifying password' });
    }
  });
});

// Check if user is authenticated (verify token)
router.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = req.app.locals.db;

    db.get('SELECT id, username, email FROM users WHERE id = ?', [decoded.userId], (err, user) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Request password reset
router.post('/request-password-reset', async (req, res) => {
  const db = req.app.locals.db;
  const { username, email } = req.body;

  if (!username && !email) {
    return res.status(400).json({ error: 'Username or email is required' });
  }

  // Find user by username or email
  const query = email 
    ? 'SELECT id, username, email FROM users WHERE email = ?'
    : 'SELECT id, username, email FROM users WHERE username = ?';
  const param = email || username;

  db.get(query, [param], (err, user) => {
    if (err) {
      console.error('Error finding user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      // Don't reveal if user exists for security
      return res.json({ message: 'If an account exists with that username or email, a password reset link has been sent.' });
    }

    // Generate a simple reset token (in production, use a more secure method)
    const resetToken = jwt.sign({ userId: user.id, type: 'password-reset' }, JWT_SECRET, { expiresIn: '1h' });

    // In a real application, you would send an email here with the reset token
    // For now, we'll just return it (this is for development only)
    res.json({
      message: 'Password reset token generated. In production, this would be sent via email.',
      resetToken: resetToken // Remove this in production
    });
  });
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  const db = req.app.locals.db;
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Verify reset token
    const decoded = jwt.verify(resetToken, JWT_SECRET);
    
    if (decoded.type !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, decoded.userId],
      function(updateErr) {
        if (updateErr) {
          console.error('Error updating password:', updateErr);
          return res.status(500).json({ error: 'Error updating password' });
        }

        res.json({ message: 'Password reset successfully' });
      }
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

// Reassign all existing data to current user
router.post('/import-all-data', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;
  const currentUserId = req.userId;

  try {
    // Get counts before update
    const beforeCounts = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          (SELECT COUNT(*) FROM address_data WHERE user_id IS NOT NULL AND user_id != ?) as locations,
          (SELECT COUNT(*) FROM services WHERE user_id IS NOT NULL AND user_id != ?) as services,
          (SELECT COUNT(*) FROM appointments WHERE user_id IS NOT NULL AND user_id != ?) as appointments
      `, [currentUserId, currentUserId, currentUserId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Update locations (address_data) - handle conflicts by deleting duplicates first
    await new Promise((resolve, reject) => {
      // First, delete any locations that would conflict (same location_name for current user)
      db.run(`
        DELETE FROM address_data 
        WHERE user_id = ? 
        AND location_name IN (
          SELECT location_name FROM address_data WHERE user_id IS NOT NULL AND user_id != ?
        )
      `, [currentUserId, currentUserId], (deleteErr) => {
        if (deleteErr) {
          console.error('Error deleting conflicting locations:', deleteErr);
        }
        
        // Now update all other users' locations to current user
        db.run(`
          UPDATE address_data 
          SET user_id = ? 
          WHERE user_id IS NOT NULL AND user_id != ?
        `, [currentUserId, currentUserId], (updateErr) => {
          if (updateErr) {
            reject(updateErr);
            return;
          }
          resolve();
        });
      });
    });

    // Update services - handle conflicts by deleting duplicates first
    await new Promise((resolve, reject) => {
      // First, delete any services that would conflict (same service_name for current user)
      db.run(`
        DELETE FROM services 
        WHERE user_id = ? 
        AND service_name IN (
          SELECT service_name FROM services WHERE user_id IS NOT NULL AND user_id != ?
        )
      `, [currentUserId, currentUserId], (deleteErr) => {
        if (deleteErr) {
          console.error('Error deleting conflicting services:', deleteErr);
        }
        
        // Now update all other users' services to current user
        db.run(`
          UPDATE services 
          SET user_id = ? 
          WHERE user_id IS NOT NULL AND user_id != ?
        `, [currentUserId, currentUserId], (updateErr) => {
          if (updateErr) {
            reject(updateErr);
            return;
          }
          resolve();
        });
      });
    });

    // Update appointments
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE appointments 
        SET user_id = ? 
        WHERE user_id IS NOT NULL AND user_id != ?
      `, [currentUserId, currentUserId], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    // Handle admin_settings - update the first one found to current user
    await new Promise((resolve, reject) => {
      db.get('SELECT * FROM admin_settings WHERE user_id != ? ORDER BY id LIMIT 1', [currentUserId], (err, otherSettings) => {
        if (err) {
          reject(err);
          return;
        }

        if (!otherSettings) {
          resolve();
          return;
        }

        // Check if current user already has settings
        db.get('SELECT * FROM admin_settings WHERE user_id = ?', [currentUserId], (err, currentSettings) => {
          if (err) {
            reject(err);
            return;
          }

          if (currentSettings) {
            // Update existing settings with values from other user (only if current is empty/null)
            db.run(`
              UPDATE admin_settings SET
                name = COALESCE(NULLIF(name, ''), ?),
                phone = COALESCE(NULLIF(phone, ''), ?),
                email = COALESCE(NULLIF(email, ''), ?),
                business_name = COALESCE(NULLIF(business_name, ''), ?),
                bank_account_name = COALESCE(NULLIF(bank_account_name, ''), ?),
                sort_code = COALESCE(NULLIF(sort_code, ''), ?),
                account_number = COALESCE(NULLIF(account_number, ''), ?),
                home_address = COALESCE(NULLIF(home_address, ''), ?),
                home_postcode = COALESCE(NULLIF(home_postcode, ''), ?),
                currency = COALESCE(NULLIF(currency, ''), ?),
                google_maps_api_key = COALESCE(NULLIF(google_maps_api_key, ''), ?),
                email_password = COALESCE(NULLIF(email_password, ''), ?),
                smtp_host = COALESCE(NULLIF(smtp_host, ''), ?),
                smtp_port = COALESCE(smtp_port, ?),
                smtp_secure = COALESCE(smtp_secure, ?),
                smtp_username = COALESCE(NULLIF(smtp_username, ''), ?),
                azure_client_id = COALESCE(NULLIF(azure_client_id, ''), ?),
                azure_client_secret = COALESCE(NULLIF(azure_client_secret, ''), ?),
                azure_tenant_id = COALESCE(NULLIF(azure_tenant_id, ''), ?),
                use_graph_api = COALESCE(use_graph_api, ?),
                email_relay_service = COALESCE(NULLIF(email_relay_service, ''), ?),
                email_relay_api_key = COALESCE(NULLIF(email_relay_api_key, ''), ?),
                email_relay_from_email = COALESCE(NULLIF(email_relay_from_email, ''), ?),
                email_relay_from_name = COALESCE(NULLIF(email_relay_from_name, ''), ?),
                use_email_relay = COALESCE(use_email_relay, ?),
                business_service_description = COALESCE(NULLIF(business_service_description, ''), ?),
                email_signature = COALESCE(NULLIF(email_signature, ''), ?),
                default_email_content = COALESCE(NULLIF(default_email_content, ''), ?),
                updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?
            `, [
              otherSettings.name,
              otherSettings.phone,
              otherSettings.email,
              otherSettings.business_name,
              otherSettings.bank_account_name,
              otherSettings.sort_code,
              otherSettings.account_number,
              otherSettings.home_address,
              otherSettings.home_postcode,
              otherSettings.currency,
              otherSettings.google_maps_api_key,
              otherSettings.email_password,
              otherSettings.smtp_host,
              otherSettings.smtp_port,
              otherSettings.smtp_secure,
              otherSettings.smtp_username,
              otherSettings.azure_client_id,
              otherSettings.azure_client_secret,
              otherSettings.azure_tenant_id,
              otherSettings.use_graph_api,
              otherSettings.email_relay_service,
              otherSettings.email_relay_api_key,
              otherSettings.email_relay_from_email,
              otherSettings.email_relay_from_name,
              otherSettings.use_email_relay,
              otherSettings.business_service_description,
              otherSettings.email_signature,
              otherSettings.default_email_content,
              currentUserId
            ], (updateErr) => {
              if (updateErr) {
                console.error('Error updating admin settings:', updateErr);
              }
              // Update the other user's settings to current user
              db.run('UPDATE admin_settings SET user_id = ? WHERE id = ?', [currentUserId, otherSettings.id], (reassignErr) => {
                if (reassignErr && !reassignErr.message.includes('UNIQUE constraint')) {
                  console.error('Error reassigning admin settings:', reassignErr);
                }
                resolve();
              });
            });
          } else {
            // Just update the other user's settings to current user
            db.run('UPDATE admin_settings SET user_id = ? WHERE id = ?', [currentUserId, otherSettings.id], (reassignErr) => {
              if (reassignErr) {
                console.error('Error reassigning admin settings:', reassignErr);
              }
              resolve();
            });
          }
        });
      });
    });

    // Get counts after update
    const afterCounts = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          (SELECT COUNT(*) FROM address_data WHERE user_id = ?) as locations,
          (SELECT COUNT(*) FROM services WHERE user_id = ?) as services,
          (SELECT COUNT(*) FROM appointments WHERE user_id = ?) as appointments
      `, [currentUserId, currentUserId, currentUserId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.json({
      success: true,
      message: 'Data reassigned successfully',
      counts: {
        locations: afterCounts.locations,
        services: afterCounts.services,
        appointments: afterCounts.appointments
      },
      reassigned: {
        locations: beforeCounts.locations,
        services: beforeCounts.services,
        appointments: beforeCounts.appointments
      }
    });
  } catch (error) {
    console.error('Error reassigning data:', error);
    res.status(500).json({ error: 'Error reassigning data: ' + error.message });
  }
});

// Export all user data
router.get('/export-data', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;
  const currentUserId = req.userId;

  try {
    // Get all user data
    const [locations, services, appointments, settings] = await Promise.all([
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM address_data WHERE user_id = ?', [currentUserId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM services WHERE user_id = ?', [currentUserId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM appointments WHERE user_id = ?', [currentUserId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT * FROM admin_settings WHERE user_id = ?', [currentUserId], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      })
    ]);

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        locations: locations.map(loc => {
          const { user_id, ...rest } = loc;
          return rest;
        }),
        services: services.map(svc => {
          const { user_id, ...rest } = svc;
          return rest;
        }),
        appointments: appointments.map(apt => {
          const { user_id, ...rest } = apt;
          return rest;
        }),
        profile: settings ? (() => {
          const { user_id, id, ...rest } = settings;
          return rest;
        })() : null
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="katescuts-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).setHeader('Content-Type', 'application/json').json({ error: 'Error exporting data: ' + error.message });
  }
});

// Import user data from file
router.post('/import-data', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;
  const currentUserId = req.userId;

  try {
    const importData = req.body;

    if (!importData || !importData.data) {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const { locations, services, appointments, profile } = importData.data;
    const results = {
      locations: { imported: 0, skipped: 0 },
      services: { imported: 0, skipped: 0 },
      appointments: { imported: 0, skipped: 0 },
      profile: { updated: false }
    };

    // Import locations
    if (Array.isArray(locations)) {
      for (const location of locations) {
        await new Promise((resolve) => {
          db.run(`
            INSERT OR IGNORE INTO address_data 
            (user_id, location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            currentUserId,
            location.location_name,
            location.address || '',
            location.city_town || '',
            location.post_code || '',
            location.distance || null,
            location.contact_name || '',
            location.email_address || '',
            location.contact_details || '',
            location.phone || '',
            location.place_via_ludham || '',
            location.mileage || null,
            location.notes || ''
          ], function(err) {
            if (err && !err.message.includes('UNIQUE constraint')) {
              console.error('Error importing location:', err);
              results.locations.skipped++;
            } else if (this.changes > 0) {
              results.locations.imported++;
            } else {
              results.locations.skipped++;
            }
            resolve();
          });
        });
      }
    }

    // Import services
    if (Array.isArray(services)) {
      for (const service of services) {
        await new Promise((resolve) => {
          db.run(`
            INSERT OR IGNORE INTO services (user_id, service_name, type, price)
            VALUES (?, ?, ?, ?)
          `, [
            currentUserId,
            service.service_name,
            service.type,
            service.price
          ], function(err) {
            if (err && !err.message.includes('UNIQUE constraint')) {
              console.error('Error importing service:', err);
              results.services.skipped++;
            } else if (this.changes > 0) {
              results.services.imported++;
            } else {
              results.services.skipped++;
            }
            resolve();
          });
        });
      }
    }

    // Import appointments
    if (Array.isArray(appointments)) {
      for (const appointment of appointments) {
        await new Promise((resolve) => {
          db.run(`
            INSERT INTO appointments 
            (user_id, client_name, service, type, date, location, price, paid, distance, payment_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            currentUserId,
            appointment.client_name,
            appointment.service,
            appointment.type,
            appointment.date,
            appointment.location,
            appointment.price,
            appointment.paid || 0,
            appointment.distance || null,
            appointment.payment_date || null,
            appointment.created_at || new Date().toISOString()
          ], function(err) {
            if (err) {
              console.error('Error importing appointment:', err);
              results.appointments.skipped++;
            } else {
              results.appointments.imported++;
            }
            resolve();
          });
        });
      }
    }

    // Import/update profile settings
    if (profile) {
      await new Promise((resolve) => {
        db.get('SELECT * FROM admin_settings WHERE user_id = ?', [currentUserId], (err, existing) => {
          if (err) {
            console.error('Error checking existing profile:', err);
            resolve();
            return;
          }

          if (existing) {
            // Update existing profile (merge with existing data)
            db.run(`
              UPDATE admin_settings SET
                name = COALESCE(?, name),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                business_name = COALESCE(?, business_name),
                bank_account_name = COALESCE(?, bank_account_name),
                sort_code = COALESCE(?, sort_code),
                account_number = COALESCE(?, account_number),
                home_address = COALESCE(?, home_address),
                home_postcode = COALESCE(?, home_postcode),
                currency = COALESCE(?, currency),
                google_maps_api_key = COALESCE(?, google_maps_api_key),
                email_password = COALESCE(?, email_password),
                smtp_host = COALESCE(?, smtp_host),
                smtp_port = COALESCE(?, smtp_port),
                smtp_secure = COALESCE(?, smtp_secure),
                smtp_username = COALESCE(?, smtp_username),
                azure_client_id = COALESCE(?, azure_client_id),
                azure_client_secret = COALESCE(?, azure_client_secret),
                azure_tenant_id = COALESCE(?, azure_tenant_id),
                use_graph_api = COALESCE(?, use_graph_api),
                email_relay_service = COALESCE(?, email_relay_service),
                email_relay_api_key = COALESCE(?, email_relay_api_key),
                email_relay_from_email = COALESCE(?, email_relay_from_email),
                email_relay_from_name = COALESCE(?, email_relay_from_name),
                use_email_relay = COALESCE(?, use_email_relay),
                business_service_description = COALESCE(?, business_service_description),
                email_signature = COALESCE(?, email_signature),
                default_email_content = COALESCE(?, default_email_content),
                updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?
            `, [
              profile.name, profile.phone, profile.email, profile.business_name,
              profile.bank_account_name, profile.sort_code, profile.account_number,
              profile.home_address, profile.home_postcode, profile.currency,
              profile.google_maps_api_key, profile.email_password,
              profile.smtp_host, profile.smtp_port, profile.smtp_secure,
              profile.smtp_username, profile.azure_client_id, profile.azure_client_secret,
              profile.azure_tenant_id, profile.use_graph_api,
              profile.email_relay_service, profile.email_relay_api_key,
              profile.email_relay_from_email, profile.email_relay_from_name,
              profile.use_email_relay, profile.business_service_description,
              profile.email_signature, profile.default_email_content,
              currentUserId
            ], (updateErr) => {
              if (!updateErr) {
                results.profile.updated = true;
              }
              resolve();
            });
          } else {
            // Create new profile
            db.run(`
              INSERT INTO admin_settings 
              (user_id, name, phone, email, business_name, bank_account_name, sort_code, account_number, 
               home_address, home_postcode, currency, google_maps_api_key, email_password,
               smtp_host, smtp_port, smtp_secure, smtp_username,
               azure_client_id, azure_client_secret, azure_tenant_id, use_graph_api,
               email_relay_service, email_relay_api_key, email_relay_from_email, email_relay_from_name, use_email_relay,
               business_service_description, email_signature, default_email_content)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              currentUserId,
              profile.name, profile.phone, profile.email, profile.business_name,
              profile.bank_account_name, profile.sort_code, profile.account_number,
              profile.home_address, profile.home_postcode, profile.currency || 'GBP',
              profile.google_maps_api_key, profile.email_password,
              profile.smtp_host, profile.smtp_port, profile.smtp_secure,
              profile.smtp_username, profile.azure_client_id, profile.azure_client_secret,
              profile.azure_tenant_id, profile.use_graph_api,
              profile.email_relay_service, profile.email_relay_api_key,
              profile.email_relay_from_email, profile.email_relay_from_name,
              profile.use_email_relay, profile.business_service_description,
              profile.email_signature, profile.default_email_content
            ], (insertErr) => {
              if (!insertErr) {
                results.profile.updated = true;
              }
              resolve();
            });
          }
        });
      });
    }

    res.json({
      success: true,
      message: 'Data imported successfully',
      results
    });
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Error importing data: ' + error.message });
  }
});

// Update username
router.put('/update-username', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;
  const currentUserId = req.userId;
  const { newUsername } = req.body;

  if (!newUsername || newUsername.trim().length === 0) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const trimmedUsername = newUsername.trim();

  // Check if username already exists
  db.get('SELECT id FROM users WHERE username = ? AND id != ?', [trimmedUsername, currentUserId], async (err, existingUser) => {
    if (err) {
      console.error('Error checking for existing username:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Update username
    db.run('UPDATE users SET username = ? WHERE id = ?', [trimmedUsername, currentUserId], function(updateErr) {
      if (updateErr) {
        console.error('Error updating username:', updateErr);
        return res.status(500).json({ error: 'Error updating username' });
      }

      // Generate new token with updated username
      const newToken = jwt.sign({ userId: currentUserId, username: trimmedUsername }, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        success: true,
        message: 'Username updated successfully',
        token: newToken,
        user: {
          id: currentUserId,
          username: trimmedUsername
        }
      });
    });
  });
});

// Update password
router.put('/update-password', authenticateToken, async (req, res) => {
  const db = req.app.locals.db;
  const currentUserId = req.userId;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, currentUserId], function(updateErr) {
      if (updateErr) {
        console.error('Error updating password:', updateErr);
        return res.status(500).json({ error: 'Error updating password' });
      }

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).json({ error: 'Error updating password' });
  }
});

export default router;

