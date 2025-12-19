import express from 'express';
import sqlite3 from 'sqlite3';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all services for the logged-in user
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM services WHERE user_id = ? ORDER BY type, service_name',
    [userId],
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
  const userId = req.userId;
  
  db.get(
    'SELECT * FROM services WHERE service_name = ? AND user_id = ?',
    [name, userId],
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
  const userId = req.userId;
  const { service_name, type, price } = req.body;

  if (!service_name || !type || price === undefined) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  db.run(
    'INSERT INTO services (user_id, service_name, type, price) VALUES (?, ?, ?, ?)',
    [userId, service_name, type, price],
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
  const userId = req.userId;
  const { service_name, type, price } = req.body;

  db.run(
    'UPDATE services SET service_name = ?, type = ?, price = ? WHERE id = ? AND user_id = ?',
    [service_name, type, price, id, userId],
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
  const userId = req.userId;

  db.run(
    'DELETE FROM services WHERE id = ? AND user_id = ?',
    [id, userId],
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

// Export services as CSV
router.get('/export/csv', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM services WHERE user_id = ? ORDER BY type, service_name',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching services:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      // CSV header
      const headers = ['service_name', 'type', 'price'];
      let csv = headers.join(',') + '\n';
      
      // CSV rows
      rows.forEach(row => {
        const values = [
          `"${(row.service_name || '').replace(/"/g, '""')}"`,
          `"${(row.type || '').replace(/"/g, '""')}"`,
          row.price || 0
        ];
        csv += values.join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="services-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    }
  );
});

// Bulk delete all services
router.delete('/bulk/all', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  db.run(
    'DELETE FROM services WHERE user_id = ?',
    [userId],
    function(err) {
      if (err) {
        console.error('Error deleting services:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: `Successfully deleted ${this.changes} services` });
    }
  );
});

export default router;

