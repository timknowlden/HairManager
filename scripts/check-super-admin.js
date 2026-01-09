#!/usr/bin/env node
/**
 * Check if Super Admin Users Exist
 * 
 * Usage:
 *   node scripts/check-super-admin.js
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use data directory in production (Docker), or current directory in development
const dataDir = process.env.NODE_ENV === 'production' 
  ? join(__dirname, '..', 'data') 
  : join(__dirname, '..');
const dbPath = join(dataDir, 'hairmanager.db');

console.log('\n🔍 Checking for Super Admin Users...\n');
console.log(`   Database: ${dbPath}\n`);

return new Promise((resolve, reject) => {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error opening database:', err.message);
      console.error(`   Make sure the database exists at: ${dbPath}\n`);
      reject(err);
      return;
    }
  });

  // Check for super admin users
  db.all(
    'SELECT id, username, email, is_super_admin, created_at FROM users WHERE is_super_admin = 1',
    [],
    (err, superAdmins) => {
      if (err) {
        console.error('❌ Error querying database:', err.message);
        db.close();
        reject(err);
        return;
      }

      if (superAdmins.length === 0) {
        console.log('⚠️  No super admin users found!\n');
        console.log('💡 To create a super admin, run:');
        console.log('   node scripts/create-admin-remote.js <username> <password> [email]\n');
      } else {
        console.log(`✅ Found ${superAdmins.length} super admin user(s):\n`);
        superAdmins.forEach((admin, index) => {
          console.log(`   ${index + 1}. ${admin.username}`);
          console.log(`      ID: ${admin.id}`);
          if (admin.email) {
            console.log(`      Email: ${admin.email}`);
          }
          console.log(`      Created: ${admin.created_at || 'Unknown'}`);
          console.log('');
        });
      }

      // Also show all users for reference
      db.all('SELECT id, username, email, is_super_admin FROM users ORDER BY id', [], (err, allUsers) => {
        if (!err && allUsers.length > 0) {
          console.log('📋 All users in database:\n');
          allUsers.forEach(user => {
            const role = user.is_super_admin ? '🔑 Super Admin' : '👤 User';
            console.log(`   ${role} - ${user.username} (ID: ${user.id})`);
            if (user.email) {
              console.log(`      Email: ${user.email}`);
            }
          });
          console.log('');
        }
        db.close();
        resolve();
      });
    }
  );
});
