import express from 'express';
import sqlite3 from 'sqlite3';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to convert email input (string or array) to JSON array string
function normalizeEmails(emailInput) {
  if (!emailInput) return '[]';
  
  // If it's already a JSON array string, validate and return
  if (typeof emailInput === 'string' && emailInput.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(emailInput);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.filter(e => e && e.trim()));
      }
    } catch (e) {
      // Not valid JSON, treat as comma-separated
    }
  }
  
  // If it's an array, convert to JSON
  if (Array.isArray(emailInput)) {
    return JSON.stringify(emailInput.filter(e => e && e.trim()));
  }
  
  // If it's a string, split by comma and clean up
  if (typeof emailInput === 'string') {
    const emails = emailInput
      .split(',')
      .map(e => e.trim())
      .filter(e => e && e.length > 0);
    return JSON.stringify(emails);
  }
  
  return '[]';
}

// Helper function to parse JSON array string to array
function parseEmails(emailJson) {
  if (!emailJson) return [];
  try {
    const parsed = JSON.parse(emailJson);
    return Array.isArray(parsed) ? parsed.filter(e => e && e.trim()) : [];
  } catch (e) {
    // If not valid JSON, try treating as single email
    return emailJson.trim() ? [emailJson.trim()] : [];
  }
}

// Get all locations for the logged-in user
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  
  db.all(
    'SELECT * FROM address_data WHERE user_id = ? ORDER BY id ASC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      // Parse email_address JSON arrays for each row
      const rowsWithParsedEmails = rows.map(row => ({
        ...row,
        email_address: parseEmails(row.email_address)
      }));
      res.json(rowsWithParsedEmails);
    }
  );
});

// Get location by name
router.get('/:name', (req, res) => {
  const db = req.app.locals.db;
  const { name } = req.params;
  const userId = req.userId;
  
  db.get(
    'SELECT * FROM address_data WHERE location_name = ? AND user_id = ?',
    [name, userId],
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
      // Parse email_address JSON array
      res.json({
        ...row,
        email_address: parseEmails(row.email_address)
      });
    }
  );
});

// Create new location
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { 
    location_name, 
    address, 
    city_town, 
    post_code, 
    distance, 
    contact_name, 
    email_address, 
    contact_details, 
    phone, 
    place_via_ludham, 
    mileage, 
    notes 
  } = req.body;

  if (!location_name) {
    res.status(400).json({ error: 'Location name is required' });
    return;
  }

  // Normalize emails to JSON array
  const emailJson = normalizeEmails(email_address);

  db.run(
    `INSERT INTO address_data 
     (user_id, location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      location_name, 
      address || '', 
      city_town || '', 
      post_code || '', 
      distance || null, 
      contact_name || '', 
      emailJson, 
      contact_details || '', 
      phone || '', 
      place_via_ludham || '', 
      mileage || null, 
      notes || ''
    ],
    function(err) {
      if (err) {
        console.error('Error creating location:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({
        id: this.lastID,
        location_name,
        address,
        city_town,
        post_code,
        distance,
        contact_name,
        email_address: parseEmails(emailJson),
        contact_details,
        phone,
        place_via_ludham,
        mileage,
        notes
      });
    }
  );
});

// Bulk import locations
router.post('/bulk-import', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const { locations } = req.body;

  if (!Array.isArray(locations) || locations.length === 0) {
    res.status(400).json({ error: 'Locations array is required' });
    return;
  }

  const insertLocation = (location) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO address_data 
         (user_id, location_name, address, city_town, post_code, distance, contact_name, email_address, contact_details, phone, place_via_ludham, mileage, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          location.location_name || location['Place Name'] || '',
          location.address || '',
          location.city_town || location['City / Town'] || '',
          location.post_code || location['Post Code'] || '',
          location.distance || parseFloat(location.Distance) || null,
          location.contact_name || location['Contact Name'] || '',
          normalizeEmails(location.email_address || location['Email Address'] || ''),
          location.contact_details || '',
          location.phone || '',
          location.place_via_ludham || location['Place Via Ludham'] || '',
          location.mileage || parseFloat(location.Mileage) || null,
          location.notes || ''
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  };

  Promise.all(locations.map(insertLocation))
    .then((ids) => {
      res.status(201).json({
        message: `Successfully imported ${ids.length} locations`,
        count: ids.length
      });
    })
    .catch((err) => {
      console.error('Error bulk importing locations:', err);
      res.status(500).json({ error: err.message });
    });
});

// Update location
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const userId = req.userId;
  const { 
    location_name, 
    address, 
    city_town, 
    post_code, 
    distance, 
    contact_name, 
    email_address, 
    contact_details, 
    phone, 
    place_via_ludham, 
    mileage, 
    notes 
  } = req.body;

  // Normalize emails to JSON array
  const emailJson = normalizeEmails(email_address);

  db.run(
    `UPDATE address_data SET 
     location_name = ?, address = ?, city_town = ?, post_code = ?, distance = ?, 
     contact_name = ?, email_address = ?, contact_details = ?, phone = ?, 
     place_via_ludham = ?, mileage = ?, notes = ? 
     WHERE id = ? AND user_id = ?`,
    [
      location_name, 
      address || '', 
      city_town || '', 
      post_code || '', 
      distance || null, 
      contact_name || '', 
      emailJson, 
      contact_details || '', 
      phone || '', 
      place_via_ludham || '', 
      mileage || null, 
      notes || '', 
      id,
      userId
    ],
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
  const userId = req.userId;

  db.run(
    'DELETE FROM address_data WHERE id = ? AND user_id = ?',
    [id, userId],
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

// Calculate driving distance between two coordinates
router.post('/calculate-distance', async (req, res) => {
  const { origin, destination } = req.body;
  
  if (!origin || !destination || !origin.lat || !origin.lon || !destination.lat || !destination.lon) {
    res.status(400).json({ error: 'Invalid coordinates provided' });
    return;
  }

  try {
    // Get Google Maps API key from profile settings if available
    const db = req.app.locals.db;
    const profileSettings = await new Promise((resolve, reject) => {
      db.get(
        'SELECT google_maps_api_key FROM admin_settings ORDER BY id DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const apiKey = profileSettings?.google_maps_api_key;

    if (apiKey && apiKey.trim() !== '') {
      console.log('[Distance API] Using Google Maps API');
      // Use Google Maps Distance Matrix API
      const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lon}&destinations=${destination.lat},${destination.lon}&units=imperial&key=${apiKey}`;
      const googleResponse = await fetch(googleUrl);
      
      if (googleResponse.ok) {
        const googleData = await googleResponse.json();
        
        if (googleData.status === 'OK' && googleData.rows && googleData.rows[0] && googleData.rows[0].elements && googleData.rows[0].elements[0].status === 'OK') {
          // Get distance in miles, multiply by 2 for round trip
          const distanceText = googleData.rows[0].elements[0].distance.text;
          const distanceValue = googleData.rows[0].elements[0].distance.value; // in meters
          const oneWayMiles = distanceValue / 1609.34;
          const distanceMiles = oneWayMiles * 2; // Convert to miles and multiply by 2 for round trip
          console.log(`[Distance API] Google Maps: ${oneWayMiles.toFixed(1)} miles one-way, ${distanceMiles.toFixed(1)} miles round trip`);
          res.json({ distance: distanceMiles, source: 'google', oneWay: oneWayMiles });
          return;
        } else {
          console.warn('[Distance API] Google Maps API returned error:', googleData.status, googleData.error_message);
        }
      } else {
        console.warn('[Distance API] Google Maps API request failed:', googleResponse.status);
      }
    } else {
      console.log('[Distance API] No Google Maps API key found, using GraphHopper (OpenStreetMap)');
    }

    // Use GraphHopper (free OpenStreetMap-based routing, more accurate than OSRM)
    console.log('[Distance API] Using GraphHopper (OpenStreetMap)');
    try {
      const graphhopperUrl = `https://graphhopper.com/api/1/route?point=${origin.lat},${origin.lon}&point=${destination.lat},${destination.lon}&vehicle=car&key=&type=json&instructions=false&calc_points=false`;
      const graphhopperResponse = await fetch(graphhopperUrl);
      
      if (graphhopperResponse.ok) {
        const graphhopperData = await graphhopperResponse.json();
        
        if (graphhopperData.paths && graphhopperData.paths.length > 0 && graphhopperData.paths[0].distance) {
          const distanceMeters = graphhopperData.paths[0].distance;
          const oneWayMiles = distanceMeters / 1609.34;
          const distanceMiles = oneWayMiles * 2; // Convert to miles and multiply by 2
          console.log(`[Distance API] GraphHopper: ${oneWayMiles.toFixed(1)} miles one-way, ${distanceMiles.toFixed(1)} miles round trip`);
          res.json({ distance: distanceMiles, source: 'graphhopper', oneWay: oneWayMiles });
          return;
        } else {
          console.warn('[Distance API] GraphHopper routing failed:', graphhopperData.message || 'No path found');
        }
      } else {
        console.warn('[Distance API] GraphHopper API request failed:', graphhopperResponse.status);
      }
    } catch (graphhopperErr) {
      console.warn('[Distance API] GraphHopper error:', graphhopperErr.message);
    }

    // Fallback to OSRM if GraphHopper fails
    console.log('[Distance API] Falling back to OSRM');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`;
    const osrmResponse = await fetch(osrmUrl);
    
    if (osrmResponse.ok) {
      const osrmData = await osrmResponse.json();
      
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        const distanceMeters = osrmData.routes[0].distance;
        const oneWayMiles = distanceMeters / 1609.34;
        const distanceMiles = oneWayMiles * 2; // Convert to miles and multiply by 2
        console.log(`[Distance API] OSRM: ${oneWayMiles.toFixed(1)} miles one-way, ${distanceMiles.toFixed(1)} miles round trip`);
        res.json({ distance: distanceMiles, source: 'osrm', oneWay: oneWayMiles });
        return;
      } else {
        console.warn('[Distance API] OSRM routing failed:', osrmData.code);
      }
    } else {
      console.warn('[Distance API] OSRM API request failed:', osrmResponse.status);
    }

    // Final fallback to straight-line distance
    const R = 3959; // Earth's radius in miles
    const dLat = (destination.lat - origin.lat) * Math.PI / 180;
    const dLon = (destination.lon - origin.lon) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMiles = (R * c) * 2; // Multiply by 2 for round trip
    
    res.json({ distance: distanceMiles, source: 'straight-line' });
  } catch (err) {
    console.error('Error calculating distance:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resync distances for all locations based on new home postcode
router.post('/resync-distances', async (req, res) => {
  const db = req.app.locals.db;
  
  try {
    // Get home postcode and Google Maps API key from profile settings
    const profileSettings = await new Promise((resolve, reject) => {
      db.get(
        'SELECT home_postcode, google_maps_api_key FROM admin_settings ORDER BY id DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!profileSettings || !profileSettings.home_postcode) {
      res.status(400).json({ error: 'Home postcode not set in profile settings' });
      return;
    }

    const homePostcode = profileSettings.home_postcode.trim().toUpperCase().replace(/\s+/g, '');
    
    // Get all locations with postcodes
    const locations = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, location_name, post_code FROM address_data WHERE post_code IS NOT NULL AND post_code != ""',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (locations.length === 0) {
      res.json({ 
        message: 'No locations with postcodes found',
        updated: 0
      });
      return;
    }

    // Get home postcode coordinates
    const homeResponse = await fetch(`https://api.postcodes.io/postcodes/${homePostcode}`);
    if (!homeResponse.ok) {
      res.status(400).json({ error: `Failed to lookup home postcode: ${homePostcode}` });
      return;
    }
    const homeData = await homeResponse.json();
    if (homeData.status !== 200) {
      res.status(400).json({ error: `Home postcode not found: ${homePostcode}` });
      return;
    }

    const homeLat = homeData.result.latitude;
    const homeLon = homeData.result.longitude;

    // Calculate distance function (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Update each location
    let updated = 0;
    let errors = [];

    for (const location of locations) {
      try {
        const locationPostcode = location.post_code.trim().toUpperCase().replace(/\s+/g, '');
        const locationResponse = await fetch(`https://api.postcodes.io/postcodes/${locationPostcode}`);
        
        if (!locationResponse.ok) {
          errors.push(`${location.location_name}: Postcode lookup failed`);
          continue;
        }

        const locationData = await locationResponse.json();
        if (locationData.status !== 200) {
          errors.push(`${location.location_name}: Postcode not found`);
          continue;
        }

        const targetLat = locationData.result.latitude;
        const targetLon = locationData.result.longitude;

        // Use the same distance calculation logic as calculate-distance endpoint
        let roundedDistance;
        try {
          // Try Google Maps first if API key is available
          if (profileSettings?.google_maps_api_key) {
            const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${homeLat},${homeLon}&destinations=${targetLat},${targetLon}&units=imperial&key=${profileSettings.google_maps_api_key}`;
            const googleResponse = await fetch(googleUrl);
            
            if (googleResponse.ok) {
              const googleData = await googleResponse.json();
              
              if (googleData.status === 'OK' && googleData.rows && googleData.rows[0] && googleData.rows[0].elements && googleData.rows[0].elements[0].status === 'OK') {
                const distanceValue = googleData.rows[0].elements[0].distance.value; // in meters
                const distanceMiles = (distanceValue / 1609.34) * 2; // Convert to miles and multiply by 2
                roundedDistance = Math.round(distanceMiles * 10) / 10;
              } else {
                throw new Error('Google Maps API returned error');
              }
            } else {
              throw new Error('Google Maps API request failed');
            }
          } else {
            throw new Error('No Google Maps API key');
          }
        } catch (googleErr) {
          // Fallback to OSRM
          try {
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${homeLon},${homeLat};${targetLon},${targetLat}?overview=false`;
            const osrmResponse = await fetch(osrmUrl);
            
            if (osrmResponse.ok) {
              const osrmData = await osrmResponse.json();
              
              if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                const distanceMeters = osrmData.routes[0].distance;
                const distanceMiles = (distanceMeters / 1609.34) * 2;
                roundedDistance = Math.round(distanceMiles * 10) / 10;
              } else {
                throw new Error('OSRM routing failed');
              }
            } else {
              throw new Error('OSRM API failed');
            }
          } catch (osrmErr) {
            // Final fallback to straight-line distance
            console.warn(`Distance calculation failed for ${location.location_name}, using straight-line:`, osrmErr);
            const distance = calculateDistance(homeLat, homeLon, targetLat, targetLon) * 2;
            roundedDistance = Math.round(distance * 10) / 10;
          }
        }

        // Update location in database
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE address_data SET distance = ? WHERE id = ?',
            [roundedDistance, location.id],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        updated++;
      } catch (err) {
        errors.push(`${location.location_name}: ${err.message}`);
      }
    }

    res.json({
      message: `Successfully updated ${updated} location(s)`,
      updated,
      total: locations.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Error resyncing distances:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

