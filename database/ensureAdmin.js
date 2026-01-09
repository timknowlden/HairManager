import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';

const runAsync = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getAsync = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

/**
 * Ensures a super admin user exists in the database
 * Uses environment variables for credentials, with sensible defaults
 */
export function ensureAdminUser(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database for admin user creation:', err);
        reject(err);
        return;
      }
    });

    // Get admin credentials from environment variables or use defaults
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123!';
    const adminEmail = process.env.ADMIN_EMAIL || null;

    // Check if admin user already exists
    getAsync(db, 'SELECT id, username, is_super_admin FROM users WHERE username = ?', [adminUsername])
      .then(async (existingUser) => {
        if (existingUser) {
          // User exists - check if they're a super admin
          if (existingUser.is_super_admin === 1) {
            console.log(`✓ Super admin user "${adminUsername}" already exists (ID: ${existingUser.id})`);
            db.close();
            resolve();
            return;
          } else {
            // User exists but isn't super admin - upgrade them
            console.log(`⚠️  User "${adminUsername}" exists but is not a super admin. Upgrading...`);
            try {
              const passwordHash = await bcrypt.hash(adminPassword, 10);
              await runAsync(
                db,
                'UPDATE users SET is_super_admin = 1, password_hash = ?, email = COALESCE(?, email) WHERE username = ?',
                [passwordHash, adminEmail, adminUsername]
              );
              console.log(`✓ User "${adminUsername}" upgraded to super admin`);
              db.close();
              resolve();
            } catch (hashErr) {
              console.error('Error hashing password:', hashErr);
              db.close();
              reject(hashErr);
            }
            return;
          }
        }

        // User doesn't exist - create new super admin
        console.log(`📝 Creating super admin user "${adminUsername}"...`);
        try {
          const passwordHash = await bcrypt.hash(adminPassword, 10);

          const result = await runAsync(
            db,
            'INSERT INTO users (username, password_hash, email, is_super_admin) VALUES (?, ?, ?, ?)',
            [adminUsername, passwordHash, adminEmail, 1]
          );

          const userId = result.lastID;
          console.log(`✓ Super admin user "${adminUsername}" created (ID: ${userId})`);

          // Create default services for the new admin user
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

          // Insert default services for the new admin user
          for (const service of defaultServices) {
            await runAsync(db, 'INSERT OR IGNORE INTO services (user_id, service_name, type, price) VALUES (?, ?, ?, ?)', 
              [userId, service.service_name, service.type, service.price]);
          }

          console.log(`✓ Default services created for super admin user`);
          console.log(`\n🔑 Admin Credentials:`);
          console.log(`   Username: ${adminUsername}`);
          console.log(`   Password: ${adminPassword}`);
          if (adminEmail) {
            console.log(`   Email: ${adminEmail}`);
          }
          console.log(`\n⚠️  IMPORTANT: Change the default password after first login!`);
          console.log(`   You can set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL environment variables to customize.\n`);

          db.close();
          resolve();
        } catch (error) {
          console.error('Error creating super admin:', error);
          db.close();
          reject(error);
        }
      })
      .catch((err) => {
        console.error('Error checking for admin user:', err);
        db.close();
        reject(err);
      });
  });
}
