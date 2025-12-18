import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'katescuts.db');

const runAsync = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

function migrateDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Starting database migration...');
    });

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // First, check if users table exists, create if not
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err, userTables) => {
      if (err) {
        console.error('Error checking for users table:', err);
        db.close();
        reject(err);
        return;
      }

      const migrations = [];

      if (userTables.length === 0) {
        // Create users table
        migrations.push(runAsync(db, `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `));
      }

      // Check if columns exist and add them if they don't
      db.all("PRAGMA table_info(address_data)", [], (err, columns) => {
        if (err) {
          console.error('Error checking table info:', err);
          db.close();
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);

        // Add user_id to address_data if it doesn't exist
        if (!columnNames.includes('user_id')) {
          migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN user_id INTEGER'));
          // For existing data, we'll assign to a default user (user_id = 1) if it exists
          // This will be handled after user creation
        }

        if (!columnNames.includes('city_town')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN city_town TEXT'));
      }
      if (!columnNames.includes('post_code')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN post_code TEXT'));
      }
      if (!columnNames.includes('contact_name')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN contact_name TEXT'));
      }
      if (!columnNames.includes('email_address')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN email_address TEXT'));
      }
      
      // Migrate existing single emails to JSON array format
      // This runs after all column checks
      migrations.push(
        runAsync(db, `
          UPDATE address_data 
          SET email_address = CASE 
            WHEN email_address IS NULL OR email_address = '' THEN '[]'
            WHEN email_address NOT LIKE '[%' THEN '["' || REPLACE(email_address, '"', '""') || '"]'
            ELSE email_address
          END
          WHERE email_address IS NOT NULL
        `)
      );
      if (!columnNames.includes('place_via_ludham')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN place_via_ludham TEXT'));
      }
      if (!columnNames.includes('mileage')) {
        migrations.push(runAsync(db, 'ALTER TABLE address_data ADD COLUMN mileage REAL'));
      }

      // Check if admin_settings table exists
      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_settings'", [], (err, tables) => {
        if (err) {
          console.error('Error checking for admin_settings table:', err);
          db.close();
          reject(err);
          return;
        }

        if (tables.length === 0) {
          // Create admin_settings table
          migrations.push(runAsync(db, `
            CREATE TABLE IF NOT EXISTS admin_settings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT,
              phone TEXT,
              email TEXT,
              business_name TEXT,
              bank_account_name TEXT,
              sort_code TEXT,
              account_number TEXT,
              home_address TEXT,
              home_postcode TEXT,
              currency TEXT DEFAULT 'GBP',
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `));
          
          Promise.all(migrations)
            .then(() => {
              console.log('Migration completed successfully');
              db.close((err) => {
                if (err) {
                  console.error('Error closing database:', err);
                  reject(err);
                } else {
                  resolve();
                }
              });
            })
            .catch((err) => {
              console.error('Error during migration:', err);
              db.close();
              reject(err);
            });
        } else {
          // Check if business_name column exists in admin_settings table
          db.all("PRAGMA table_info(admin_settings)", [], (err, adminColumns) => {
            if (err) {
              console.error('Error checking admin_settings columns:', err);
              db.close();
              reject(err);
              return;
            }
            
            const adminColumnNames = adminColumns.map(col => col.name);
            if (!adminColumnNames.includes('business_name')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN business_name TEXT'));
            }
            if (!adminColumnNames.includes('postcode_resync_needed')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN postcode_resync_needed INTEGER DEFAULT 0'));
            }
            if (!adminColumnNames.includes('google_maps_api_key')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN google_maps_api_key TEXT'));
            }
            if (!adminColumnNames.includes('email_password')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_password TEXT'));
            }
            // Add SMTP configuration fields
            if (!adminColumnNames.includes('smtp_host')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN smtp_host TEXT'));
            }
            if (!adminColumnNames.includes('smtp_port')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN smtp_port INTEGER'));
            }
            if (!adminColumnNames.includes('smtp_secure')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN smtp_secure INTEGER DEFAULT 0'));
            }
            if (!adminColumnNames.includes('smtp_username')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN smtp_username TEXT'));
            }
            // Add Azure OAuth2 fields for Microsoft Graph API
            if (!adminColumnNames.includes('azure_client_id')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN azure_client_id TEXT'));
            }
            if (!adminColumnNames.includes('azure_client_secret')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN azure_client_secret TEXT'));
            }
            if (!adminColumnNames.includes('azure_tenant_id')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN azure_tenant_id TEXT'));
            }
            if (!adminColumnNames.includes('use_graph_api')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN use_graph_api INTEGER DEFAULT 0'));
            }
            // Add email relay service fields
            if (!adminColumnNames.includes('email_relay_service')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_service TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_api_key')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_api_key TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_from_email')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_from_email TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_from_name')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_from_name TEXT'));
            }
            // Add email relay service fields
            if (!adminColumnNames.includes('use_email_relay')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN use_email_relay INTEGER DEFAULT 0'));
            }
            if (!adminColumnNames.includes('business_service_description')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN business_service_description TEXT'));
            }
            if (!adminColumnNames.includes('email_signature')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_signature TEXT'));
            }
            if (!adminColumnNames.includes('default_email_content')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN default_email_content TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_service')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_service TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_api_key')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_api_key TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_from_email')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_from_email TEXT'));
            }
            if (!adminColumnNames.includes('email_relay_from_name')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN email_relay_from_name TEXT'));
            }

            // Add user_id to admin_settings if it doesn't exist
            if (!adminColumnNames.includes('user_id')) {
              migrations.push(runAsync(db, 'ALTER TABLE admin_settings ADD COLUMN user_id INTEGER'));
            }

            // Check other tables for user_id
            db.all("PRAGMA table_info(services)", [], (err, serviceColumns) => {
              if (err) {
                console.error('Error checking services columns:', err);
                db.close();
                reject(err);
                return;
              }

              const serviceColumnNames = serviceColumns.map(col => col.name);
              if (!serviceColumnNames.includes('user_id')) {
                migrations.push(runAsync(db, 'ALTER TABLE services ADD COLUMN user_id INTEGER'));
              }

              db.all("PRAGMA table_info(appointments)", [], (err, appointmentColumns) => {
                if (err) {
                  console.error('Error checking appointments columns:', err);
                  db.close();
                  reject(err);
                  return;
                }

                const appointmentColumnNames = appointmentColumns.map(col => col.name);
                if (!appointmentColumnNames.includes('user_id')) {
                  migrations.push(runAsync(db, 'ALTER TABLE appointments ADD COLUMN user_id INTEGER'));
                }

                // After adding user_id columns, migrate existing data to a default user
                // This creates a default user if none exists and assigns all existing data to it
                Promise.all(migrations)
                  .then(() => {
                    // Check if any users exist
                    return new Promise((resolveCount, rejectCount) => {
                      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                        if (err) {
                          rejectCount(err);
                          return;
                        }
                        resolveCount(row.count);
                      });
                    });
                  })
                  .then((userCount) => {
                    if (userCount === 0) {
                      // Create a default user for existing data
                      console.log('Creating default user for existing data...');
                      return runAsync(db, `
                        INSERT INTO users (username, password_hash, email)
                        VALUES ('admin', '$2b$10$dummyhashfordefaultuser', 'admin@example.com')
                      `).then(() => {
                        // Get the created user ID
                        return new Promise((resolveId, rejectId) => {
                          db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, user) => {
                            if (err) rejectId(err);
                            else resolveId(user.id);
                          });
                        });
                      });
                    } else {
                      // Get the first user ID
                      return new Promise((resolveId, rejectId) => {
                        db.get('SELECT id FROM users ORDER BY id LIMIT 1', [], (err, user) => {
                          if (err) rejectId(err);
                          else resolveId(user.id);
                        });
                      });
                    }
                  })
                  .then((defaultUserId) => {
                    // Update all existing records to use the default user_id
                    const dataMigrations = [];
                    
                    // Update address_data
                    dataMigrations.push(runAsync(db, `
                      UPDATE address_data SET user_id = ? WHERE user_id IS NULL
                    `, [defaultUserId]));
                    
                    // Update services
                    dataMigrations.push(runAsync(db, `
                      UPDATE services SET user_id = ? WHERE user_id IS NULL
                    `, [defaultUserId]));
                    
                    // Update appointments
                    dataMigrations.push(runAsync(db, `
                      UPDATE appointments SET user_id = ? WHERE user_id IS NULL
                    `, [defaultUserId]));
                    
                    // Update admin_settings
                    dataMigrations.push(runAsync(db, `
                      UPDATE admin_settings SET user_id = ? WHERE user_id IS NULL
                    `, [defaultUserId]));

                    return Promise.all(dataMigrations);
                  })
                  .then(() => {
                    console.log('Data migration to default user completed');
                    console.log('Migration completed successfully');
                    db.close((err) => {
                      if (err) {
                        console.error('Error closing database:', err);
                        reject(err);
                      } else {
                        resolve();
                      }
                    });
                  })
                  .catch((err) => {
                    console.error('Error during migration:', err);
                    db.close();
                    reject(err);
                  }); // End Promise.all(migrations) chain
              }); // Close appointments callback
            }); // Close services callback
          }); // Close admin_settings callback
        } // Close else block
      }); // Close admin_settings table check callback
    }); // Close address_data callback
  }); // Close users table check callback
  }); // Close Promise executor
}

// Run migration if called directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  migrateDatabase()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

export { migrateDatabase };

