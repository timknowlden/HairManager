import express from 'express';
import sqlite3 from 'sqlite3';

const router = express.Router();

// Get all services
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  db.all(
    'SELECT * FROM services ORDER BY type, service_name',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching services:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Get service by name
router.get('/:name', (req, res) => {
  const db = req.app.locals.db;
  const { name } = req.params;
  
  db.get(
    'SELECT * FROM services WHERE service_name = ?',
    [name],
    (err, row) => {
      if (err) {
        console.error('Error fetching service:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      res.json(row);
    }
  );
});

// Create new service
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { service_name, type, price } = req.body;

  if (!service_name || !type || price === undefined) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  db.run(
    'INSERT INTO services (service_name, type, price) VALUES (?, ?, ?)',
    [service_name, type, price],
    function(err) {
      if (err) {
        console.error('Error creating service:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({
        id: this.lastID,
        service_name,
        type,
        price
      });
    }
  );
});

// Update service
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { service_name, type, price } = req.body;

  db.run(
    'UPDATE services SET service_name = ?, type = ?, price = ? WHERE id = ?',
    [service_name, type, price, id],
    function(err) {
      if (err) {
        console.error('Error updating service:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      res.json({ message: 'Service updated successfully' });
    }
  );
});

// Delete service
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  db.run(
    'DELETE FROM services WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        console.error('Error deleting service:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      res.json({ message: 'Service deleted successfully' });
    }
  );
});

export default router;

