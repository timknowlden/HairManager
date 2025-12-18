import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'katescuts.db');

console.log('Fixing IDs to start from 1...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

// Fix address_data IDs
db.serialize(() => {
  // Get all locations ordered by current ID
  db.all("SELECT * FROM address_data ORDER BY id", [], (err, rows) => {
    if (err) {
      console.error('Error fetching locations:', err);
      db.close();
      process.exit(1);
    }

    // Create temporary table with new IDs
    db.run("CREATE TEMPORARY TABLE address_data_temp AS SELECT * FROM address_data WHERE 1=0");
    
    rows.forEach((row, index) => {
      const newId = index + 1;
      if (row.id !== newId) {
        // Insert with new ID
        db.run(
          `INSERT INTO address_data_temp (id, location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, row.location_name, row.address, row.city_town, row.post_code, row.distance, 
           row.contact_name, row.email_address, row.contact_details, row.phone, 
           row.place_via_ludham, row.mileage, row.notes]
        );
      }
    });

    // Delete old table and rename temp
    db.run("DELETE FROM address_data", (err) => {
      if (err) {
        console.error('Error deleting old data:', err);
        db.close();
        process.exit(1);
      }
      
      db.run("INSERT INTO address_data SELECT * FROM address_data_temp", (err) => {
        if (err) {
          console.error('Error inserting new data:', err);
          db.close();
          process.exit(1);
        }
        
        // Reset sequence
        db.run("DELETE FROM sqlite_sequence WHERE name = 'address_data'", () => {
          db.run(`INSERT INTO sqlite_sequence (name, seq) VALUES ('address_data', ${rows.length})`, () => {
            console.log(`Fixed ${rows.length} location IDs to start from 1`);
            db.close();
            process.exit(0);
          });
        });
      });
    });
  });
});

