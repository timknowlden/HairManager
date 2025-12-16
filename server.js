import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './database/init.js';
import appointmentsRoutes from './routes/appointments.js';
import servicesRoutes from './routes/services.js';
import locationsRoutes from './routes/locations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const dbPath = join(__dirname, 'katescuts.db');

// Initialize database first, then start server
initDatabase(dbPath)
  .then(() => {
    // Create database connection after initialization
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
      } else {
        console.log('Connected to SQLite database');
      }
    });

    // Make db available to routes
    app.locals.db = db;

    // Routes
    app.use('/api/appointments', appointmentsRoutes);
    app.use('/api/services', servicesRoutes);
    app.use('/api/locations', locationsRoutes);

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

