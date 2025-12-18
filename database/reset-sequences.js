import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'hairmanager.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Resetting SQLite sequences...');
});

// Reset sequences for all tables
db.serialize(() => {
  // Get max IDs
  db.get("SELECT MAX(id) as max_id FROM address_data", [], (err, row) => {
    if (err) {
      console.error('Error getting max address_data ID:', err);
    } else {
      const maxId = row.max_id || 0;
      if (maxId > 0) {
        db.run(`UPDATE sqlite_sequence SET seq = ${maxId} WHERE name = 'address_data'`, (err) => {
          if (err) {
            console.error('Error updating address_data sequence:', err);
          } else {
            console.log(`Reset address_data sequence to ${maxId}`);
          }
        });
      }
    }
  });

  db.get("SELECT MAX(id) as max_id FROM services", [], (err, row) => {
    if (err) {
      console.error('Error getting max services ID:', err);
    } else {
      const maxId = row.max_id || 0;
      if (maxId > 0) {
        db.run(`UPDATE sqlite_sequence SET seq = ${maxId} WHERE name = 'services'`, (err) => {
          if (err) {
            console.error('Error updating services sequence:', err);
          } else {
            console.log(`Reset services sequence to ${maxId}`);
          }
        });
      }
    }
  });

  db.get("SELECT MAX(id) as max_id FROM appointments", [], (err, row) => {
    if (err) {
      console.error('Error getting max appointments ID:', err);
    } else {
      const maxId = row.max_id || 0;
      if (maxId > 0) {
        db.run(`UPDATE sqlite_sequence SET seq = ${maxId} WHERE name = 'appointments'`, (err) => {
          if (err) {
            console.error('Error updating appointments sequence:', err);
          } else {
            console.log(`Reset appointments sequence to ${maxId}`);
          }
        });
      }
    }
  });
});

// Wait a bit then close
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
      process.exit(1);
    } else {
      console.log('Sequences reset complete');
      process.exit(0);
    }
  });
}, 1000);

