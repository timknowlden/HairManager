import { useState, useEffect, useMemo } from 'react';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './LocationsManager.css';

import { API_BASE } from '../config.js';

function LocationsManager() {
  const { getAuthHeaders } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [homePostcode, setHomePostcode] = useState(null);
  const [postcodeResyncNeeded, setPostcodeResyncNeeded] = useState(false);
  const [previousPostcode, setPreviousPostcode] = useState('');
  const [currentPostcode, setCurrentPostcode] = useState('');
  const [resyncing, setResyncing] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    location_name: '',
    address: '',
    city_town: '',
    post_code: '',
    distance: '',
    contact_name: '',
    email_address: '',
    phone: ''
  });

  // Column widths state for resizing
  const [columnWidths, setColumnWidths] = useState({
    id: 50,
    location_name: 150,
    address: 150,
    city_town: 120,
    post_code: 100,
    distance: 80,
    contact_name: 120,
    email_address: 180,
    phone: 120,
    actions: 100
  });

  const [resizingColumn, setResizingColumn] = useState(null);

  // Sort state - default to ID ascending
  const [sortConfig, setSortConfig] = useState({ column: 'id', direction: 'asc' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    location_name: '',
    address: '',
    city_town: '',
    post_code: '',
    distance: '',
    contact_name: '',
    email_address: [], // Changed to array
    contact_details: '',
    phone: '',
    notes: ''
  });
  const [currentEmailInput, setCurrentEmailInput] = useState(''); // For the email input field

  useEffect(() => {
    fetchAdminSettings();
    fetchLocations();
  }, []);

  const fetchAdminSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/profile`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.home_postcode) {
          // Remove spaces and convert to uppercase for API
          const postcode = data.home_postcode.trim().toUpperCase().replace(/\s+/g, '');
          setHomePostcode(postcode);
          setCurrentPostcode(data.home_postcode);
        }
        // Check if postcode resync is needed
        if (data.postcode_resync_needed) {
          setPostcodeResyncNeeded(true);
        } else {
          setPostcodeResyncNeeded(false);
        }
      }
    } catch (err) {
      console.error('Error fetching admin settings:', err);
      // Fallback to default if admin settings not available
      setHomePostcode('NR136TD');
    }
  };

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/locations`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }
      const data = await response.json();
      setLocations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Email management functions
  const addEmail = (email) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError(`Invalid email format: ${trimmedEmail}`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    // Check if email already exists
    if (formData.email_address.includes(trimmedEmail)) {
      setError(`Email already added: ${trimmedEmail}`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      email_address: [...prev.email_address, trimmedEmail]
    }));
    setCurrentEmailInput('');
  };

  const removeEmail = (emailToRemove) => {
    setFormData(prev => ({
      ...prev,
      email_address: prev.email_address.filter(email => email !== emailToRemove)
    }));
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEmail(currentEmailInput);
    }
  };

  const handleEmailBlur = () => {
    if (currentEmailInput.trim()) {
      addEmail(currentEmailInput);
    }
  };

  // Calculate distance between two postcodes using Haversine formula
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

  // Lookup postcode and calculate distance, also get city/town
  const handlePostcodeLookup = async () => {
    const postcode = formData.post_code?.trim().toUpperCase().replace(/\s+/g, '');
    if (!postcode) {
      setError('Please enter a postcode');
      return;
    }

    // Wait for admin settings to load if not yet loaded
    if (!homePostcode) {
      await fetchAdminSettings();
    }
    
    // Use admin settings postcode, fallback to default if not set
    const homePostcodeToUse = homePostcode || 'NR136TD';

    setError(null);
    setSuccess('Looking up postcode...');

    try {
      // Get coordinates for both postcodes using postcodes.io (free UK API)
      const [homeResponse, targetResponse] = await Promise.all([
        fetch(`https://api.postcodes.io/postcodes/${homePostcodeToUse}`),
        fetch(`https://api.postcodes.io/postcodes/${postcode}`)
      ]);

      if (!homeResponse.ok || !targetResponse.ok) {
        throw new Error('Postcode lookup failed. Please check the postcode is valid.');
      }

      const homeData = await homeResponse.json();
      const targetData = await targetResponse.json();

      if (homeData.status !== 200 || targetData.status !== 200) {
        throw new Error('Postcode not found. Please check the postcode is valid.');
      }

      const homeLat = homeData.result.latitude;
      const homeLon = homeData.result.longitude;
      const targetLat = targetData.result.latitude;
      const targetLon = targetData.result.longitude;

      // Try to get driving distance - use backend API which can use Google Maps if configured
      let roundedDistance;
      try {
        const distanceResponse = await fetch(`${API_BASE}/locations/calculate-distance`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            origin: { lat: homeLat, lon: homeLon },
            destination: { lat: targetLat, lon: targetLon }
          })
        });

        if (distanceResponse.ok) {
          const distanceData = await distanceResponse.json();
          if (distanceData.distance) {
            // Distance is already in miles and round trip
            roundedDistance = Math.round(distanceData.distance * 10) / 10;
            console.log(`Distance calculated: ${roundedDistance} miles (round trip) using ${distanceData.source || 'unknown'} source`);
            if (distanceData.source === 'osrm') {
              console.warn('Note: OSRM distances may be less accurate than Google Maps. Consider adding a Google Maps API key in Profile Settings for more accurate results.');
            }
          } else {
            throw new Error('No distance in response');
          }
        } else {
          const errorData = await distanceResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Distance API failed');
        }
      } catch (apiErr) {
        // Fallback to GraphHopper (OpenStreetMap-based, free) if backend API fails
        console.warn('Backend distance API failed, trying GraphHopper:', apiErr);
        try {
          const graphhopperUrl = `https://graphhopper.com/api/1/route?point=${homeLat},${homeLon}&point=${targetLat},${targetLon}&vehicle=car&key=&type=json&instructions=false&calc_points=false`;
          const graphhopperResponse = await fetch(graphhopperUrl);
          
          if (graphhopperResponse.ok) {
            const graphhopperData = await graphhopperResponse.json();
            
            if (graphhopperData.paths && graphhopperData.paths.length > 0 && graphhopperData.paths[0].distance) {
              const distanceMeters = graphhopperData.paths[0].distance;
              const distanceMiles = (distanceMeters / 1609.34) * 2;
              roundedDistance = Math.round(distanceMiles * 10) / 10;
            } else {
              throw new Error('GraphHopper routing failed');
            }
          } else {
            throw new Error('GraphHopper API failed');
          }
        } catch (graphhopperErr) {
          // Fallback to OSRM
          try {
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${homeLon},${homeLat};${targetLon},${targetLat}?overview=false`;
            const routeResponse = await fetch(osrmUrl);
            
            if (routeResponse.ok) {
              const routeData = await routeResponse.json();
              
              if (routeData.code === 'Ok' && routeData.routes && routeData.routes.length > 0) {
                const distanceMeters = routeData.routes[0].distance;
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
            console.warn('All routing services failed, using straight-line distance:', osrmErr);
            const distance = calculateDistance(homeLat, homeLon, targetLat, targetLon) * 2;
            roundedDistance = Math.round(distance * 10) / 10;
          }
        }
      }

      // Get actual town name (try to extract "Ludham" or similar)
      const townName = targetData.result.post_town || 
                       (targetData.result.parish && targetData.result.parish.includes('Ludham') ? 'Ludham' : null) ||
                       targetData.result.admin_district || 
                       '';

      // Auto-fill only distance and city/town
      const updates = {
        distance: roundedDistance.toFixed(1)
      };

      // Auto-fill city/town field
      if (townName && (!formData.city_town || formData.city_town.trim() === '')) {
        updates.city_town = townName;
      }

      setFormData(prev => ({
        ...prev,
        ...updates
      }));

      setSuccess(`Driving distance calculated: ${roundedDistance.toFixed(1)} miles (round trip) from ${homePostcodeToUse}${townName ? `. Town: ${townName}` : ''}`);
    } catch (err) {
      console.error('Postcode lookup error:', err);
      setError(err.message || 'Failed to lookup postcode. Please enter distance manually.');
      setSuccess(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        ...formData,
        post_code: formData.post_code ? formData.post_code.trim().toUpperCase().replace(/\s+/g, '') : '',
        distance: formData.distance ? parseFloat(formData.distance) : null
      };

      let response;
      if (editingId) {
        response = await fetch(`${API_BASE}/locations/${editingId}`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/locations`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save location');
      }

      setSuccess(editingId ? 'Location updated successfully' : 'Location added successfully');
      setShowAddForm(false);
      setEditingId(null);
      resetForm();
      fetchLocations();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (location) => {
    // Set email_address as array directly
    const emailArray = Array.isArray(location.email_address) 
      ? location.email_address 
      : (location.email_address ? [location.email_address] : []);
    
    setFormData({
      location_name: location.location_name || '',
      address: location.address || '',
      city_town: location.city_town || '',
      post_code: location.post_code || '',
      distance: location.distance || '',
      contact_name: location.contact_name || '',
      email_address: emailArray,
      contact_details: location.contact_details || '',
      phone: location.phone || '',
      notes: location.notes || ''
    });
    setCurrentEmailInput(''); // Clear the input field
    setEditingId(location.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this location?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/locations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete location');
      }

      setSuccess('Location deleted successfully');
      fetchLocations();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImportClick = () => {
    // Pre-fill with default data
    const defaultData = `Place Name	Address	City / Town	Post Code	Distance	Contact Name	Email Address				Place Via Ludham	Mileage
Mousehold View	28 Mousehold Lane	Norwich	NR7 8HE	7.5 mi	Jodie Ayre 	mouseholdview.admin@averyhealthcare.co.uk				Sydney House 	32.9
Sydney House	Brumstead Rd	Stalham	NR12 9BJ	25.8 mi	Georgina Cook 	georgina.cook@norsecare.co.uk				The Lawns	46.4
The Lawns	Caister Road	Great Yarmouth	NR30 4DQ	34.7 mi						St Augustines	53.8
St Augustines Place	Addison Road	Gorleston	NR31 0PA	37.8 mi	Danielle Bullent 	Danielle.bullent@norsecare.co.uk 				Overbury House	33.9
Overbury House	9 Staitheway Road	Wroxham	NR12 8TH	8.3 mi	Tanya 	admin@overburyhouse.healthcarehomes.co.uk					
Mountfield	Millcroft	Norwich	NR3 3LS	5.8 mi	Sandra Clayton 	sandra.clayton@norsecare.co.uk					
The Old Vicarage	Norwich Road	Ludham	NR29 5QA	10.5 mi							
Woodside Carehome 	142 Woodside Road 	Norwich 	NR7 9XJ	3.8 mi	Sally Dack 	woodside@barchester.com					
Ellacombe Carehome 	Ella Road 	Norwich 	NR1 4BP	4.1 mi	Georgina Kellet 	georgina.kellett@norsecare.co.uk 					
Kings Court	Hempstead Rd	Holt	NR25 6DQ	52.0 mi	Emily Marie`;
    setImportData(defaultData);
    setShowImportDialog(true);
  };

  const handleBulkImport = async () => {
    if (!importData.trim()) {
      setError('Please paste the data to import');
      return;
    }

    setError(null);
    setSuccess(null);

    // Skip header row if present
    const lines = importData.split('\n').filter(line => line.trim());
    const dataLines = lines[0]?.includes('Place Name') ? lines.slice(1) : lines;

    const locationsToImport = dataLines.map(line => {
      const parts = line.split('\t');
      // Column mapping: 0=Place Name, 1=Address, 2=City/Town, 3=Post Code, 4=Distance, 
      // 5=Contact Name, 6=Email, 7-8=empty, 9=Place Via Ludham (deprecated), 10=Mileage (deprecated)
      // Use Distance (column 4) as the mileage value, ignore columns 9 and 10
      const distanceStr = parts[4]?.trim() || '';
      const distance = distanceStr ? parseFloat(distanceStr.replace(/ mi/gi, '').replace(/mi/gi, '')) : null;
      
      return {
        location_name: parts[0]?.trim() || '',
        address: parts[1]?.trim() || '',
        city_town: parts[2]?.trim() || '',
        post_code: parts[3]?.trim() ? parts[3].trim().toUpperCase().replace(/\s+/g, '') : '',
        distance: distance,
        contact_name: parts[5]?.trim() || '',
        email_address: parts[6]?.trim() || ''
      };
    }).filter(loc => loc.location_name); // Filter out empty rows

    if (locationsToImport.length === 0) {
      setError('No valid locations found in the data');
      return;
    }

    console.log('Importing locations:', locationsToImport);

    try {
      const response = await fetch(`${API_BASE}/locations/bulk-import`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: locationsToImport })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to import locations';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSuccess(`Successfully imported ${data.count} locations`);
      setShowImportDialog(false);
      setImportData('');
      fetchLocations();
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import locations. Make sure the backend server is running.');
    }
  };

  const resetForm = () => {
    setFormData({
      location_name: '',
      address: '',
      city_town: '',
      post_code: '',
      distance: '',
      contact_name: '',
      email_address: [],
      contact_details: '',
      phone: '',
      notes: ''
    });
    setCurrentEmailInput('');
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    resetForm();
  };

  // Handle column sorting
  const handleSort = (column) => {
    let direction = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

  // Sort function
  const sortData = (data, column, direction) => {
    if (!column) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];

      if (column === 'id' || column === 'distance') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Handle column resizing
  const handleMouseDown = (e, column) => {
    e.preventDefault();
    setResizingColumn(column);
    const startX = e.pageX;
    const startWidth = columnWidths[column];

    const handleMouseMove = (e) => {
      const newWidth = startWidth + (e.pageX - startX);
      // ID column has a smaller minimum width
      const minWidth = column === 'id' ? 30 : 30;
      if (newWidth > minWidth) {
        setColumnWidths(prev => ({
          ...prev,
          [column]: newWidth
        }));
      }
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Filter and sort locations
  const filteredAndSortedLocations = useMemo(() => {
    let filtered = locations.filter(loc => {
      if (filters.location_name && !loc.location_name.toLowerCase().includes(filters.location_name.toLowerCase())) return false;
      if (filters.address && !loc.address.toLowerCase().includes(filters.address.toLowerCase())) return false;
      if (filters.city_town && !loc.city_town.toLowerCase().includes(filters.city_town.toLowerCase())) return false;
      if (filters.post_code && !loc.post_code.toLowerCase().includes(filters.post_code.toLowerCase())) return false;
      if (filters.distance) {
        const distanceStr = loc.distance ? loc.distance.toString() : '';
        if (!distanceStr.includes(filters.distance)) return false;
      }
      if (filters.contact_name && !loc.contact_name.toLowerCase().includes(filters.contact_name.toLowerCase())) return false;
      if (filters.email_address) {
        const emails = Array.isArray(loc.email_address) ? loc.email_address : [loc.email_address].filter(e => e);
        const emailMatch = emails.some(email => email && email.toLowerCase().includes(filters.email_address.toLowerCase()));
        if (!emailMatch) return false;
      }
      if (filters.phone && !loc.phone.toLowerCase().includes(filters.phone.toLowerCase())) return false;
      return true;
    });

    // Always apply sorting (defaults to ID if no column selected)
    const sortColumn = sortConfig.column || 'id';
    const sortDirection = sortConfig.direction || 'asc';
    filtered = sortData(filtered, sortColumn, sortDirection);

    return filtered;
  }, [locations, filters, sortConfig]);

  const handleFilterChange = (column, value) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      location_name: '',
      address: '',
      city_town: '',
      post_code: '',
      distance: '',
      contact_name: '',
      email_address: '',
      phone: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(f => f !== '');

  const handleResyncDistances = async () => {
    setResyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/locations/resync-distances`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resync distances');
      }

      const data = await response.json();
      setSuccess(`Successfully resynced ${data.updated} of ${data.total} location(s).${data.errors ? ` ${data.errors.length} error(s) occurred.` : ''}`);
      
      // Clear the flag in the database first
      try {
        const clearResponse = await fetch(`${API_BASE}/profile/clear-postcode-resync`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        });
        if (clearResponse.ok) {
          console.log('Postcode resync flag cleared successfully');
          // Clear the warning after successful database update
          setPostcodeResyncNeeded(false);
          // Refresh locations to show updated distances
          fetchLocations();
        } else {
          console.error('Failed to clear postcode resync flag:', clearResponse.status);
        }
      } catch (err) {
        console.error('Error clearing postcode resync flag:', err);
        // Still clear the warning even if the API call fails
        setPostcodeResyncNeeded(false);
        fetchLocations();
      }
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setResyncing(false);
    }
  };

  const handleDismissWarning = async () => {
    setPostcodeResyncNeeded(false);
    
    // Clear the flag in the database
    try {
      await fetch(`${API_BASE}/profile/clear-postcode-resync`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      console.error('Error clearing postcode resync flag:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading locations...</div>;
  }

  return (
    <div className="locations-manager">
      <div className="locations-header">
        <h2>Locations Management</h2>
        <div className="header-actions">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear Filters
            </button>
          )}
          <div className="header-buttons">
            <button 
              onClick={() => { setShowAddForm(true); setEditingId(null); resetForm(); }} 
              className="add-btn"
            >
              + Add Location
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      {postcodeResyncNeeded && (
        <div className="warning-message" style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderLeft: '4px solid #ffc107',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#856404'
        }}>
          <div style={{ marginBottom: '10px' }}>
            <strong>⚠️ Warning:</strong> {previousPostcode ? `The postcode has been changed from "${previousPostcode}" to "${currentPostcode}".` : `The home postcode has been changed to "${currentPostcode}".`} You will need to resync locations to recalculate distances from the new home postcode.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleResyncDistances}
              disabled={resyncing}
              style={{
                backgroundColor: '#ffc107',
                color: '#856404',
                border: '1px solid #ffc107',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: resyncing ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              {resyncing ? 'Resyncing...' : 'Resync Location Distances'}
            </button>
            <button
              type="button"
              onClick={handleDismissWarning}
              disabled={resyncing}
              style={{
                backgroundColor: 'transparent',
                color: '#856404',
                border: '1px solid #856404',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: resyncing ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showImportDialog && (
        <div className="import-dialog-overlay" onClick={() => setShowImportDialog(false)}>
          <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Import Locations from Google Sheet</h3>
            <p className="import-instructions">
              Paste your tab-separated data from Google Sheets below. The first row should be the header row.
            </p>
            <textarea
              className="import-textarea"
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste your tab-separated data here..."
              rows="15"
            />
            <div className="import-dialog-actions">
              <button onClick={handleBulkImport} className="import-confirm-btn">
                Import Locations
              </button>
              <button onClick={() => { setShowImportDialog(false); setImportData(''); }} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="location-form-container">
          <h3>{editingId ? 'Edit Location' : 'Add New Location'}</h3>
          <form onSubmit={handleSubmit} className="location-form">
            <div className="form-row">
              <div className="form-group">
                <label>Post Code *</label>
                <div className="postcode-lookup-group">
                  <input
                    type="text"
                    name="post_code"
                    value={formData.post_code}
                    onChange={handleInputChange}
                    placeholder="e.g., NR7 8HE"
                    required
                  />
                  <button
                    type="button"
                    onClick={handlePostcodeLookup}
                    className="lookup-btn"
                    title="Calculate distance from home postcode and lookup town"
                  >
                    Lookup
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Place Name *</label>
                <input
                  type="text"
                  name="location_name"
                  value={formData.location_name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Distance (mi)</label>
                <input
                  type="number"
                  step="0.1"
                  name="distance"
                  value={formData.distance}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>City / Town</label>
                <input
                  type="text"
                  name="city_town"
                  value={formData.city_town}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Contact Name</label>
                <input
                  type="text"
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Email Address(es)</label>
                <div style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  padding: '8px',
                  minHeight: '40px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  alignItems: 'center'
                }}>
                  {/* Display email tags */}
                  {formData.email_address.map((email, index) => (
                    <span
                      key={index}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#e3f2fd',
                        color: '#1976d2',
                        padding: '4px 8px',
                        borderRadius: '16px',
                        fontSize: '13px'
                      }}
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#1976d2',
                          cursor: 'pointer',
                          padding: '0',
                          marginLeft: '4px',
                          fontSize: '16px',
                          lineHeight: '1',
                          fontWeight: 'bold'
                        }}
                        title="Remove email"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {/* Email input field */}
                  <input
                    type="email"
                    value={currentEmailInput}
                    onChange={(e) => setCurrentEmailInput(e.target.value)}
                    onKeyDown={handleEmailKeyDown}
                    onBlur={handleEmailBlur}
                    placeholder={formData.email_address.length === 0 ? "Enter email and press Enter" : "Add another email"}
                    style={{
                      border: 'none',
                      outline: 'none',
                      flex: '1',
                      minWidth: '150px',
                      padding: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Enter an email and press Enter or click outside to add it
                </p>
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn">
                {editingId ? 'Update' : 'Add'} Location
              </button>
              <button type="button" onClick={cancelForm} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="locations-table-container">
        <div className="filter-info">
          Showing {filteredAndSortedLocations.length} of {locations.length} locations
        </div>
        <table>
          <thead>
            <tr>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('id')}
                style={{ width: columnWidths.id, position: 'relative' }}
              >
                ID {sortConfig.column === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'id')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('location_name')}
                style={{ width: columnWidths.location_name, position: 'relative' }}
              >
                Place Name {sortConfig.column === 'location_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'location_name')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('address')}
                style={{ width: columnWidths.address, position: 'relative' }}
              >
                Address {sortConfig.column === 'address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'address')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('city_town')}
                style={{ width: columnWidths.city_town, position: 'relative' }}
              >
                City/Town {sortConfig.column === 'city_town' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'city_town')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('post_code')}
                style={{ width: columnWidths.post_code, position: 'relative' }}
              >
                Post Code {sortConfig.column === 'post_code' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'post_code')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('distance')}
                style={{ width: columnWidths.distance, position: 'relative' }}
              >
                Distance {sortConfig.column === 'distance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'distance')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('contact_name')}
                style={{ width: columnWidths.contact_name, position: 'relative' }}
              >
                Contact {sortConfig.column === 'contact_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'contact_name')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('email_address')}
                style={{ width: columnWidths.email_address, position: 'relative' }}
              >
                Email {sortConfig.column === 'email_address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'email_address')}
                ></div>
              </th>
              <th 
                className="sortable resizable" 
                onClick={() => handleSort('phone')}
                style={{ width: columnWidths.phone, position: 'relative' }}
              >
                Phone {sortConfig.column === 'phone' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'phone')}
                ></div>
              </th>
              <th style={{ width: columnWidths.actions, position: 'relative' }}>
                Actions
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'actions')}
                ></div>
              </th>
            </tr>
            <tr className="filter-row">
              <th style={{ width: columnWidths.id }}></th>
              <th>
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={filters.location_name}
                  onChange={(e) => handleFilterChange('location_name', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter address..."
                  value={filters.address}
                  onChange={(e) => handleFilterChange('address', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter city..."
                  value={filters.city_town}
                  onChange={(e) => handleFilterChange('city_town', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter postcode..."
                  value={filters.post_code}
                  onChange={(e) => handleFilterChange('post_code', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter distance..."
                  value={filters.distance}
                  onChange={(e) => handleFilterChange('distance', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter contact..."
                  value={filters.contact_name}
                  onChange={(e) => handleFilterChange('contact_name', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter email..."
                  value={filters.email_address}
                  onChange={(e) => handleFilterChange('email_address', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Filter phone..."
                  value={filters.phone}
                  onChange={(e) => handleFilterChange('phone', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedLocations.length === 0 ? (
              <tr>
                <td colSpan="10" className="no-data">
                  {locations.length === 0 ? 'No locations found' : 'No locations match the current filters'}
                </td>
              </tr>
            ) : (
              filteredAndSortedLocations.map((loc) => (
                <tr key={loc.id}>
                  <td style={{ width: columnWidths.id }}>{loc.id}</td>
                  <td style={{ width: columnWidths.location_name }}>{loc.location_name}</td>
                  <td style={{ width: columnWidths.address }}>{loc.address}</td>
                  <td style={{ width: columnWidths.city_town }}>{loc.city_town}</td>
                  <td style={{ width: columnWidths.post_code }}>{loc.post_code}</td>
                  <td style={{ width: columnWidths.distance }}>{loc.distance ? `${loc.distance} mi` : '-'}</td>
                  <td style={{ width: columnWidths.contact_name }}>{loc.contact_name || '-'}</td>
                  <td style={{ width: columnWidths.email_address }}>
                    {loc.email_address && (Array.isArray(loc.email_address) ? loc.email_address.length > 0 : loc.email_address) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {Array.isArray(loc.email_address) ? (
                          loc.email_address.map((email, idx) => (
                            <a key={idx} href={`mailto:${email}`} className="email-link" style={{ fontSize: '12px' }}>
                              {email}
                            </a>
                          ))
                        ) : (
                          <a href={`mailto:${loc.email_address}`} className="email-link">
                            {loc.email_address}
                          </a>
                        )}
                        <button
                          onClick={() => {
                            const emails = Array.isArray(loc.email_address) ? loc.email_address : [loc.email_address];
                            const mailtoLink = `mailto:${emails.join(',')}`;
                            window.location.href = mailtoLink;
                          }}
                          style={{
                            marginTop: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            background: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                          title="Open Email App"
                        >
                          📧 Open Email App
                        </button>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ width: columnWidths.phone }}>
                    {loc.phone ? (
                      <a href={`tel:${loc.phone.replace(/\s+/g, '')}`} className="phone-link">
                        {loc.phone}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="actions-cell" style={{ width: columnWidths.actions }}>
                    <button onClick={() => handleEdit(loc)} className="edit-btn" title="Edit">
                      <FaEdit />
                    </button>
                    <button onClick={() => handleDelete(loc.id)} className="delete-btn" title="Delete">
                      <FaTrash />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LocationsManager;

