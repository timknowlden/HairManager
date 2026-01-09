/**
 * Middleware to check subscription limits before creating resources
 * Enforces limits based on user's subscription plan
 */

// Helper to get user's subscription limits
const getUserLimits = (db, userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        COALESCE(sp.max_appointments, 50) as max_appointments,
        COALESCE(sp.max_locations, 2) as max_locations,
        COALESCE(sp.max_services, 10) as max_services,
        COALESCE(sp.name, 'free') as plan_name
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active'
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE u.id = ?`,
      [userId],
      (err, limits) => {
        if (err) reject(err);
        else resolve(limits || { max_appointments: 50, max_locations: 2, max_services: 10, plan_name: 'free' });
      }
    );
  });
};

// Helper to get current usage count
const getUsageCount = (db, tableName, userId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = ?`;
    db.get(query, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.count : 0);
    });
  });
};

/**
 * Check appointment limit before creating
 */
export const checkAppointmentLimit = async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Skip check for super admins
  if (req.isSuperAdmin) {
    return next();
  }

  try {
    const limits = await getUserLimits(db, userId);
    
    // -1 means unlimited
    if (limits.max_appointments === -1) {
      return next();
    }

    const currentCount = await getUsageCount(db, 'appointments', userId);

    if (currentCount >= limits.max_appointments) {
      return res.status(403).json({
        error: 'Appointment limit reached',
        message: `Your ${limits.plan_name} plan allows ${limits.max_appointments} appointments. Please upgrade to add more.`,
        limit: limits.max_appointments,
        current: currentCount,
        upgradeRequired: true
      });
    }

    // Attach usage info to request for potential use
    req.usageInfo = {
      appointments: { current: currentCount, max: limits.max_appointments }
    };
    
    next();
  } catch (err) {
    console.error('Error checking appointment limit:', err);
    // Don't block on error, but log it
    next();
  }
};

/**
 * Check location limit before creating
 */
export const checkLocationLimit = async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Skip check for super admins
  if (req.isSuperAdmin) {
    return next();
  }

  try {
    const limits = await getUserLimits(db, userId);
    
    // -1 means unlimited
    if (limits.max_locations === -1) {
      return next();
    }

    const currentCount = await getUsageCount(db, 'address_data', userId);

    if (currentCount >= limits.max_locations) {
      return res.status(403).json({
        error: 'Location limit reached',
        message: `Your ${limits.plan_name} plan allows ${limits.max_locations} locations. Please upgrade to add more.`,
        limit: limits.max_locations,
        current: currentCount,
        upgradeRequired: true
      });
    }

    req.usageInfo = {
      ...req.usageInfo,
      locations: { current: currentCount, max: limits.max_locations }
    };
    
    next();
  } catch (err) {
    console.error('Error checking location limit:', err);
    next();
  }
};

/**
 * Check service limit before creating
 */
export const checkServiceLimit = async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Skip check for super admins
  if (req.isSuperAdmin) {
    return next();
  }

  try {
    const limits = await getUserLimits(db, userId);
    
    // -1 means unlimited
    if (limits.max_services === -1) {
      return next();
    }

    const currentCount = await getUsageCount(db, 'services', userId);

    if (currentCount >= limits.max_services) {
      return res.status(403).json({
        error: 'Service limit reached',
        message: `Your ${limits.plan_name} plan allows ${limits.max_services} services. Please upgrade to add more.`,
        limit: limits.max_services,
        current: currentCount,
        upgradeRequired: true
      });
    }

    req.usageInfo = {
      ...req.usageInfo,
      services: { current: currentCount, max: limits.max_services }
    };
    
    next();
  } catch (err) {
    console.error('Error checking service limit:', err);
    next();
  }
};

export default {
  checkAppointmentLimit,
  checkLocationLimit,
  checkServiceLimit
};
