import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrateDatabase } from '../database/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use data directory in production (Docker), or current directory in development
const dataDir = process.env.NODE_ENV === 'production' 
  ? join(__dirname, '..', 'data') 
  : join(__dirname, '..');
const dbPath = join(dataDir, 'hairmanager.db');

const username = 'Tim';
const password = 'Dp09alq0411!';
const email = null; // You can add an email if needed

async function createSuperAdmin() {
  // First, ensure migration has run
  console.log('Running database migration...');
  try {
    await migrateDatabase(dbPath);
    console.log('✓ Migration completed');
  } catch (err) {
    console.error('Migration error (continuing anyway):', err.message);
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
    });

    // Check if user already exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existingUser) => {
      if (err) {
        console.error('Error checking for existing user:', err);
        db.close();
        reject(err);
        return;
      }

      if (existingUser) {
        // Update existing user to be super admin
        try {
          const passwordHash = await bcrypt.hash(password, 10);
          db.run(
            'UPDATE users SET password_hash = ?, is_super_admin = 1 WHERE username = ?',
            [passwordHash, username],
            function(updateErr) {
              if (updateErr) {
                console.error('Error updating user:', updateErr);
                db.close();
                reject(updateErr);
                return;
              }
              console.log(`✓ User "${username}" updated to super admin with new password`);
              db.close();
              resolve();
            }
          );
        } catch (hashErr) {
          console.error('Error hashing password:', hashErr);
          db.close();
          reject(hashErr);
        }
        return;
      }

      // Create new user
      try {
        const passwordHash = await bcrypt.hash(password, 10);

        db.run(
          'INSERT INTO users (username, password_hash, email, is_super_admin) VALUES (?, ?, ?, ?)',
          [username, passwordHash, email, 1],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating user:', insertErr);
              db.close();
              reject(insertErr);
              return;
            }

            const userId = this.lastID;
            console.log(`✓ Super admin user "${username}" created with ID ${userId}`);

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

            console.log(`✓ Default services created for user "${username}"`);
            db.close();
            resolve();
          }
        );
      } catch (error) {
        console.error('Error hashing password:', error);
        db.close();
        reject(error);
      }
    });
  });
}

// Run the script
createSuperAdmin()
  .then(() => {
    console.log('\n✅ Super admin user created successfully!');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Super Admin: Yes\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Error creating super admin:', err);
    process.exit(1);
  });
