import express from 'express';
import sqlite3 from 'sqlite3';

const router = express.Router();

// Get all locations
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  db.all(
    'SELECT * FROM address_data ORDER BY location_name',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Get location by name
router.get('/:name', (req, res) => {
  const db = req.app.locals.db;
  const { name } = req.params;
  
  db.get(
    'SELECT * FROM address_data WHERE location_name = ?',
    [name],
    (err, row) => {
      if (err) {
        console.error('Error fetching location:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      res.json(row);
    }
  );
});

// Create new location
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { location_name, distance, contact_details, address, phone, notes } = req.body;

  if (!location_name) {
    res.status(400).json({ error: 'Location name is required' });
    return;
  }

  db.run(
    'INSERT INTO address_data (location_name, distance, contact_details, address, phone, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [location_name, distance || null, contact_details || '', address || '', phone || '', notes || ''],
    function(err) {
      if (err) {
        console.error('Error creating location:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({
        id: this.lastID,
        location_name,
        distance,
        contact_details,
        address,
        phone,
        notes
      });
    }
  );
});

// Update location
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { location_name, distance, contact_details, address, phone, notes } = req.body;

  db.run(
    'UPDATE address_data SET location_name = ?, distance = ?, contact_details = ?, address = ?, phone = ?, notes = ? WHERE id = ?',
    [location_name, distance || null, contact_details || '', address || '', phone || '', notes || '', id],
    function(err) {
      if (err) {
        console.error('Error updating location:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      res.json({ message: 'Location updated successfully' });
    }
  );
});

// Delete location
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  db.run(
    'DELETE FROM address_data WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        console.error('Error deleting location:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }
      res.json({ message: 'Location deleted successfully' });
    }
  );
});

export default router;

