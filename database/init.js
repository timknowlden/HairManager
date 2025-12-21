import sqlite3 from 'sqlite3';

const runAsync = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

export function initDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Initializing database...');
    });

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create users table first
    runAsync(db, `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .then(() => {
      // Create tables sequentially
      return runAsync(db, `
        CREATE TABLE IF NOT EXISTS services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          service_name TEXT NOT NULL,
          type TEXT NOT NULL,
          price REAL NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, service_name)
        )
      `);
    })
    .then(() => runAsync(db, `
      CREATE TABLE IF NOT EXISTS address_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        location_name TEXT NOT NULL,
        address TEXT,
        city_town TEXT,
        post_code TEXT,
        distance REAL,
        contact_name TEXT,
        email_address TEXT,
        contact_details TEXT,
        phone TEXT,
        place_via_ludham TEXT,
        mileage REAL,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, location_name)
      )
    `))
    .then(() => runAsync(db, `
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        service TEXT NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        location TEXT NOT NULL,
        price REAL NOT NULL,
        paid INTEGER DEFAULT 0,
        distance REAL,
        payment_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id, location) REFERENCES address_data(user_id, location_name)
      )
    `))
    .then(() => {
      // Create indexes for appointments table to improve query performance
      return Promise.all([
        runAsync(db, 'CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id)'),
        runAsync(db, 'CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)'),
        runAsync(db, 'CREATE INDEX IF NOT EXISTS idx_appointments_user_date_id ON appointments(user_id, date DESC, id ASC)')
      ]);
    })
    .then(() => runAsync(db, `
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
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
        postcode_resync_needed INTEGER DEFAULT 0,
        google_maps_api_key TEXT,
        email_password TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `))
    .then(() => {
      // Insert default services if they don't exist
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

      // Note: Default services will be created per user on first login
      // This function is kept for backward compatibility but won't insert without user_id
      const insertService = (service) => {
        // Skip default service insertion - services are now user-specific
        return Promise.resolve();
      };

      // Don't insert default locations - let user import them
      // This ensures IDs start from 1
      const defaultLocations = [];

      const insertLocation = (location) => {
        return runAsync(
          db,
          `INSERT OR IGNORE INTO address_data 
           (location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            location.location_name, 
            location.address || '', 
            location.city_town || '',
            location.post_code || '',
            location.distance || null, 
            location.contact_name || '',
            location.email_address || '',
            location.contact_details || '', 
            location.phone || '', 
            location.place_via_ludham || '',
            location.mileage || null,
            location.notes || ''
          ]
        );
      };

      // Insert all default data
      return Promise.all([
        ...defaultServices.map(insertService),
        ...defaultLocations.map(insertLocation)
      ]);
    })
    .then(() => {
      console.log('Database initialized with default data');
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
      console.error('Error initializing database:', err);
      db.close();
      reject(err);
    });
  });
}

