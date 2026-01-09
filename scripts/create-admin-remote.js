#!/usr/bin/env node
/**
 * Create Super Admin User - Remote Server Helper
 * 
 * Usage:
 *   node scripts/create-admin-remote.js <username> <password> [email]
 * 
 * Example:
 *   node scripts/create-admin-remote.js admin MySecurePass123! admin@example.com
 */

import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrateDatabase } from '../database/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get arguments from command line
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('\n❌ Error: Missing required arguments\n');
  console.log('Usage: node scripts/create-admin-remote.js <username> <password> [email]\n');
  console.log('Example:');
  console.log('  node scripts/create-admin-remote.js admin MySecurePass123! admin@example.com\n');
  process.exit(1);
}

const username = args[0];
const password = args[1];
const email = args[2] || null;

// Use data directory in production (Docker), or current directory in development
const dataDir = process.env.NODE_ENV === 'production' 
  ? join(__dirname, '..', 'data') 
  : join(__dirname, '..');
const dbPath = join(dataDir, 'hairmanager.db');

console.log('\n🔧 Creating Super Admin User...\n');
console.log(`   Username: ${username}`);
console.log(`   Email: ${email || '(none)'}`);
console.log(`   Database: ${dbPath}\n`);

async function createSuperAdmin() {
  // First, ensure migration has run
  console.log('📦 Running database migration...');
  try {
    await migrateDatabase(dbPath);
    console.log('✓ Migration completed\n');
  } catch (err) {
    console.error('⚠️  Migration warning (continuing anyway):', err.message);
    console.log('');
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        console.error(`   Make sure the database exists at: ${dbPath}\n`);
        reject(err);
        return;
      }
    });

    // Check if user already exists
    db.get('SELECT id, username, is_super_admin FROM users WHERE username = ?', [username], async (err, existingUser) => {
      if (err) {
        console.error('❌ Error checking for existing user:', err.message);
        db.close();
        reject(err);
        return;
      }

      if (existingUser) {
        // Update existing user to be super admin
        console.log(`⚠️  User "${username}" already exists (ID: ${existingUser.id})`);
        console.log(`   Current super admin status: ${existingUser.is_super_admin ? 'Yes' : 'No'}`);
        console.log('   Updating to super admin...\n');
        
        try {
          const passwordHash = await bcrypt.hash(password, 10);
          db.run(
            'UPDATE users SET password_hash = ?, is_super_admin = 1, email = COALESCE(?, email) WHERE username = ?',
            [passwordHash, email, username],
            function(updateErr) {
              if (updateErr) {
                console.error('❌ Error updating user:', updateErr.message);
                db.close();
                reject(updateErr);
                return;
              }
              console.log(`✅ User "${username}" updated to super admin`);
              console.log(`   Password has been updated`);
              if (email) {
                console.log(`   Email set to: ${email}`);
              }
              console.log('');
              db.close();
              resolve();
            }
          );
        } catch (hashErr) {
          console.error('❌ Error hashing password:', hashErr.message);
          db.close();
          reject(hashErr);
        }
        return;
      }

      // Create new user
      console.log(`📝 Creating new super admin user...\n`);
      try {
        const passwordHash = await bcrypt.hash(password, 10);

        db.run(
          'INSERT INTO users (username, password_hash, email, is_super_admin) VALUES (?, ?, ?, ?)',
          [username, passwordHash, email, 1],
          function(insertErr) {
            if (insertErr) {
              console.error('❌ Error creating user:', insertErr.message);
              db.close();
              reject(insertErr);
              return;
            }

            const userId = this.lastID;
            console.log(`✅ Super admin user "${username}" created successfully!`);
            console.log(`   User ID: ${userId}`);
            if (email) {
              console.log(`   Email: ${email}`);
            }
            console.log('');

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

            console.log(`✅ Default services created for user "${username}"`);
            console.log('');
            db.close();
            resolve();
          }
        );
      } catch (error) {
        console.error('❌ Error hashing password:', error.message);
        db.close();
        reject(error);
      }
    });
  });
}

// Run the script
createSuperAdmin()
  .then(() => {
    console.log('🎉 Setup complete! You can now log in with:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Error creating super admin:', err.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure the database file exists');
    console.error('   2. Check file permissions on the database');
    console.error('   3. Ensure migrations have run');
    console.error('   4. Check NODE_ENV if using Docker/production\n');
    process.exit(1);
  });
