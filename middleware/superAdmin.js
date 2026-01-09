import { authenticateToken } from './auth.js';

// Middleware to check if user is a super admin
export const requireSuperAdmin = (req, res, next) => {
  // First authenticate the token
  authenticateToken(req, res, () => {
    const db = req.app.locals.db;
    const userId = req.userId;

    // Check if user is a super admin
    db.get('SELECT is_super_admin FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Error checking super admin status:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if user is super admin (1 = true, 0 = false)
      if (user.is_super_admin !== 1) {
        return res.status(403).json({ error: 'Super admin access required' });
      }

      // User is a super admin, proceed
      next();
    });
  });
};
