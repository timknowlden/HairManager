import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// All routes require super admin access
router.use(requireSuperAdmin);

// Get system statistics
router.get('/stats', (req, res) => {
  const db = req.app.locals.db;

  const stats = {};

  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (err) {
      console.error('Error fetching user count:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    stats.totalUsers = row.count;

    db.get('SELECT COUNT(*) as count FROM appointments', [], (err2, row2) => {
      if (err2) {
        console.error('Error fetching appointment count:', err2);
        return res.status(500).json({ error: 'Database error' });
      }
      stats.totalAppointments = row2.count;

      db.get('SELECT COUNT(*) as count FROM address_data', [], (err3, row3) => {
        if (err3) {
          console.error('Error fetching location count:', err3);
          return res.status(500).json({ error: 'Database error' });
        }
        stats.totalLocations = row3.count;

        db.get('SELECT COUNT(*) as count FROM services', [], (err4, row4) => {
          if (err4) {
            console.error('Error fetching service count:', err4);
            return res.status(500).json({ error: 'Database error' });
          }
          stats.totalServices = row4.count;

          res.json(stats);
        });
      });
    });
  });
});

// Get all users
router.get('/', (req, res) => {
  const db = req.app.locals.db;

  db.all(
    `SELECT 
      id, 
      username, 
      email, 
      is_super_admin,
      created_at,
      (SELECT COUNT(*) FROM appointments WHERE user_id = users.id) as appointment_count,
      (SELECT COUNT(*) FROM address_data WHERE user_id = users.id) as location_count,
      (SELECT COUNT(*) FROM services WHERE user_id = users.id) as service_count
    FROM users 
    ORDER BY created_at DESC`,
    [],
    (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json(users);
    }
  );
});

// Get single user by ID
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  db.get(
    `SELECT 
      id, 
      username, 
      email, 
      is_super_admin,
      created_at,
      (SELECT COUNT(*) FROM appointments WHERE user_id = users.id) as appointment_count,
      (SELECT COUNT(*) FROM address_data WHERE user_id = users.id) as location_count,
      (SELECT COUNT(*) FROM services WHERE user_id = users.id) as service_count
    FROM users 
    WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    }
  );
});

// Create new user
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { username, password, email, is_super_admin } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  // Check if user already exists
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username], async (err, existingUser) => {
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
        'INSERT INTO users (username, password_hash, email, is_super_admin) VALUES (?, ?, ?, ?)',
        [username, passwordHash, email || null, is_super_admin ? 1 : 0],
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

          // Insert default services for the new user
          const stmt = db.prepare('INSERT OR IGNORE INTO services (user_id, service_name, type, price) VALUES (?, ?, ?, ?)');
          defaultServices.forEach(service => {
            stmt.run([userId, service.service_name, service.type, service.price]);
          });
          stmt.finalize();

          // Fetch the created user
          db.get(
            `SELECT 
              id, 
              username, 
              email, 
              is_super_admin,
              created_at
            FROM users 
            WHERE id = ?`,
            [userId],
            (fetchErr, newUser) => {
              if (fetchErr) {
                console.error('Error fetching created user:', fetchErr);
                return res.status(500).json({ error: 'User created but failed to fetch' });
              }

              res.status(201).json(newUser);
            }
          );
        }
      );
    } catch (error) {
      console.error('Error hashing password:', error);
      res.status(500).json({ error: 'Error creating user' });
    }
  });
});

// Update user
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id);
  const { username, email, is_super_admin } = req.body;

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Prevent updating the current user's super admin status (safety check)
  if (userId === req.userId && is_super_admin === false) {
    return res.status(400).json({ error: 'Cannot remove super admin status from yourself' });
  }

  // Check if username is being changed and if it already exists
  if (username) {
    db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?', [username, userId], async (err, existingUser) => {
      if (err) {
        console.error('Error checking for existing username:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Update user
      const updates = [];
      const values = [];

      if (username) {
        updates.push('username = ?');
        values.push(username);
      }
      if (email !== undefined) {
        updates.push('email = ?');
        values.push(email || null);
      }
      if (is_super_admin !== undefined) {
        updates.push('is_super_admin = ?');
        values.push(is_super_admin ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(userId);

      db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(updateErr) {
          if (updateErr) {
            console.error('Error updating user:', updateErr);
            return res.status(500).json({ error: 'Error updating user' });
          }

          // Fetch updated user
          db.get(
            `SELECT 
              id, 
              username, 
              email, 
              is_super_admin,
              created_at
            FROM users 
            WHERE id = ?`,
            [userId],
            (fetchErr, updatedUser) => {
              if (fetchErr) {
                console.error('Error fetching updated user:', fetchErr);
                return res.status(500).json({ error: 'User updated but failed to fetch' });
              }

              res.json(updatedUser);
            }
          );
        }
      );
    });
  } else {
    // Update without username change
    const updates = [];
    const values = [];

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email || null);
    }
    if (is_super_admin !== undefined) {
      updates.push('is_super_admin = ?');
      values.push(is_super_admin ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);

    db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values,
      function(updateErr) {
        if (updateErr) {
          console.error('Error updating user:', updateErr);
          return res.status(500).json({ error: 'Error updating user' });
        }

        // Fetch updated user
        db.get(
          `SELECT 
            id, 
            username, 
            email, 
            is_super_admin,
            created_at
          FROM users 
          WHERE id = ?`,
          [userId],
          (fetchErr, updatedUser) => {
            if (fetchErr) {
              console.error('Error fetching updated user:', fetchErr);
              return res.status(500).json({ error: 'User updated but failed to fetch' });
            }

            res.json(updatedUser);
          }
        );
      }
    );
  }
});

// Reset user password
router.post('/:id/reset-password', async (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id);
  const { newPassword } = req.body;

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId], function(updateErr) {
      if (updateErr) {
        console.error('Error updating password:', updateErr);
        return res.status(500).json({ error: 'Error updating password' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: 'Password reset successfully' });
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
});

// Delete user
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Prevent deleting yourself
  if (userId === req.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  // Check if user exists
  db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (cascade will handle related data)
    db.run('DELETE FROM users WHERE id = ?', [userId], function(deleteErr) {
      if (deleteErr) {
        console.error('Error deleting user:', deleteErr);
        return res.status(500).json({ error: 'Error deleting user' });
      }

      res.json({ success: true, message: 'User deleted successfully' });
    });
  });
});

// Impersonate user (login as another user)
router.post('/:id/impersonate', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id);
  const originalAdminId = req.userId;
  const originalAdminUsername = req.username;

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Fetch the target user
  db.get(
    'SELECT id, username, email, is_super_admin FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) {
        console.error('Error fetching user for impersonation:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Generate a new token for the target user
      const token = jwt.sign(
        { 
          userId: user.id, 
          username: user.username,
          is_super_admin: user.is_super_admin 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Generate a token to return to the original admin
      const returnToken = jwt.sign(
        { 
          userId: originalAdminId, 
          username: originalAdminUsername,
          is_super_admin: 1 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_super_admin: user.is_super_admin
        },
        impersonation: {
          originalAdminId,
          originalAdminUsername,
          returnToken
        }
      });
    }
  );
});

export default router;
