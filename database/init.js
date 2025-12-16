import sqlite3 from 'sqlite3';
import { promisify } from 'util';

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

    // Create services table
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        price REAL NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('Error creating services table:', err);
        reject(err);
        return;
      }
    });

    // Create address_data table (locations)
    db.run(`
      CREATE TABLE IF NOT EXISTS address_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_name TEXT NOT NULL UNIQUE,
        distance REAL,
        contact_details TEXT,
        address TEXT,
        phone TEXT,
        notes TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating address_data table:', err);
        reject(err);
        return;
      }
    });

    // Create appointments table
    db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        FOREIGN KEY (location) REFERENCES address_data(location_name)
      )
    `, (err) => {
      if (err) {
        console.error('Error creating appointments table:', err);
        reject(err);
        return;
      }
    });

    // Insert default services if they don't exist
    const defaultServices = [
      { service_name: 'Cut & Blow Dry', type: 'Hair', price: 25.00 },
      { service_name: 'Blow Dry', type: 'Hair', price: 15.00 },
      { service_name: 'Shampoo & Set', type: 'Hair', price: 14.00 },
      { service_name: 'Dry Cut', type: 'Hair', price: 14.00 },
      { service_name: 'Cut & Set', type: 'Hair', price: 24.00 },
      { service_name: 'Gents Dry Cut', type: 'Hair', price: 14.50 },
      { service_name: 'Beard Trim', type: 'Hair', price: 6.00 },
      { service_name: 'Clipper Cuts', type: 'Hair', price: 6.00 },
      { service_name: 'Restyling', type: 'Hair', price: 28.00 },
      { service_name: 'Manicure', type: 'Nails', price: 18.00 },
      { service_name: 'Pedicure', type: 'Nails', price: 20.00 },
      { service_name: 'Gel Polish', type: 'Nails', price: 20.00 },
      { service_name: 'Other', type: 'Hair', price: 15.00 }
    ];

    const insertService = (service) => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO services (service_name, type, price) VALUES (?, ?, ?)',
          [service.service_name, service.type, service.price],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    };

    // Insert default locations if they don't exist
    const defaultLocations = [
      { location_name: 'Sydney House', distance: 32.9, contact_details: '', address: '', phone: '', notes: '' },
      { location_name: 'The Lawns', distance: 46.4, contact_details: '', address: '', phone: '', notes: '' }
    ];

    const insertLocation = (location) => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO address_data (location_name, distance, contact_details, address, phone, notes) VALUES (?, ?, ?, ?, ?, ?)',
          [location.location_name, location.distance, location.contact_details, location.address, location.phone, location.notes],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    };

    // Insert all default data
    Promise.all([
      ...defaultServices.map(insertService),
      ...defaultLocations.map(insertLocation)
    ])
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
        console.error('Error initializing default data:', err);
        db.close();
        reject(err);
      });
  });
}

