import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'katescuts.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Renumbering location IDs to start from 1...');
});

db.serialize(() => {
  // Get all locations
  db.all("SELECT * FROM address_data ORDER BY id", [], (err, rows) => {
    if (err) {
      console.error('Error:', err);
      db.close();
      process.exit(1);
    }

    if (rows.length === 0) {
      console.log('No locations to renumber');
      db.close();
      process.exit(0);
    }

    // Delete all and reinsert with new IDs
    db.run("DELETE FROM address_data", (err) => {
      if (err) {
        console.error('Error deleting:', err);
        db.close();
        process.exit(1);
      }

      let completed = 0;
      rows.forEach((row, index) => {
        const newId = index + 1;
        db.run(
          `INSERT INTO address_data 
           (id, location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, row.location_name, row.address, row.city_town, row.post_code, row.distance, 
           row.contact_name, row.email_address, row.contact_details, row.phone, 
           row.place_via_ludham, row.mileage, row.notes],
          (err) => {
            if (err) {
              console.error('Error inserting:', err);
            }
            completed++;
            if (completed === rows.length) {
              // Reset sequence
              db.run("DELETE FROM sqlite_sequence WHERE name = 'address_data'", () => {
                db.run(`INSERT INTO sqlite_sequence (name, seq) VALUES ('address_data', ${rows.length})`, () => {
                  console.log(`Successfully renumbered ${rows.length} locations to start from ID 1`);
                  db.close();
                  process.exit(0);
                });
              });
            }
          }
        );
      });
    });
  });
});

