import express from 'express';
import sqlite3 from 'sqlite3';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all appointments for the logged-in user
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC, id DESC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Test route to verify PUT is working
router.put('/test', (req, res) => {
  res.json({ message: 'PUT route is working' });
});

// Update appointment (for admin editing) - MUST come before GET /:id to avoid route conflicts
router.put('/:id', (req, res) => {
  console.log('PUT route matched for /api/appointments/:id');
  const db = req.app.locals.db;
  const { id } = req.params;
  const { client_name, service, type, date, location, price, distance } = req.body;
  
  console.log('PUT /api/appointments/:id called with id:', id, 'type:', typeof id);
  console.log('Request body:', req.body);
  
  // Convert id to integer to ensure type matching
  const appointmentId = parseInt(id, 10);
  if (isNaN(appointmentId)) {
    console.error('Invalid appointment ID:', id);
    res.status(400).json({ error: 'Invalid appointment ID' });
    return;
  }

  // Build update query dynamically based on provided fields
  const updates = [];
  const values = [];

  if (client_name !== undefined) {
    updates.push('client_name = ?');
    values.push(client_name);
  }
  if (service !== undefined) {
    updates.push('service = ?');
    values.push(service);
  }
  if (type !== undefined) {
    updates.push('type = ?');
    values.push(type);
  }
  if (date !== undefined) {
    updates.push('date = ?');
    values.push(date);
  }
  if (location !== undefined) {
    updates.push('location = ?');
    values.push(location);
  }
  if (price !== undefined) {
    updates.push('price = ?');
    values.push(price);
  }
  if (distance !== undefined) {
    updates.push('distance = ?');
    values.push(distance === null ? null : distance);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(appointmentId);
  
  console.log('SQL UPDATE query:', `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`);
  console.log('Values:', values);

  const userId = req.userId;
  values.push(userId);
  
  db.run(
    `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    values,
    function(err) {
      if (err) {
        console.error('Error updating appointment:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log('Update result - changes:', this.changes, 'lastID:', this.lastID);
      if (this.changes === 0) {
        console.log('No rows updated - appointment ID', appointmentId, 'may not exist');
        // Check if appointment exists and belongs to user
        db.get('SELECT id FROM appointments WHERE id = ? AND user_id = ?', [appointmentId, userId], (checkErr, row) => {
          if (checkErr) {
            console.error('Error checking appointment:', checkErr);
            res.status(500).json({ error: checkErr.message });
            return;
          }
          if (!row) {
            res.status(404).json({ error: `Appointment with ID ${appointmentId} not found` });
          } else {
            res.status(400).json({ error: 'No fields were updated (values may be unchanged)' });
          }
        });
        return;
      }

      // Return updated appointment
      db.get(
        'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
        [id, userId],
        (getErr, row) => {
          if (getErr) {
            res.status(500).json({ error: getErr.message });
            return;
          }
          res.json(row);
        }
      );
    }
  );
});

// Get appointment by ID
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const userId = req.userId;
  
  db.get(
    'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching appointment:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }
      res.json(row);
    }
  );
});

// Create multiple appointments (batch entry)
router.post('/batch', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { location, date, appointments } = req.body;

  if (!location || !date || !appointments || !Array.isArray(appointments)) {
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  // Get distance for this location (only needed for first appointment) - must belong to user
  db.get(
    'SELECT distance FROM address_data WHERE location_name = ? AND user_id = ?',
    [location, userId],
    (err, locationRow) => {
      if (err) {
        console.error('Error fetching location:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      const distance = locationRow ? locationRow.distance : null;
      
      // Check if there are already appointments for this location/date combination
      // Only the first appointment (by ID) for a location/date should have distance
      db.all(
        'SELECT id, distance FROM appointments WHERE location = ? AND date = ? AND user_id = ? ORDER BY id ASC',
        [location, date, userId],
        (checkErr, existingAppointments) => {
          if (checkErr) {
            console.error('Error checking existing appointments:', checkErr);
            res.status(500).json({ error: checkErr.message });
            return;
          }

          // Find if any existing appointment has distance
          const hasExistingDistance = existingAppointments && existingAppointments.some(apt => apt.distance !== null && apt.distance !== undefined);
          
          // If there are existing appointments but none have distance, update the first one
          if (existingAppointments && existingAppointments.length > 0 && !hasExistingDistance && distance !== null) {
            const firstAppointmentId = existingAppointments[0].id;
            db.run(
              'UPDATE appointments SET distance = ? WHERE id = ? AND user_id = ?',
              [distance, firstAppointmentId, userId],
              (updateErr) => {
                if (updateErr) {
                  console.error('Error updating existing appointment distance:', updateErr);
                  // Continue anyway, don't fail the request
                }
              }
            );
          }

          const insertedAppointments = [];
          let completed = 0;
          let hasError = false;

          appointments.forEach((apt, index) => {
            const { client_name, service } = apt;

            // Lookup service details - must belong to user
            db.get(
              'SELECT type, price FROM services WHERE service_name = ? AND user_id = ?',
              [service, userId],
              (serviceErr, serviceRow) => {
                if (hasError) return;

                if (serviceErr) {
                  console.error('Error fetching service:', serviceErr);
                  if (!hasError) {
                    hasError = true;
                    res.status(500).json({ error: serviceErr.message });
                  }
                  return;
                }

                if (!serviceRow) {
                  if (!hasError) {
                    hasError = true;
                    res.status(400).json({ error: `Service "${service}" not found` });
                  }
                  return;
                }

                // Only add distance to the first appointment if no existing appointment has distance for this location/date
                // AND this is the first appointment in the batch
                const appointmentDistance = (!hasExistingDistance && existingAppointments.length === 0 && index === 0) ? distance : null;

            // Insert appointment with user_id
            db.run(
              `INSERT INTO appointments 
               (user_id, client_name, service, type, date, location, price, paid, distance, payment_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
              [
                userId,
                client_name,
                service,
                serviceRow.type,
                date,
                location,
                serviceRow.price,
                appointmentDistance
              ],
              function(insertErr) {
                if (hasError) return;

                if (insertErr) {
                  console.error('Error inserting appointment:', insertErr);
                  if (!hasError) {
                    hasError = true;
                    res.status(500).json({ error: insertErr.message });
                  }
                  return;
                }

                insertedAppointments.push({
                  id: this.lastID,
                  client_name,
                  service,
                  type: serviceRow.type,
                  date,
                  location,
                  price: serviceRow.price,
                  paid: 0,
                  distance: appointmentDistance,
                  payment_date: null
                });

                completed++;
                if (completed === appointments.length) {
                  res.status(201).json({
                    message: `Successfully created ${insertedAppointments.length} appointments`,
                    appointments: insertedAppointments
                  });
                }
              }
            );
          }
        );
      });
        }
      );
    }
  );
});

// Mark appointment as paid
router.patch('/:id/pay', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const userId = req.userId;

  db.run(
    'UPDATE appointments SET paid = 1, payment_date = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) {
        console.error('Error updating appointment:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      // Return updated appointment
      db.get(
        'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
        [id, userId],
        (getErr, row) => {
          if (getErr) {
            res.status(500).json({ error: getErr.message });
            return;
          }
          res.json(row);
        }
      );
    }
  );
});

// Mark appointment as unpaid
router.patch('/:id/unpay', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const userId = req.userId;

  db.run(
    'UPDATE appointments SET paid = 0, payment_date = NULL WHERE id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) {
        console.error('Error updating appointment:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      // Return updated appointment
      db.get(
        'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
        [id, userId],
        (getErr, row) => {
          if (getErr) {
            res.status(500).json({ error: getErr.message });
            return;
          }
          res.json(row);
        }
      );
    }
  );
});

// Delete appointment
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const userId = req.userId;

  db.run(
    'DELETE FROM appointments WHERE id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) {
        console.error('Error deleting appointment:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }
      res.json({ message: 'Appointment deleted successfully' });
    }
  );
});

// Export appointments as CSV
router.get('/export/csv', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC, id DESC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      // CSV header
      const headers = ['date', 'client_name', 'service', 'type', 'location', 'price', 'paid', 'distance', 'payment_date'];
      let csv = headers.join(',') + '\n';
      
      // CSV rows
      rows.forEach(row => {
        const values = [
          row.date || '',
          `"${(row.client_name || '').replace(/"/g, '""')}"`,
          `"${(row.service || '').replace(/"/g, '""')}"`,
          `"${(row.type || '').replace(/"/g, '""')}"`,
          `"${(row.location || '').replace(/"/g, '""')}"`,
          row.price || 0,
          row.paid || 0,
          row.distance || '',
          row.payment_date || ''
        ];
        csv += values.join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="appointments-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    }
  );
});

// Bulk delete all appointments
router.delete('/bulk/all', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  db.run(
    'DELETE FROM appointments WHERE user_id = ?',
    [userId],
    function(err) {
      if (err) {
        console.error('Error deleting appointments:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: `Successfully deleted ${this.changes} appointments` });
    }
  );
});

export default router;

