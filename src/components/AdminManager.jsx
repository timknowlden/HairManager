import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FaSave, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './AdminManager.css';

import { API_BASE } from '../config.js';
const PROFILE_API = `${API_BASE}/profile`;

function AdminManager({ onSettingsSaved }) {
  const { getAuthHeaders, user, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [originalPostcode, setOriginalPostcode] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const [importingAppointments, setImportingAppointments] = useState(false);
  const [importingLocations, setImportingLocations] = useState(false);
  const [importingServices, setImportingServices] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState(null);
  const [dataManagementExpanded, setDataManagementExpanded] = useState(false);
  const [exportingAppointments, setExportingAppointments] = useState(false);
  const [exportingLocations, setExportingLocations] = useState(false);
  const [exportingServices, setExportingServices] = useState(false);
  const [deletingAppointments, setDeletingAppointments] = useState(false);
  const [deletingLocations, setDeletingLocations] = useState(false);
  const [deletingServices, setDeletingServices] = useState(false);
  const [resettingAppointmentSequence, setResettingAppointmentSequence] = useState(false);
  const [exportingProfile, setExportingProfile] = useState(false);
  const [importingProfile, setImportingProfile] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingUsername, setUpdatingUsername] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const isSettingContentRef = { current: false };

  // Tiptap editor for default email content
  const defaultContentEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!isSettingContentRef.current) {
        setFormData(prev => ({ ...prev, default_email_content: editor.getHTML() }));
      }
    },
  });

  // Tiptap editor for email signature
  const signatureEditor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!isSettingContentRef.current) {
        setFormData(prev => ({ ...prev, email_signature: editor.getHTML() }));
      }
    },
  });
  const [previousPostcode, setPreviousPostcode] = useState(''); // Track postcode before save
  const [resyncing, setResyncing] = useState(false);
  const [postcodeChangedAfterSave, setPostcodeChangedAfterSave] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    business_name: '',
    business_service_description: '',
    bank_account_name: '',
    sort_code: '',
    account_number: '',
    home_address: '',
    home_postcode: '',
    currency: 'GBP',
    google_maps_api_key: '',
    email_relay_service: 'sendgrid',
    email_relay_api_key: '',
    email_relay_from_email: '',
    email_relay_from_name: '',
    email_relay_bcc_enabled: false,
    email_signature: '',
    default_email_content: ''
  });

  useEffect(() => {
    fetchAdminSettings();
  }, []);

  const formatSortCode = (value) => {
    // Remove all non-numeric characters
    const numbers = value.replace(/\D/g, '');
    // Limit to 6 digits
    const limited = numbers.slice(0, 6);
    // Add dashes after every 2 digits
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 4) {
      return `${limited.slice(0, 2)}-${limited.slice(2)}`;
    } else {
      return `${limited.slice(0, 2)}-${limited.slice(2, 4)}-${limited.slice(4)}`;
    }
  };

  const fetchAdminSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(PROFILE_API, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch profile settings: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error('Server returned non-JSON response. Please check if the server is running and the route exists.');
      }
      const data = await response.json();
      const postcode = data.home_postcode || '';
      setFormData({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        business_name: data.business_name || '',
        business_service_description: data.business_service_description || '',
        bank_account_name: data.bank_account_name || '',
        sort_code: data.sort_code ? formatSortCode(data.sort_code) : '',
        account_number: data.account_number || '',
        home_address: data.home_address || '',
        home_postcode: postcode,
        currency: data.currency || 'GBP',
        google_maps_api_key: data.google_maps_api_key || '',
        email_relay_service: data.email_relay_service || 'sendgrid',
        email_relay_api_key: data.email_relay_api_key || '',
        email_relay_from_email: data.email_relay_from_email || '',
        email_relay_bcc_enabled: data.email_relay_bcc_enabled || false,
        email_relay_from_name: data.email_relay_from_name || '',
        email_signature: data.email_signature || '',
        default_email_content: data.default_email_content || ''
      });
      
      // Update Tiptap editors with loaded content (use setTimeout to ensure editors are ready)
      setTimeout(() => {
        isSettingContentRef.current = true;
        if (defaultContentEditor) {
          defaultContentEditor.commands.setContent(data.default_email_content || '');
        }
        if (signatureEditor) {
          signatureEditor.commands.setContent(data.email_signature || '');
        }
        // Reset flag after a brief delay to allow content to be set
        setTimeout(() => {
          isSettingContentRef.current = false;
        }, 200);
      }, 100);
      
      // Store original postcode to detect changes
      setOriginalPostcode(postcode);
      // Check if resync is needed from database
      if (data.postcode_resync_needed) {
        setPostcodeChangedAfterSave(true);
        // Store previous postcode if available (we'll need to track this differently)
        // For now, we'll show a generic message
      }
      console.log('Original postcode set:', postcode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Format sort code automatically
    if (name === 'sort_code') {
      const formatted = formatSortCode(value);
      setFormData(prev => ({
        ...prev,
        [name]: formatted
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    // Debug: Log postcode changes
    if (name === 'home_postcode') {
      console.log('Postcode changed:', {
        newValue: value,
        originalPostcode: originalPostcode,
        normalizedNew: (value || '').trim().toUpperCase().replace(/\s+/g, ''),
        normalizedOriginal: (originalPostcode || '').trim().toUpperCase().replace(/\s+/g, ''),
        hasChanged: originalPostcode && value && 
                   (value || '').trim().toUpperCase().replace(/\s+/g, '') !== 
                   (originalPostcode || '').trim().toUpperCase().replace(/\s+/g, '')
      });
    }
  };

  const handleDismissWarning = async () => {
    setPostcodeChangedAfterSave(false);
    
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
          setPostcodeChangedAfterSave(false);
        } else {
          console.error('Failed to clear postcode resync flag:', clearResponse.status);
        }
      } catch (err) {
        console.error('Error clearing postcode resync flag:', err);
        // Still clear the warning even if the API call fails
        setPostcodeChangedAfterSave(false);
      }
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setResyncing(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      console.log('Submitting form data:', { ...formData, email_relay_api_key: formData.email_relay_api_key ? '***' : '(empty)' });
      
      const response = await fetch(PROFILE_API, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save profile settings');
      }

      const responseData = await response.json();
      console.log('Save response:', responseData);
      
      setSuccess('Profile settings saved successfully!');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
      // Check if postcode was changed - the backend will set postcode_resync_needed
      console.log('postcode_resync_needed:', responseData.postcode_resync_needed);
      
      // Update original postcode to the saved value
      if (formData.home_postcode) {
        setPreviousPostcode(originalPostcode); // Store the old value before updating
        setOriginalPostcode(formData.home_postcode);
      }
      
      // Check if backend indicates resync is needed (can be 1, true, "1", or any truthy value)
      const needsResync = responseData.postcode_resync_needed === 1 || 
                          responseData.postcode_resync_needed === true || 
                          responseData.postcode_resync_needed === '1' ||
                          (responseData.postcode_resync_needed && responseData.postcode_resync_needed !== 0);
      
      console.log('needsResync:', needsResync);
      
      if (needsResync) {
        console.log('Setting postcodeChangedAfterSave to true');
        setPostcodeChangedAfterSave(true);
      } else {
        console.log('Setting postcodeChangedAfterSave to false');
        setPostcodeChangedAfterSave(false);
      }
      
      // Notify parent component to refresh page title
      if (onSettingsSaved) {
        onSettingsSaved();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="admin-manager">Loading...</div>;
  }

  const handleExportData = async () => {
    setExporting(true);
    setExportMessage(null);
    setError(null);

    try {
      const url = `${API_BASE}/auth/export-data`;
      console.log('Exporting data from:', url);
      const response = await fetch(url, {
        headers: getAuthHeaders()
      });

      // Check if response is OK and is JSON
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        // Try to parse error as JSON, but handle HTML errors
        let errorMessage = 'Failed to export data';
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = `Server error (${response.status}): ${text.substring(0, 100)}`;
          }
        } catch (parseErr) {
          errorMessage = `Server error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      // Check content type to ensure it's JSON
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Unexpected response format. Expected JSON but got: ${contentType || 'unknown'}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `hairmanager-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);

      setExportMessage('Data exported successfully!');
    } catch (err) {
      setError(err.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleImportData = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    setImportMessage(null);
    setError(null);

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData || !importData.data) {
        throw new Error('Invalid import file format');
      }

      const response = await fetch(`${API_BASE}/auth/import-data`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(importData)
      });

      const data = await response.json();

      if (response.ok) {
        const results = data.results;
        const msg = `Imported: ${results.locations.imported} locations, ${results.services.imported} services, ${results.appointments.imported} appointments. ` +
                   (results.profile.updated ? 'Profile updated. ' : '') +
                   (results.locations.skipped > 0 || results.services.skipped > 0 || results.appointments.skipped > 0
                     ? `Skipped: ${results.locations.skipped} locations, ${results.services.skipped} services, ${results.appointments.skipped} appointments.`
                     : '');
        setImportMessage(msg);
        // Refresh the page data
        fetchAdminSettings();
      } else {
        setError(data.error || 'Failed to import data');
      }
    } catch (err) {
      setError(err.message || 'Failed to import data');
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleCsvImport = async (type, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvImportMessage(null);
    setError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      if (type === 'appointments') {
        setImportingAppointments(true);
        // Parse CSV: date, client_name, service, location (required)
        // Optional: type, price, paid, distance, payment_date
        // Supports both comma and tab separators
        const appointments = [];
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('date') || header.includes('client') || header.includes('service');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Detect column order from header if present
        let dateIdx = 0, clientIdx = 1, serviceIdx = 2, locationIdx = 3;
        let typeIdx = -1, priceIdx = -1, paidIdx = -1, distanceIdx = -1, paymentDateIdx = -1;
        
        if (hasHeader) {
          const headerParts = lines[0].toLowerCase().split(line.includes('\t') ? '\t' : ',').map(p => p.trim().replace(/^"|"$/g, ''));
          dateIdx = headerParts.findIndex(h => h.includes('date') && !h.includes('payment'));
          clientIdx = headerParts.findIndex(h => h.includes('client') || h.includes('name'));
          serviceIdx = headerParts.findIndex(h => h.includes('service'));
          locationIdx = headerParts.findIndex(h => h.includes('location'));
          typeIdx = headerParts.findIndex(h => h.includes('type'));
          priceIdx = headerParts.findIndex(h => h.includes('price'));
          paidIdx = headerParts.findIndex(h => h.includes('paid'));
          distanceIdx = headerParts.findIndex(h => h.includes('distance'));
          paymentDateIdx = headerParts.findIndex(h => h.includes('payment') && h.includes('date'));
          
          // Fallback to positional if not found
          if (dateIdx === -1) dateIdx = 0;
          if (clientIdx === -1) clientIdx = 1;
          if (serviceIdx === -1) serviceIdx = 2;
          if (locationIdx === -1) locationIdx = 3;
        }

        for (const line of dataLines) {
          // Try tab first (common from Excel/Google Sheets), then comma
          const separator = line.includes('\t') ? '\t' : ',';
          const parts = line.split(separator).map(p => p.trim().replace(/^"|"$/g, ''));
          
          // Require at least date, client_name, service, location
          if (parts.length > Math.max(dateIdx, clientIdx, serviceIdx, locationIdx) && 
              parts[dateIdx] && parts[clientIdx] && parts[serviceIdx] && parts[locationIdx]) {
            const appointment = {
              date: parts[dateIdx],
              client_name: parts[clientIdx],
              service: parts[serviceIdx],
              location: parts[locationIdx]
            };
            
            // Add optional fields if present
            if (typeIdx >= 0 && parts[typeIdx]) appointment.type = parts[typeIdx];
            if (priceIdx >= 0 && parts[priceIdx]) {
              const priceStr = parts[priceIdx].replace(/£/g, '').replace(/,/g, '');
              appointment.price = parseFloat(priceStr) || null;
            }
            if (paidIdx >= 0 && parts[paidIdx]) {
              const paidVal = parts[paidIdx].toLowerCase();
              appointment.paid = (paidVal === 'paid' || paidVal === '1' || paidVal === 'true' || paidVal === 'yes') ? 1 : 0;
            }
            if (distanceIdx >= 0 && parts[distanceIdx]) {
              const distStr = parts[distanceIdx].replace(/ mi/gi, '').trim();
              appointment.distance = parseFloat(distStr) || null;
            }
            if (paymentDateIdx >= 0 && parts[paymentDateIdx] && parts[paymentDateIdx] !== '-') {
              appointment.payment_date = parts[paymentDateIdx];
            }
            
            appointments.push(appointment);
          }
        }

        if (appointments.length === 0) {
          throw new Error('No valid appointments found in CSV');
        }

        // Group by date and location for batch import, preserving optional fields
        const grouped = {};
        appointments.forEach(apt => {
          const key = `${apt.date}|${apt.location}`;
          if (!grouped[key]) {
            grouped[key] = { date: apt.date, location: apt.location, appointments: [] };
          }
          // Include optional fields if present
          const appointmentData = { 
            client_name: apt.client_name, 
            service: apt.service 
          };
          if (apt.type) appointmentData.type = apt.type;
          if (apt.price !== null && apt.price !== undefined) appointmentData.price = apt.price;
          if (apt.paid !== null && apt.paid !== undefined) appointmentData.paid = apt.paid;
          if (apt.distance !== null && apt.distance !== undefined) appointmentData.distance = apt.distance;
          if (apt.payment_date) appointmentData.payment_date = apt.payment_date;
          grouped[key].appointments.push(appointmentData);
        });

        let imported = 0;
        for (const group of Object.values(grouped)) {
          const response = await fetch(`${API_BASE}/appointments/batch`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: group.date,
              location: group.location,
              appointments: group.appointments
            })
          });

          if (response.ok) {
            const data = await response.json();
            imported += data.appointments?.length || group.appointments.length;
          }
        }

        setCsvImportMessage(`Successfully imported ${imported} appointments`);
      } else if (type === 'locations') {
        setImportingLocations(true);
        // Parse CSV: location_name, address, city_town, post_code, distance, contact_name, email_address (supports both comma and tab separators)
        const locations = [];
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('location') || header.includes('place');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        for (const line of dataLines) {
          // Try tab first (common from Excel/Google Sheets), then comma
          const separator = line.includes('\t') ? '\t' : ',';
          const parts = line.split(separator).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length >= 1 && parts[0]) {
            locations.push({
              location_name: parts[0] || '',
              address: parts[1] || '',
              city_town: parts[2] || '',
              post_code: parts[3] || '',
              distance: parts[4] ? parseFloat(parts[4].replace(/ mi/gi, '')) : null,
              contact_name: parts[5] || '',
              email_address: parts[6] || ''
            });
          }
        }

        if (locations.length === 0) {
          throw new Error('No valid locations found in CSV');
        }

        const response = await fetch(`${API_BASE}/locations/bulk-import`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations })
        });

        const data = await response.json();
        if (response.ok) {
          setCsvImportMessage(`Successfully imported ${data.count} locations`);
        } else {
          throw new Error(data.error || 'Failed to import locations');
        }
      } else if (type === 'services') {
        setImportingServices(true);
        // Parse CSV: service_name, type, price (supports both comma and tab separators)
        const services = [];
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('service') || header.includes('type');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        for (const line of dataLines) {
          // Try tab first (common from Excel/Google Sheets), then comma
          const separator = line.includes('\t') ? '\t' : ',';
          const parts = line.split(separator).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length >= 2 && parts[0]) {
            const priceStr = parts[2]?.replace(/£/g, '').replace(/,/g, '') || '0';
            services.push({
              service_name: parts[0],
              type: parts[1] || 'Hair',
              price: parseFloat(priceStr) || 0
            });
          }
        }

        if (services.length === 0) {
          throw new Error('No valid services found in CSV');
        }

        let imported = 0;
        for (const service of services) {
          const response = await fetch(`${API_BASE}/services`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(service)
          });

          if (response.ok) {
            imported++;
          }
        }

        setCsvImportMessage(`Successfully imported ${imported} services`);
      }
    } catch (err) {
      setError(err.message || `Failed to import ${type}`);
    } finally {
      setImportingAppointments(false);
      setImportingLocations(false);
      setImportingServices(false);
      e.target.value = '';
    }
  };

  const handleExportCsv = async (type) => {
    setError(null);
    try {
      if (type === 'appointments') {
        setExportingAppointments(true);
      } else if (type === 'locations') {
        setExportingLocations(true);
      } else if (type === 'services') {
        setExportingServices(true);
      }

      const response = await fetch(`${API_BASE}/${type}/export/csv`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to export ${type}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setCsvImportMessage(`Successfully exported ${type} to CSV`);
    } catch (err) {
      setError(err.message || `Failed to export ${type}`);
    } finally {
      setExportingAppointments(false);
      setExportingLocations(false);
      setExportingServices(false);
    }
  };

  const handleBulkDelete = async (type) => {
    const typeName = type === 'appointments' ? 'appointments' : type === 'locations' ? 'locations' : 'services';
    const confirmMessage = `Are you sure you want to delete ALL ${typeName}? This action cannot be undone!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError(null);
    try {
      if (type === 'appointments') {
        setDeletingAppointments(true);
      } else if (type === 'locations') {
        setDeletingLocations(true);
      } else if (type === 'services') {
        setDeletingServices(true);
      }

      const response = await fetch(`${API_BASE}/${type}/bulk/all`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to delete ${type}`);
      }

      setCsvImportMessage(data.message || `Successfully deleted all ${typeName}${data.sequenceReset ? ' (ID sequence reset)' : ''}`);
      // Refresh the page to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err.message || `Failed to delete ${type}`);
    } finally {
      setDeletingAppointments(false);
      setDeletingLocations(false);
      setDeletingServices(false);
    }
  };

  const handleResetAppointmentSequence = async () => {
    if (!window.confirm('Reset appointment ID sequence? This will make new appointments start at ID 1. Only works if there are no appointments. Continue?')) {
      return;
    }

    setError(null);
    setResettingAppointmentSequence(true);
    setCsvImportMessage(null);

    try {
      const response = await fetch(`${API_BASE}/appointments/reset-sequence`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset appointment sequence');
      }

      setCsvImportMessage(data.message || 'Appointment ID sequence reset successfully');
    } catch (err) {
      setError(err.message || 'Failed to reset appointment sequence');
    } finally {
      setResettingAppointmentSequence(false);
    }
  };

  const handleExportProfile = async () => {
    setError(null);
    setExportingProfile(true);
    try {
      const response = await fetch(`${PROFILE_API}/export/json`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export profile settings');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `profile-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setCsvImportMessage('Successfully exported profile settings to JSON');
    } catch (err) {
      setError(err.message || 'Failed to export profile settings');
    } finally {
      setExportingProfile(false);
    }
  };

  const handleImportProfile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportingProfile(true);
    setError(null);
    setCsvImportMessage(null);

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      const response = await fetch(`${PROFILE_API}/import/json`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(importData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import profile settings');
      }

      setCsvImportMessage(data.message || 'Successfully imported profile settings');
      // Refresh profile settings
      setTimeout(() => {
        fetchAdminSettings();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to import profile settings');
    } finally {
      setImportingProfile(false);
      e.target.value = '';
    }
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || newUsername.trim() === user?.username) {
      return;
    }

    setUpdatingUsername(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/auth/update-username`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newUsername: newUsername.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Username updated successfully! Please log in again with your new username.');
        setNewUsername('');
        // Update token in localStorage and refresh user
        if (data.token) {
          localStorage.setItem('token', data.token);
          // Reload the page to refresh the auth context
          window.location.reload();
        }
      } else {
        setError(data.error || 'Failed to update username');
      }
    } catch (err) {
      setError(err.message || 'Failed to update username');
    } finally {
      setUpdatingUsername(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setUpdatingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/auth/update-password`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Password updated successfully!');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(data.error || 'Failed to update password');
      }
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="admin-manager">
      <div className="admin-header">
        <h2>Profile Settings</h2>
        <p className="admin-subtitle">Configure your business details and preferences</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      {postcodeChangedAfterSave && (
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
                <strong>⚠️ Warning:</strong> {previousPostcode ? `The postcode has been changed from "${previousPostcode}" to "${formData.home_postcode}".` : 'The postcode has been changed.'} You will need to resync locations to recalculate distances from the new home postcode.
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

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-section">
          <h3>Personal Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Your full name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="e.g., 01234 567890"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your.email@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newUsername">Username</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <input
                  type="text"
                  id="newUsername"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={user?.username || 'Current username'}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleUpdateUsername}
                  disabled={updatingUsername || !newUsername.trim() || newUsername.trim() === user?.username}
                  style={{
                    padding: '0 15px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (updatingUsername || !newUsername.trim() || newUsername.trim() === user?.username) ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    height: '100%',
                    alignSelf: 'stretch',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '50px'
                  }}
                  title="Update username"
                >
                  {updatingUsername ? '...' : <FaSave />}
                </button>
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  minLength={6}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={updatingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                  style={{
                    padding: '0 15px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (updatingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6) ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    height: '100%',
                    alignSelf: 'stretch',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '50px'
                  }}
                  title="Update password"
                >
                  {updatingPassword ? '...' : <FaSave />}
                </button>
              </div>
            </div>
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <div style={{ color: '#dc3545', marginTop: '-15px', marginBottom: '15px', fontSize: '14px' }}>
              Passwords do not match
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="business_name">Business Name</label>
              <input
                type="text"
                id="business_name"
                name="business_name"
                value={formData.business_name}
                onChange={handleInputChange}
                placeholder="e.g., HairManager"
              />
              <p className="field-help">This will appear in the page title at the top of the page</p>
            </div>
            <div className="form-group">
              <label htmlFor="business_service_description">Business Service Description</label>
              <input
                type="text"
                id="business_service_description"
                name="business_service_description"
                value={formData.business_service_description}
                onChange={handleInputChange}
                placeholder="e.g., Mobile Hairdresser and Nail Technician"
              />
              <p className="field-help">This appears on invoices below your business name</p>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Bank Account Details</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="bank_account_name">Bank Account Name</label>
              <input
                type="text"
                id="bank_account_name"
                name="bank_account_name"
                value={formData.bank_account_name}
                onChange={handleInputChange}
                placeholder="Account holder name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="sort_code">Sort Code</label>
              <input
                type="text"
                id="sort_code"
                name="sort_code"
                value={formData.sort_code}
                onChange={handleInputChange}
                placeholder="12-34-56"
                maxLength="8"
                pattern="[0-9]{2}-[0-9]{2}-[0-9]{2}"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="account_number">Account Number</label>
              <input
                type="text"
                id="account_number"
                name="account_number"
                value={formData.account_number}
                onChange={handleInputChange}
                placeholder="12345678"
                maxLength="8"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Home Address</h3>
          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="home_address">Address</label>
              <textarea
                id="home_address"
                name="home_address"
                value={formData.home_address}
                onChange={handleInputChange}
                placeholder="Street address, city, county"
                rows="3"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="home_postcode">Postcode *</label>
              <input
                type="text"
                id="home_postcode"
                name="home_postcode"
                value={formData.home_postcode}
                onChange={handleInputChange}
                placeholder="e.g., NR13 6TD"
                required
              />
              <p className="field-help">Used for calculating distances to locations</p>
            </div>
            <div className="form-group">
              <label htmlFor="currency">Currency</label>
              <select
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
              >
                <option value="GBP">GBP (£)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
              <p className="field-help">Currency symbol for prices</p>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>API Settings</h3>
          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="google_maps_api_key">Google Maps API Key</label>
              <input
                type="password"
                id="google_maps_api_key"
                name="google_maps_api_key"
                value={formData.google_maps_api_key}
                onChange={handleInputChange}
                placeholder="Enter your Google Maps API key"
              />
              <p className="field-help">Optional: For accurate driving distance calculations</p>
            </div>
          </div>
        </div>

        {/* Email Settings - SendGrid Only */}
        <div className="form-section">
          <h3>Email Settings (SendGrid)</h3>
          <p className="field-help" style={{ marginBottom: '20px', fontStyle: 'italic' }}>
            This app uses SendGrid to send invoice emails. SendGrid offers 100 free emails per day and bypasses all Microsoft authentication issues.
          </p>

          <div style={{ 
            backgroundColor: '#e8f5e9', 
            border: '1px solid #4CAF50', 
            borderRadius: '6px', 
            padding: '12px', 
            marginBottom: '20px',
            borderLeft: '4px solid #4CAF50'
          }}>
            <strong style={{ color: '#2e7d32', display: 'block', marginBottom: '5px' }}>
              ✓ Using SendGrid Email Service
            </strong>
            <p style={{ color: '#2e7d32', margin: 0, fontSize: '13px' }}>
              All invoice emails are sent via SendGrid. No SMTP configuration needed!
            </p>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email_relay_service">Email Service</label>
              <select
                id="email_relay_service"
                name="email_relay_service"
                value={formData.email_relay_service}
                onChange={handleInputChange}
                disabled
              >
                <option value="sendgrid">SendGrid (100 free emails/day)</option>
              </select>
              <p className="field-help">
                <a 
                  href="https://signup.sendgrid.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#2196F3', textDecoration: 'underline', fontWeight: '600' }}
                >
                  Sign up for free SendGrid account (100 emails/day free)
                </a>
              </p>
            </div>
                <div className="form-group">
                  <label htmlFor="email_relay_api_key">API Key *</label>
                  <input
                    type="password"
                    id="email_relay_api_key"
                    name="email_relay_api_key"
                    value={formData.email_relay_api_key}
                    onChange={handleInputChange}
                    placeholder="Enter your SendGrid API key"
                  />
                  <p className="field-help">
                    <a 
                      href="https://app.sendgrid.com/settings/api_keys" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#2196F3', textDecoration: 'underline' }}
                    >
                      Get your SendGrid API key
                    </a>
                  </p>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email_relay_from_email">From Email Address *</label>
                  <input
                    type="email"
                    id="email_relay_from_email"
                    name="email_relay_from_email"
                    value={formData.email_relay_from_email}
                    onChange={handleInputChange}
                    placeholder="e.g., invoices@yourdomain.com"
                  />
                  <p className="field-help">
                    <strong>Must be verified in SendGrid!</strong> Go to SendGrid → Settings → Sender Authentication → Create a Sender
                    <br />
                    <a 
                      href="https://app.sendgrid.com/settings/sender_auth/senders" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#2196F3', textDecoration: 'underline' }}
                    >
                      Verify sender in SendGrid
                    </a>
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="email_relay_from_name">From Name (Optional)</label>
                  <input
                    type="text"
                    id="email_relay_from_name"
                    name="email_relay_from_name"
                    value={formData.email_relay_from_name}
                    onChange={handleInputChange}
                    placeholder="e.g., HairManager"
                  />
                  <p className="field-help">Name that will appear as the sender</p>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group full-width">
                  <label htmlFor="email_relay_bcc_enabled" style={{ display: 'block', marginBottom: '8px' }}>
                    Include sender email in BCC/CC for all invoice emails
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      id="email_relay_bcc_enabled"
                      name="email_relay_bcc_enabled"
                      checked={formData.email_relay_bcc_enabled || false}
                      onChange={(e) => handleInputChange({ target: { name: 'email_relay_bcc_enabled', value: e.target.checked } })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', margin: '0' }}
                    />
                    <span style={{ fontSize: '14px', color: '#333' }}>Enable this option</span>
                  </div>
                  <p className="field-help">
                    When enabled, a copy of every invoice email will be sent to your "From Email Address" above
                  </p>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group full-width">
                  <label htmlFor="default_email_content">Default Email Content</label>
                  {defaultContentEditor && (
                    <>
                      <div style={{ 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        padding: '8px',
                        backgroundColor: 'white',
                        minHeight: '150px'
                      }}>
                        <div style={{ 
                          borderBottom: '1px solid #eee', 
                          paddingBottom: '8px', 
                          marginBottom: '8px',
                          display: 'flex',
                          gap: '4px',
                          flexWrap: 'wrap'
                        }}>
                          <button
                            type="button"
                            onClick={() => defaultContentEditor.chain().focus().toggleBold().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: defaultContentEditor.isActive('bold') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            <strong>B</strong>
                          </button>
                          <button
                            type="button"
                            onClick={() => defaultContentEditor.chain().focus().toggleItalic().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: defaultContentEditor.isActive('italic') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            <em>I</em>
                          </button>
                          <button
                            type="button"
                            onClick={() => defaultContentEditor.chain().focus().toggleBulletList().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: defaultContentEditor.isActive('bulletList') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            •
                          </button>
                          <button
                            type="button"
                            onClick={() => defaultContentEditor.chain().focus().toggleOrderedList().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: defaultContentEditor.isActive('orderedList') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            1.
                          </button>
                        </div>
                        <EditorContent editor={defaultContentEditor} style={{ minHeight: '100px' }} />
                      </div>
                    </>
                  )}
                  <p className="field-help">
                    Default message for invoice emails. Use {"{invoiceNumber}"} to include the invoice number. 
                    You can format text, add lists, and paste HTML content.
                  </p>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group full-width">
                  <label htmlFor="email_signature">Email Signature</label>
                  {signatureEditor && (
                    <>
                      <div style={{ 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        padding: '8px',
                        backgroundColor: 'white',
                        minHeight: '200px'
                      }}>
                        <div style={{ 
                          borderBottom: '1px solid #eee', 
                          paddingBottom: '8px', 
                          marginBottom: '8px',
                          display: 'flex',
                          gap: '4px',
                          flexWrap: 'wrap'
                        }}>
                          <button
                            type="button"
                            onClick={() => signatureEditor.chain().focus().toggleBold().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: signatureEditor.isActive('bold') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            <strong>B</strong>
                          </button>
                          <button
                            type="button"
                            onClick={() => signatureEditor.chain().focus().toggleItalic().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: signatureEditor.isActive('italic') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            <em>I</em>
                          </button>
                          <button
                            type="button"
                            onClick={() => signatureEditor.chain().focus().toggleBulletList().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: signatureEditor.isActive('bulletList') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            •
                          </button>
                          <button
                            type="button"
                            onClick={() => signatureEditor.chain().focus().toggleOrderedList().run()}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '3px',
                              backgroundColor: signatureEditor.isActive('orderedList') ? '#e0e0e0' : 'white',
                              cursor: 'pointer'
                            }}
                          >
                            1.
                          </button>
                        </div>
                        <EditorContent editor={signatureEditor} style={{ minHeight: '150px' }} />
                      </div>
                    </>
                  )}
                  <p className="field-help">
                    This will be automatically appended to all invoice emails. 
                    You can format text, add lists, and paste your existing HTML signature.
                  </p>
                </div>
              </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="submit-btn">Save Settings</button>
        </div>

        <div className="form-section" style={{ marginTop: '24px' }}>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: dataManagementExpanded ? '16px' : '0'
            }}
            onClick={() => setDataManagementExpanded(!dataManagementExpanded)}
          >
            <h3 style={{ margin: 0, color: '#333', fontSize: '20px', borderBottom: dataManagementExpanded ? '2px solid #f0f0f0' : 'none', paddingBottom: dataManagementExpanded ? '12px' : '0', width: '100%' }}>
              Data Management
            </h3>
            <span style={{ marginLeft: '10px', color: '#666', fontSize: '14px' }}>
              {dataManagementExpanded ? <FaChevronUp /> : <FaChevronDown />}
            </span>
          </div>
          
          {dataManagementExpanded && (
            <>
              {/* CSV Import/Export/Delete Section */}
              <div style={{ marginBottom: '30px', marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#555', fontWeight: '500' }}>Data Management</h4>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
                  Note: CSV files can include headers (automatically detected and skipped). User IDs and row IDs are automatically assigned.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Appointments */}
                  <div style={{ 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px', 
                    padding: '12px',
                    backgroundColor: '#fafafa'
                  }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#333' }}>Appointments</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <label
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: importingAppointments ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}
                      >
                        {importingAppointments ? 'Importing...' : 'Import CSV'}
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleCsvImport('appointments', e)}
                          disabled={importingAppointments}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleExportCsv('appointments')}
                        disabled={exportingAppointments}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: exportingAppointments ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {exportingAppointments ? 'Exporting...' : 'Export CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkDelete('appointments')}
                        disabled={deletingAppointments}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: deletingAppointments ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {deletingAppointments ? 'Deleting...' : 'Delete All'}
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAppointmentSequence}
                        disabled={resettingAppointmentSequence}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#9C27B0',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: resettingAppointmentSequence ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {resettingAppointmentSequence ? 'Resetting...' : 'Reset IDs'}
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#999' }}>Import format: date, client_name, service, location (required). Optional: type, price, paid, distance, payment_date. Headers auto-detected. Use "Reset IDs" to make new appointments start at ID 1 (only works when no appointments exist).</span>
                  </div>
                  
                  {/* Locations */}
                  <div style={{ 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px', 
                    padding: '12px',
                    backgroundColor: '#fafafa'
                  }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#333' }}>Locations</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <label
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: importingLocations ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}
                      >
                        {importingLocations ? 'Importing...' : 'Import CSV'}
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleCsvImport('locations', e)}
                          disabled={importingLocations}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleExportCsv('locations')}
                        disabled={exportingLocations}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: exportingLocations ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {exportingLocations ? 'Exporting...' : 'Export CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkDelete('locations')}
                        disabled={deletingLocations}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: deletingLocations ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {deletingLocations ? 'Deleting...' : 'Delete All'}
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#999' }}>Import format: location_name, address, city_town, post_code, distance, contact_name, email_address</span>
                  </div>
                  
                  {/* Services */}
                  <div style={{ 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px', 
                    padding: '12px',
                    backgroundColor: '#fafafa'
                  }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#333' }}>Services</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <label
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: importingServices ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}
                      >
                        {importingServices ? 'Importing...' : 'Import CSV'}
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => handleCsvImport('services', e)}
                          disabled={importingServices}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleExportCsv('services')}
                        disabled={exportingServices}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: exportingServices ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {exportingServices ? 'Exporting...' : 'Export CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkDelete('services')}
                        disabled={deletingServices}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: deletingServices ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {deletingServices ? 'Deleting...' : 'Delete All'}
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#999' }}>Import format: service_name, type, price</span>
                  </div>
                  
                  {/* Profile Settings */}
                  <div style={{ 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px', 
                    padding: '12px',
                    backgroundColor: '#fafafa'
                  }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#333' }}>Profile Settings</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <label
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: importingProfile ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}
                      >
                        {importingProfile ? 'Importing...' : 'Import JSON'}
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportProfile}
                          disabled={importingProfile}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleExportProfile}
                        disabled={exportingProfile}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: exportingProfile ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {exportingProfile ? 'Exporting...' : 'Export JSON'}
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#999' }}>Export/Import profile settings (name, email, business info, email API key, signature, default content, etc.). Email password is not included for security.</span>
                  </div>
                </div>
                {csvImportMessage && (
                  <div className="success-message" style={{ marginTop: '10px' }}>
                    {csvImportMessage}
                  </div>
                )}
              </div>

              {/* Backup and Restore Section */}
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#555', fontWeight: '500' }}>Backup & Restore</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exporting}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: exporting ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    {exporting ? 'Exporting...' : 'Backup All Data'}
                  </button>
                  <label
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: importing ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'inline-block'
                    }}
                  >
                    {importing ? 'Importing...' : 'Restore All Data'}
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      disabled={importing}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                {exportMessage && (
                  <div className="success-message" style={{ marginTop: '10px' }}>
                    {exportMessage}
                  </div>
                )}
                {importMessage && (
                  <div className="success-message" style={{ marginTop: '10px' }}>
                    {importMessage}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export default AdminManager;

