import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();

// Get all subscription plans (public)
router.get('/plans', (req, res) => {
  const db = req.app.locals.db;

  db.all(
    `SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC`,
    [],
    (err, plans) => {
      if (err) {
        console.error('Error fetching plans:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Parse features JSON for each plan
      const parsedPlans = plans.map(plan => ({
        ...plan,
        features: plan.features ? JSON.parse(plan.features) : []
      }));

      res.json(parsedPlans);
    }
  );
});

// Get current user's subscription
router.get('/my-subscription', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  db.get(
    `SELECT 
      us.*,
      sp.name as plan_name,
      sp.display_name as plan_display_name,
      sp.max_appointments,
      sp.max_locations,
      sp.max_services,
      sp.features,
      sp.price_monthly,
      sp.price_yearly
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ?`,
    [userId],
    (err, subscription) => {
      if (err) {
        console.error('Error fetching subscription:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!subscription) {
        // User has no subscription, return free plan info
        db.get(
          `SELECT * FROM subscription_plans WHERE name = 'free'`,
          [],
          (planErr, freePlan) => {
            if (planErr || !freePlan) {
              return res.json({
                plan_name: 'free',
                plan_display_name: 'Free',
                max_appointments: 50,
                max_locations: 2,
                max_services: 10,
                status: 'active'
              });
            }
            res.json({
              plan_name: freePlan.name,
              plan_display_name: freePlan.display_name,
              max_appointments: freePlan.max_appointments,
              max_locations: freePlan.max_locations,
              max_services: freePlan.max_services,
              features: freePlan.features ? JSON.parse(freePlan.features) : [],
              status: 'active'
            });
          }
        );
        return;
      }

      subscription.features = subscription.features ? JSON.parse(subscription.features) : [];
      res.json(subscription);
    }
  );
});

// Get current user's subscription usage (plan + usage stats)
router.get('/usage', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Get user's current plan and limits
  db.get(
    `SELECT 
      sp.name as plan_name,
      sp.display_name as plan_display_name,
      sp.max_appointments,
      sp.max_locations,
      sp.max_services,
      sp.features,
      sp.price_monthly,
      sp.currency,
      us.status as subscription_status
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND (us.status = 'active' OR us.status IS NULL)`,
    [userId],
    (err, userSubscription) => {
      if (err) {
        console.error('Error fetching user subscription:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[subscriptions/usage] User subscription query result:', userSubscription);
      
      let currentPlan = userSubscription;
      if (!currentPlan) {
        // If no active subscription, get the 'Free' plan
        db.get(
          `SELECT name, display_name, max_appointments, max_locations, max_services, features, price_monthly, currency 
           FROM subscription_plans WHERE name = 'free'`,
          [],
          (planErr, freePlan) => {
            if (planErr || !freePlan) {
              return res.status(500).json({ error: 'No default "Free" plan found.' });
            }
            currentPlan = {
              name: freePlan.name,
              display_name: freePlan.display_name,
              max_appointments: freePlan.max_appointments,
              max_locations: freePlan.max_locations,
              max_services: freePlan.max_services,
              features: freePlan.features ? JSON.parse(freePlan.features) : [],
              price_monthly: freePlan.price_monthly,
              currency: freePlan.currency
            };
            fetchUsageAndRespond();
          }
        );
        return;
      }

      // Parse features if needed
      if (currentPlan.features && typeof currentPlan.features === 'string') {
        currentPlan.features = JSON.parse(currentPlan.features);
      }

      fetchUsageAndRespond();

      function fetchUsageAndRespond() {
        // Get all usage counts in a single optimized query
        db.get(
          `SELECT 
            (SELECT COUNT(*) FROM appointments WHERE user_id = ?) as appointment_count,
            (SELECT COUNT(*) FROM address_data WHERE user_id = ?) as location_count,
            (SELECT COUNT(*) FROM services WHERE user_id = ?) as service_count`,
          [userId, userId, userId],
          (err, row) => {
            if (err) {
              console.error('Error fetching usage counts:', err);
              return res.status(500).json({ error: 'Database error' });
            }

            const planData = {
              name: currentPlan.plan_name || currentPlan.name,
              display_name: currentPlan.plan_display_name || currentPlan.display_name,
              max_appointments: currentPlan.max_appointments,
              max_locations: currentPlan.max_locations,
              max_services: currentPlan.max_services,
              features: currentPlan.features || [],
              price: currentPlan.price_monthly,
              currency: currentPlan.currency || 'GBP'
            };
            
            console.log('[subscriptions/usage] Returning plan data:', planData);
            console.log('[subscriptions/usage] Plan name:', planData.name);
            
            res.json({
              plan: planData,
              usage: {
                appointments: row.appointment_count || 0,
                locations: row.location_count || 0,
                services: row.service_count || 0
              }
            });
          }
        );
      }
    }
  );
});

// Get current user's usage statistics
router.get('/my-usage', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  const usage = {};

  // Get appointment count
  db.get(
    `SELECT COUNT(*) as count FROM appointments WHERE user_id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching appointment count:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      usage.appointments = row.count;

      // Get location count
      db.get(
        `SELECT COUNT(*) as count FROM address_data WHERE user_id = ?`,
        [userId],
        (err2, row2) => {
          if (err2) {
            console.error('Error fetching location count:', err2);
            return res.status(500).json({ error: 'Database error' });
          }
          usage.locations = row2.count;

          // Get service count
          db.get(
            `SELECT COUNT(*) as count FROM services WHERE user_id = ?`,
            [userId],
            (err3, row3) => {
              if (err3) {
                console.error('Error fetching service count:', err3);
                return res.status(500).json({ error: 'Database error' });
              }
              usage.services = row3.count;

              res.json(usage);
            }
          );
        }
      );
    }
  );
});

// Check if user can add more items (used by frontend to show warnings)
router.get('/check-limits', authenticateToken, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { type } = req.query; // 'appointment', 'location', or 'service'

  // Get user's subscription limits
  db.get(
    `SELECT 
      COALESCE(sp.max_appointments, 50) as max_appointments,
      COALESCE(sp.max_locations, 2) as max_locations,
      COALESCE(sp.max_services, 10) as max_services
    FROM users u
    LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active'
    LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE u.id = ?`,
    [userId],
    (err, limits) => {
      if (err) {
        console.error('Error fetching limits:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Default to free plan limits if no subscription
      const maxLimits = limits || { max_appointments: 50, max_locations: 2, max_services: 10 };

      // Get current usage based on type
      let countQuery = '';
      let maxLimit = 0;

      switch (type) {
        case 'appointment':
          countQuery = 'SELECT COUNT(*) as count FROM appointments WHERE user_id = ?';
          maxLimit = maxLimits.max_appointments;
          break;
        case 'location':
          countQuery = 'SELECT COUNT(*) as count FROM address_data WHERE user_id = ?';
          maxLimit = maxLimits.max_locations;
          break;
        case 'service':
          countQuery = 'SELECT COUNT(*) as count FROM services WHERE user_id = ?';
          maxLimit = maxLimits.max_services;
          break;
        default:
          return res.status(400).json({ error: 'Invalid type. Use appointment, location, or service' });
      }

      db.get(countQuery, [userId], (countErr, countRow) => {
        if (countErr) {
          console.error('Error counting items:', countErr);
          return res.status(500).json({ error: 'Database error' });
        }

        const currentCount = countRow.count;
        const isUnlimited = maxLimit === -1;
        const canAdd = isUnlimited || currentCount < maxLimit;
        const remaining = isUnlimited ? -1 : Math.max(0, maxLimit - currentCount);

        res.json({
          type,
          current: currentCount,
          max: maxLimit,
          remaining,
          canAdd,
          isUnlimited,
          percentUsed: isUnlimited ? 0 : Math.round((currentCount / maxLimit) * 100)
        });
      });
    }
  );
});

// ========== SUPER ADMIN ROUTES ==========

// Get all plans (admin)
router.get('/admin/plans', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;

  db.all(
    `SELECT * FROM subscription_plans ORDER BY sort_order ASC`,
    [],
    (err, plans) => {
      if (err) {
        console.error('Error fetching plans:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const parsedPlans = plans.map(plan => ({
        ...plan,
        features: plan.features ? JSON.parse(plan.features) : []
      }));

      res.json(parsedPlans);
    }
  );
});

// Create a new plan (admin)
router.post('/admin/plans', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { name, display_name, description, price_monthly, price_yearly, max_appointments, max_locations, max_services, features, is_active, sort_order } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ error: 'Name and display name are required' });
  }

  const featuresJson = Array.isArray(features) ? JSON.stringify(features) : features || '[]';

  db.run(
    `INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, max_appointments, max_locations, max_services, features, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, display_name, description || '', price_monthly || 0, price_yearly || 0, max_appointments || -1, max_locations || -1, max_services || -1, featuresJson, is_active !== false ? 1 : 0, sort_order || 0],
    function(err) {
      if (err) {
        console.error('Error creating plan:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Plan name already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }

      res.status(201).json({ id: this.lastID, message: 'Plan created successfully' });
    }
  );
});

// Update a plan (admin)
router.put('/admin/plans/:id', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;
  const planId = parseInt(req.params.id);
  const { display_name, description, price_monthly, price_yearly, max_appointments, max_locations, max_services, features, is_active, sort_order } = req.body;

  if (isNaN(planId)) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }

  const featuresJson = Array.isArray(features) ? JSON.stringify(features) : features;

  db.run(
    `UPDATE subscription_plans SET 
      display_name = COALESCE(?, display_name),
      description = COALESCE(?, description),
      price_monthly = COALESCE(?, price_monthly),
      price_yearly = COALESCE(?, price_yearly),
      max_appointments = COALESCE(?, max_appointments),
      max_locations = COALESCE(?, max_locations),
      max_services = COALESCE(?, max_services),
      features = COALESCE(?, features),
      is_active = COALESCE(?, is_active),
      sort_order = COALESCE(?, sort_order),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [display_name, description, price_monthly, price_yearly, max_appointments, max_locations, max_services, featuresJson, is_active, sort_order, planId],
    function(err) {
      if (err) {
        console.error('Error updating plan:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      res.json({ message: 'Plan updated successfully' });
    }
  );
});

// Delete a plan (admin)
router.delete('/admin/plans/:id', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;
  const planId = parseInt(req.params.id);

  if (isNaN(planId)) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }

  // Check if any users are on this plan
  db.get(
    `SELECT COUNT(*) as count FROM user_subscriptions WHERE plan_id = ?`,
    [planId],
    (err, row) => {
      if (err) {
        console.error('Error checking plan usage:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (row.count > 0) {
        return res.status(400).json({ error: `Cannot delete plan: ${row.count} user(s) are currently subscribed` });
      }

      db.run('DELETE FROM subscription_plans WHERE id = ?', [planId], function(deleteErr) {
        if (deleteErr) {
          console.error('Error deleting plan:', deleteErr);
          return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Plan not found' });
        }

        res.json({ message: 'Plan deleted successfully' });
      });
    }
  );
});

// Get all user subscriptions (admin)
router.get('/admin/subscriptions', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;

  db.all(
    `SELECT 
      us.*,
      u.username,
      u.email,
      sp.name as plan_name,
      sp.display_name as plan_display_name,
      sp.price_monthly
    FROM user_subscriptions us
    JOIN users u ON us.user_id = u.id
    JOIN subscription_plans sp ON us.plan_id = sp.id
    ORDER BY us.created_at DESC`,
    [],
    (err, subscriptions) => {
      if (err) {
        console.error('Error fetching subscriptions:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json(subscriptions);
    }
  );
});

// Assign/change a user's subscription (admin)
router.post('/admin/subscriptions', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { user_id, plan_id } = req.body;

  if (!user_id || !plan_id) {
    return res.status(400).json({ error: 'User ID and Plan ID are required' });
  }

  // Check if user exists
  db.get('SELECT id FROM users WHERE id = ?', [user_id], (err, user) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if plan exists
    db.get('SELECT id FROM subscription_plans WHERE id = ?', [plan_id], (planErr, plan) => {
      if (planErr) {
        console.error('Error checking plan:', planErr);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      // Insert or update subscription
      db.run(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
         VALUES (?, ?, 'active', datetime('now'), datetime('now', '+1 month'))
         ON CONFLICT(user_id) DO UPDATE SET
           plan_id = excluded.plan_id,
           status = 'active',
           current_period_start = datetime('now'),
           current_period_end = datetime('now', '+1 month'),
           updated_at = CURRENT_TIMESTAMP`,
        [user_id, plan_id],
        function(insertErr) {
          if (insertErr) {
            console.error('Error assigning subscription:', insertErr);
            return res.status(500).json({ error: 'Database error' });
          }

          res.json({ message: 'Subscription assigned successfully' });
        }
      );
    });
  });
});

// Cancel a user's subscription (admin)
router.delete('/admin/subscriptions/:userId', requireSuperAdmin, (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.userId);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  db.run(
    `UPDATE user_subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
    [userId],
    function(err) {
      if (err) {
        console.error('Error cancelling subscription:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      res.json({ message: 'Subscription cancelled successfully' });
    }
  );
});

export default router;
