import express from 'express';
import sqlite3 from 'sqlite3';

const router = express.Router();

// Get all appointments
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  db.all(
    'SELECT * FROM appointments ORDER BY date DESC, id DESC',
    [],
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

// Get appointment by ID
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  db.get(
    'SELECT * FROM appointments WHERE id = ?',
    [id],
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
  const { location, date, appointments } = req.body;

  if (!location || !date || !appointments || !Array.isArray(appointments)) {
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  // Get distance for this location (only needed for first appointment)
  db.get(
    'SELECT distance FROM address_data WHERE location_name = ?',
    [location],
    (err, locationRow) => {
      if (err) {
        console.error('Error fetching location:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      const distance = locationRow ? locationRow.distance : null;
      const insertedAppointments = [];
      let completed = 0;
      let hasError = false;

      appointments.forEach((apt, index) => {
        const { client_name, service } = apt;

        // Lookup service details
        db.get(
          'SELECT type, price FROM services WHERE service_name = ?',
          [service],
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

            // Only add distance to the first appointment
            const appointmentDistance = index === 0 ? distance : null;

            // Insert appointment
            db.run(
              `INSERT INTO appointments 
               (client_name, service, type, date, location, price, paid, distance, payment_date)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
              [
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
});

// Mark appointment as paid
router.patch('/:id/pay', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  db.run(
    'UPDATE appointments SET paid = 1, payment_date = CURRENT_TIMESTAMP WHERE id = ?',
    [id],
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
        'SELECT * FROM appointments WHERE id = ?',
        [id],
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

  db.run(
    'UPDATE appointments SET paid = 0, payment_date = NULL WHERE id = ?',
    [id],
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
        'SELECT * FROM appointments WHERE id = ?',
        [id],
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

  db.run(
    'DELETE FROM appointments WHERE id = ?',
    [id],
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

export default router;

