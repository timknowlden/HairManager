import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { FaEdit, FaSave, FaTimes, FaWindowClose, FaBan, FaFileInvoice, FaCheck, FaTrash, FaCalculator, FaArrowUp, FaArrowDown, FaSquare } from 'react-icons/fa';
import { FaXmark } from 'react-icons/fa6';
import { useAuth } from '../contexts/AuthContext';
import './AppointmentsList.css';

import { API_BASE } from '../config.js';

function AppointmentsList({ refreshTrigger, newAppointmentIds, onCreateInvoice }) {
  const { getAuthHeaders } = useAuth();
  const tableContainerRef = useRef(null);
  const headerTableRef = useRef(null);
  const [scrollPosition, setScrollPosition] = useState({ top: true, bottom: false });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [selectedForInvoice, setSelectedForInvoice] = useState(new Set());
  const [calculatorMode, setCalculatorMode] = useState(false);
  const [selectedForCalculator, setSelectedForCalculator] = useState(new Set());
  const [currency, setCurrency] = useState('GBP');
  const [editingCell, setEditingCell] = useState(null); // { rowId, column }
  const [editValues, setEditValues] = useState({}); // { rowId: { column: value } }
  
  // Column widths state for resizing
  const [columnWidths, setColumnWidths] = useState({
    id: 50, // Narrower ID column
    date: 110,
    client_name: 150,
    service: 150,
    type: 80,
    location: 150,
    price: 100,
    distance: 100,
    paid: 100,
    payment_date: 120,
    actions: 100
  });

  const [resizingColumn, setResizingColumn] = useState(null);
  
  // Track newly added appointments (state)
  const [newAppointmentIdsSet, setNewAppointmentIdsSet] = useState(new Set());
  
  // Filter states
  const [filters, setFilters] = useState({
    id: '',
    date: '',
    client_name: '',
    service: '',
    type: '',
    location: '',
    price: '',
    distance: '',
    paid: '',
    payment_date: ''
  });

  // Tax year filter: Set of selected tax years (empty set = all)
  const [taxYearMode, setTaxYearMode] = useState(false);
  const [selectedTaxYears, setSelectedTaxYears] = useState(new Set());
  
  // Initialize with most recent tax year selected
  const [taxYearInitialized, setTaxYearInitialized] = useState(false);

  // Sort state - default to ID ascending (1 at top)
  const [sortConfig, setSortConfig] = useState({ column: 'id', direction: 'asc' });

  useEffect(() => {
    fetchAppointments();
    fetchProfileSettings();
    // Clear new appointment IDs on refresh/fetch
    setNewAppointmentIdsSet(new Set());
  }, [refreshTrigger]);

  const fetchProfileSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/profile`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.currency) {
          setCurrency(data.currency);
        }
      }
    } catch (err) {
      console.error('Error fetching profile settings:', err);
    }
  };

  useEffect(() => {
    // When new appointment IDs are passed as prop, mark them as new
    if (newAppointmentIds && Array.isArray(newAppointmentIds) && newAppointmentIds.length > 0) {
      // Only mark the newly added appointments as new (replace, don't merge)
      setNewAppointmentIdsSet(new Set(newAppointmentIds));
    }
  }, [newAppointmentIds]);

  const fetchAppointments = async () => {
    setLoading(true);
    setError(null);
    // Clear new appointment IDs when manually refreshing
    setNewAppointmentIdsSet(new Set());
    try {
      const startTime = performance.now();
      const response = await fetch(`${API_BASE}/appointments`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }
      const data = await response.json();
      const fetchTime = performance.now() - startTime;
      console.log(`[Frontend] Fetched ${data.length || 0} appointments in ${fetchTime.toFixed(2)}ms`);
      
      // Handle both old format (array) and new format (object with appointments array)
      const appointmentsData = Array.isArray(data) ? data : (data.appointments || data);
      setAppointments(appointmentsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaid = async (id, currentPaidStatus) => {
    try {
      const endpoint = currentPaidStatus 
        ? `${API_BASE}/appointments/${id}/unpay`
        : `${API_BASE}/appointments/${id}/pay`;
      
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to update payment status');
      }

      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  // Admin mode - cell editing
  const handleCellClick = (rowId, column) => {
    if (!adminMode) return;
    if (column === 'id' || column === 'paid' || column === 'payment_date') return; // Non-editable columns
    setEditingCell({ rowId, column });
    const appointment = appointments.find(a => a.id === rowId);
    if (appointment) {
      let value = appointment[column];
      
      // Convert date to YYYY-MM-DD format for date input
      if (column === 'date' && value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          value = date.toISOString().split('T')[0];
        }
      }
      
      setEditValues(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [column]: value
        }
      }));
    }
  };

  const handleCellChange = (rowId, column, value) => {
    setEditValues(prev => {
      const newValues = {
        ...prev,
        [rowId]: {
          ...(prev[rowId] || {}),
          [column]: value
        }
      };

      // If service is changed, update type and price from the service
      if (column === 'service') {
        const selectedService = services.find(s => s.service_name === value);
        if (selectedService) {
          newValues[rowId].type = selectedService.type;
          newValues[rowId].price = selectedService.price;
        }
      }

      // Ensure numeric values are stored as numbers
      if (column === 'price' || column === 'distance') {
        if (value !== '' && value !== null && value !== undefined) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            newValues[rowId][column] = numValue;
          }
        }
      }

      return newValues;
    });
  };

  const handleSaveEdit = async (rowId) => {
    const changes = editValues[rowId];
    if (!changes || Object.keys(changes).length === 0) {
      setEditingCell(null);
      return;
    }

    try {
      // Ensure date is in correct format (YYYY-MM-DD)
      const updateData = { ...changes };
      if (updateData.date) {
        // If date is already in YYYY-MM-DD format, use it; otherwise convert
        const dateValue = updateData.date;
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
          // Convert ISO date to YYYY-MM-DD
          updateData.date = dateValue.split('T')[0];
        }
      }

      // Ensure rowId is a number - rowId should already be the appointment ID
      const appointmentId = typeof rowId === 'number' ? rowId : parseInt(rowId, 10);
      if (isNaN(appointmentId)) {
        console.error('Invalid appointment ID:', rowId, typeof rowId);
        throw new Error(`Invalid appointment ID: ${rowId}`);
      }

      // Clean up empty strings in updateData - only include fields that have been changed
      const cleanedData = {};
      Object.keys(updateData).forEach(key => {
        const value = updateData[key];
        // Skip undefined values
        if (value === undefined) {
          return;
        }
        // Handle empty strings
        if (value === '') {
          // For price, empty means 0
          if (key === 'price') {
            cleanedData[key] = 0;
          } else if (key === 'distance') {
            // For distance, empty string means null
            cleanedData[key] = null;
          }
          // For other fields, skip empty strings
        } else {
          // Include the value (including null for distance)
          cleanedData[key] = value;
        }
      });

      console.log('Saving appointment:', appointmentId, cleanedData);

      const response = await fetch(`${API_BASE}/appointments/${appointmentId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedData)
      });

      if (!response.ok) {
        let errorMessage = `Failed to update appointment: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If JSON parsing fails, try to get text
          try {
            const text = await response.text();
            if (text) errorMessage = text;
          } catch (e2) {
            // Use default error message
          }
        }
        throw new Error(errorMessage);
      }

      setEditingCell(null);
      setEditValues(prev => {
        const newValues = { ...prev };
        delete newValues[rowId];
        return newValues;
      });
      fetchAppointments();
    } catch (err) {
      console.error('Error updating appointment:', err);
      setError(err.message);
    }
  };

  const handleCancelEdit = (rowId) => {
    setEditingCell(null);
    setEditValues(prev => {
      const newValues = { ...prev };
      delete newValues[rowId];
      return newValues;
    });
  };

  const handleDeleteAppointment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this appointment? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/appointments/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete appointment');
      }

      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  // Invoice mode
  const handleInvoiceToggle = (id) => {
    setSelectedForInvoice(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAllInvoices = () => {
    if (selectedForInvoice.size === filteredAppointments.length) {
      setSelectedForInvoice(new Set());
    } else {
      setSelectedForInvoice(new Set(filteredAppointments.map(a => a.id)));
    }
  };

  const handleCreateInvoice = () => {
    if (selectedForInvoice.size === 0) {
      setError('Please select at least one appointment for the invoice');
      return;
    }

    const selectedAppointments = filteredAppointments.filter(a => selectedForInvoice.has(a.id));
    
    console.log('Creating invoice with appointments:', selectedAppointments);
    console.log('onCreateInvoice callback:', onCreateInvoice);
    
    // Store in localStorage as backup
    localStorage.setItem('invoiceAppointments', JSON.stringify(selectedAppointments));
    
    // Clear selection and exit invoice mode
    setSelectedForInvoice(new Set());
    setInvoiceMode(false);
    
    // Navigate to invoice view
    if (onCreateInvoice) {
      onCreateInvoice(selectedAppointments);
    } else {
      console.error('onCreateInvoice callback is not defined!');
      setError('Invoice creation failed: callback not available');
    }
  };

  const toggleAdminMode = () => {
    if (adminMode) {
      // Cancel any pending edits
      setEditingCell(null);
      setEditValues({});
    }
    setAdminMode(!adminMode);
    setInvoiceMode(false); // Disable invoice mode when enabling admin
  };

  const toggleInvoiceMode = () => {
    if (invoiceMode) {
      setSelectedForInvoice(new Set());
      setInvoiceMode(false);
    } else {
      // Close other modes when opening invoice
      setCalculatorMode(false);
      setTaxYearMode(false);
      if (calculatorMode) {
        setSelectedForCalculator(new Set());
      }
      setInvoiceMode(true);
    }
    setAdminMode(false); // Disable admin mode when enabling invoice
  };

  const toggleCalculatorMode = () => {
    if (calculatorMode) {
      setSelectedForCalculator(new Set());
      setCalculatorMode(false);
    } else {
      // Close other modes when opening calculator
      setInvoiceMode(false);
      setTaxYearMode(false);
      if (invoiceMode) {
        setSelectedForInvoice(new Set());
      }
      setCalculatorMode(true);
    }
    setAdminMode(false); // Disable admin mode when enabling calculator
  };

  const toggleTaxYearMode = () => {
    if (taxYearMode) {
      setTaxYearMode(false);
    } else {
      // Close other modes when opening tax year
      setInvoiceMode(false);
      setCalculatorMode(false);
      if (invoiceMode) {
        setSelectedForInvoice(new Set());
      }
      if (calculatorMode) {
        setSelectedForCalculator(new Set());
      }
      setTaxYearMode(true);
    }
  };

  // Calculator mode
  const handleCalculatorToggle = (id) => {
    setSelectedForCalculator(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };


  // Memoized date formatter
  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }, []);

  // Get UK tax year from a date (tax year runs from 6 April to 5 April)
  const getTaxYear = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const day = date.getDate();
    
    // If date is on or after 6 April, it's in the tax year starting that year
    // Otherwise, it's in the tax year starting the previous year
    if (month > 4 || (month === 4 && day >= 6)) {
      return `${year}-${(year + 1).toString().slice(-2)}`;
    } else {
      return `${year - 1}-${year.toString().slice(-2)}`;
    }
  };

  // Get available tax years from appointments
  const availableTaxYears = useMemo(() => {
    const taxYears = new Set();
    appointments.forEach(apt => {
      const taxYear = getTaxYear(apt.date);
      if (taxYear) taxYears.add(taxYear);
    });
    return Array.from(taxYears).sort().reverse(); // Most recent first
  }, [appointments]);

  // Initialize selected tax years with the most recent one when appointments are loaded
  useEffect(() => {
    if (!taxYearInitialized && availableTaxYears.length > 0 && appointments.length > 0) {
      const mostRecentTaxYear = availableTaxYears[0]; // First one is most recent
      setSelectedTaxYears(new Set([mostRecentTaxYear]));
      setTaxYearInitialized(true);
    }
  }, [availableTaxYears, appointments.length, taxYearInitialized]);

  // Get current tax year
  const currentTaxYear = useMemo(() => {
    return getTaxYear(new Date().toISOString().split('T')[0]);
  }, []);

  // Get previous tax year
  const previousTaxYear = useMemo(() => {
    if (!currentTaxYear) return null;
    const [startYear] = currentTaxYear.split('-');
    const prevStart = parseInt(startYear) - 1;
    return `${prevStart}-${startYear.slice(-2)}`;
  }, [currentTaxYear]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  // Handle column resizing
  const handleMouseDown = (e, column) => {
    e.preventDefault();
    setResizingColumn(column);
    const startX = e.pageX;
    const startWidth = columnWidths[column];

    const handleMouseMove = (e) => {
      const newWidth = startWidth + (e.pageX - startX);
      if (newWidth > 30) { // Minimum width
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

  // Get unique values for dropdown filters and editing
  const uniqueValues = useMemo(() => {
    return {
      services: [...new Set(appointments.map(a => a.service))].sort(),
      types: [...new Set(appointments.map(a => a.type))].sort(),
      locations: [...new Set(appointments.map(a => a.location))].sort(),
      clients: [...new Set(appointments.map(a => a.client_name))].sort()
    };
  }, [appointments]);

  // Fetch services and locations for editing dropdowns
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);

  // Group services by type for better UX
  const servicesByType = useMemo(() => {
    const grouped = { Hair: [], Nails: [] };
    services.forEach(service => {
      if (grouped[service.type]) {
        grouped[service.type].push(service);
      }
    });
    return grouped;
  }, [services]);

  useEffect(() => {
    if (adminMode) {
      fetch(`${API_BASE}/services`, {
        headers: getAuthHeaders()
      })
        .then(res => res.json())
        .then(data => setServices(data))
        .catch(err => console.error('Error fetching services:', err));
      
      fetch(`${API_BASE}/locations`, {
        headers: getAuthHeaders()
      })
        .then(res => res.json())
        .then(data => setLocations(data))
        .catch(err => console.error('Error fetching locations:', err));
    }
  }, [adminMode]);


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

      // Handle different data types
      if (column === 'id' || column === 'price' || column === 'distance') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (column === 'date' || column === 'payment_date') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else if (column === 'paid') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filter appointments based on filter state
  const filteredAppointments = useMemo(() => {
    let filtered = appointments.filter(apt => {
      // Tax year filter - if tax years are selected, filter by them
      if (selectedTaxYears.size > 0) {
        const aptTaxYear = getTaxYear(apt.date);
        if (!selectedTaxYears.has(aptTaxYear)) return false;
      }

      // ID filter
      if (filters.id && apt.id.toString() !== filters.id) return false;
      
      // Date filter
      if (filters.date) {
        const filterDate = formatDate(apt.date);
        if (!filterDate.toLowerCase().includes(filters.date.toLowerCase())) return false;
      }
      
      // Client name filter
      if (filters.client_name && !apt.client_name.toLowerCase().includes(filters.client_name.toLowerCase())) return false;
      
      // Service filter
      if (filters.service && apt.service !== filters.service) return false;
      
      // Type filter
      if (filters.type && apt.type !== filters.type) return false;
      
      // Location filter
      if (filters.location && apt.location !== filters.location) return false;
      
      // Price filter
      if (filters.price) {
        const priceStr = apt.price.toString();
        if (!priceStr.includes(filters.price)) return false;
      }
      
      // Distance filter
      if (filters.distance) {
        const distanceStr = apt.distance ? apt.distance.toString() : '';
        if (!distanceStr.includes(filters.distance)) return false;
      }
      
      // Paid filter
      if (filters.paid !== '') {
        const isPaid = filters.paid === 'paid';
        if (apt.paid !== (isPaid ? 1 : 0)) return false;
      }
      
      // Payment date filter
      if (filters.payment_date) {
        const paymentDate = apt.payment_date ? formatDate(apt.payment_date) : '';
        if (!paymentDate.toLowerCase().includes(filters.payment_date.toLowerCase())) return false;
      }
      
      return true;
    });

    // Always apply sorting (defaults to date desc if no column selected)
    const sortColumn = sortConfig.column || 'date';
    const sortDirection = sortConfig.direction || 'desc';
    filtered = sortData(filtered, sortColumn, sortDirection);

    return filtered;
  }, [appointments, filters, sortConfig, selectedTaxYears]);

  // Calculate totals for selected appointments (must be after filteredAppointments)
  const calculateTotals = useMemo(() => {
    const selected = filteredAppointments.filter(apt => selectedForCalculator.has(apt.id));
    const total = selected.reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
    const paid = selected
      .filter(apt => apt.paid === 1)
      .reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
    const unpaid = selected
      .filter(apt => apt.paid === 0 || !apt.paid)
      .reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
    return { total, paid, unpaid };
  }, [filteredAppointments, selectedForCalculator]);

  // Throttle scroll handler for better performance
  const scrollTimeoutRef = useRef(null);
  const handleScroll = useCallback((e) => {
    if (scrollTimeoutRef.current) {
      return; // Skip if already scheduled
    }
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      const container = e.target;
      const isAtTop = container.scrollTop === 0;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
      setScrollPosition({ top: isAtTop, bottom: isAtBottom });
      scrollTimeoutRef.current = null;
    });
  }, []);

  // Initialize scroll position on mount and when filtered appointments change
  useEffect(() => {
    if (tableContainerRef.current) {
      const container = tableContainerRef.current;
      const isAtTop = container.scrollTop === 0;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
      setScrollPosition({ top: isAtTop, bottom: isAtBottom });
    }
  }, [filteredAppointments]);

  // Sync header table width with body table (accounting for scrollbar)
  useEffect(() => {
    const syncTableWidths = () => {
      if (tableContainerRef.current && headerTableRef.current) {
        const bodyTable = tableContainerRef.current.querySelector('table');
        const headerTable = headerTableRef.current;
        const bodyContainer = tableContainerRef.current;
        
        if (bodyTable && headerTable && bodyContainer) {
          // Calculate scrollbar width
          const scrollbarWidth = bodyContainer.offsetWidth - bodyContainer.clientWidth;
          
          // Get the main header row (first tr in thead, not the filter row)
          const mainHeaderRow = headerTable.querySelector('thead tr:first-child');
          const bodyFirstRow = bodyTable.querySelector('tbody tr:first-child');
          
          if (mainHeaderRow && bodyFirstRow) {
            const headerCells = mainHeaderRow.querySelectorAll('th');
            const bodyCells = bodyFirstRow.querySelectorAll('td');
            
            // Only sync if we have matching column counts
            if (headerCells.length === bodyCells.length) {
              // Get the body container's client width (excludes scrollbar)
              const bodyContainerClientWidth = bodyContainer.clientWidth;
              
              // Calculate total width needed based on columnWidths state
              // Account for invoice/calculator checkbox column if present
              let totalWidth = 0;
              const columnWidthArray = [];
              
              // Build array of column widths in order
              if (invoiceMode || calculatorMode) {
                columnWidthArray.push(50); // Checkbox column
              }
              columnWidthArray.push(
                columnWidths.id,
                columnWidths.date,
                columnWidths.client_name,
                columnWidths.service,
                columnWidths.type,
                columnWidths.location,
                columnWidths.price,
                columnWidths.distance,
                columnWidths.paid,
                columnWidths.payment_date
              );
              if (adminMode) {
                columnWidthArray.push(columnWidths.actions);
              }
              
              // Calculate total
              columnWidthArray.forEach(w => totalWidth += w);
              
              // If total is less than container width, use container width
              const tableWidth = Math.max(totalWidth, bodyContainerClientWidth);
              
              // Set both tables to the same width
              headerTable.style.width = `${tableWidth}px`;
              headerTable.style.minWidth = `${tableWidth}px`;
              headerTable.style.maxWidth = `${tableWidth}px`;
              bodyTable.style.width = `${tableWidth}px`;
              bodyTable.style.minWidth = `${tableWidth}px`;
              bodyTable.style.maxWidth = `${tableWidth}px`;
              
              // Apply exact widths from columnWidthArray to all cells
              headerCells.forEach((headerCell, index) => {
                if (columnWidthArray[index] !== undefined) {
                  const width = columnWidthArray[index];
                  headerCell.style.width = `${width}px`;
                  headerCell.style.minWidth = `${width}px`;
                  headerCell.style.maxWidth = `${width}px`;
                }
              });
              
              bodyCells.forEach((bodyCell, index) => {
                if (columnWidthArray[index] !== undefined) {
                  const width = columnWidthArray[index];
                  bodyCell.style.width = `${width}px`;
                  bodyCell.style.minWidth = `${width}px`;
                  bodyCell.style.maxWidth = `${width}px`;
                }
              });
              
              // Apply widths to all body rows
              const allBodyRows = bodyTable.querySelectorAll('tbody tr');
              allBodyRows.forEach((row) => {
                const rowCells = row.querySelectorAll('td');
                rowCells.forEach((cell, index) => {
                  if (columnWidthArray[index] !== undefined) {
                    const width = columnWidthArray[index];
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${width}px`;
                    cell.style.maxWidth = `${width}px`;
                  }
                });
              });
              
              // Apply widths to all header rows (including filter row)
              const allHeaderRows = headerTable.querySelectorAll('thead tr');
              allHeaderRows.forEach((row) => {
                const rowCells = row.querySelectorAll('th');
                rowCells.forEach((cell, index) => {
                  if (columnWidthArray[index] !== undefined) {
                    const width = columnWidthArray[index];
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${width}px`;
                    cell.style.maxWidth = `${width}px`;
                  }
                });
              });
              
              // Also sync the filter row's admin mode cell if it exists
              const filterRow = headerTable.querySelector('thead tr:last-child');
              if (filterRow && adminMode) {
                const filterAdminCell = filterRow.querySelector('th:last-child');
                if (filterAdminCell) {
                  const mainHeaderAdminCell = mainHeaderRow.querySelector('th:last-child');
                  if (mainHeaderAdminCell) {
                    const adminWidth = mainHeaderAdminCell.offsetWidth;
                    filterAdminCell.style.width = `${adminWidth}px`;
                    filterAdminCell.style.minWidth = `${adminWidth}px`;
                    filterAdminCell.style.maxWidth = `${adminWidth}px`;
                  }
                }
              }
            }
          }
        }
      }
    };

    // Sync on mount and when admin mode changes
    syncTableWidths();
    
    // Also sync on window resize
    window.addEventListener('resize', syncTableWidths);
    
    // Use multiple delays to ensure DOM is fully updated
    const timeoutId = setTimeout(syncTableWidths, 50);
    const timeoutId2 = setTimeout(syncTableWidths, 150);
    const timeoutId3 = setTimeout(syncTableWidths, 300);
    
    return () => {
      window.removeEventListener('resize', syncTableWidths);
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [adminMode, filteredAppointments.length, columnWidths, invoiceMode, calculatorMode]);

  // Update handleSelectAllCalculator to use filteredAppointments
  const handleSelectAllCalculator = () => {
    if (selectedForCalculator.size === filteredAppointments.length) {
      setSelectedForCalculator(new Set());
    } else {
      setSelectedForCalculator(new Set(filteredAppointments.map(a => a.id)));
    }
  };

  const handleFilterChange = (column, value) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      id: '',
      date: '',
      client_name: '',
      service: '',
      type: '',
      location: '',
      price: '',
      distance: '',
      paid: '',
      payment_date: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(f => f !== '');

  if (loading) {
    return <div className="loading">Loading appointments...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="appointments-list">
      <div className="appointments-header">
        <div className="header-title-section">
          <h2>Appointments</h2>
          <button 
            onClick={toggleTaxYearMode} 
            className={`tax-year-btn ${taxYearMode ? 'active' : ''}`}
            title={taxYearMode ? 'Close tax year filter' : 'Filter by tax year'}
          >
            {taxYearMode ? 'Exit Tax Year' : 'Tax Year'} {selectedTaxYears.size > 0 && `(${selectedTaxYears.size})`}
          </button>
          <button 
            onClick={toggleInvoiceMode} 
            className={`invoice-btn ${invoiceMode ? 'active' : ''}`}
            title="Toggle invoice selection mode"
          >
            <FaFileInvoice /> {invoiceMode ? 'Exit Invoice' : 'Invoice'}
          </button>
          <button 
            onClick={toggleCalculatorMode} 
            className={`calculator-btn ${calculatorMode ? 'active' : ''}`}
            title="Toggle calculator mode"
          >
            <FaCalculator /> {calculatorMode ? 'Exit Calculator' : 'Calculator'}
          </button>
        </div>
        <div className="header-actions">
          <button 
            onClick={toggleAdminMode} 
            className={`admin-btn ${adminMode ? 'active' : ''}`}
            title="Toggle admin editing mode"
          >
            <FaEdit /> {adminMode ? 'Exit Admin' : 'Admin'}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear Filters
            </button>
          )}
          <button onClick={fetchAppointments} className="refresh-btn">
            Refresh
          </button>
        </div>
      </div>

      {invoiceMode && (
        <div className="invoice-controls">
          <div className="invoice-selection-info">
            <button onClick={handleSelectAllInvoices} className="select-all-btn">
              <FaCheck /> {selectedForInvoice.size === filteredAppointments.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="selection-count">
              {selectedForInvoice.size} appointment{selectedForInvoice.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button 
            onClick={handleCreateInvoice} 
            className="create-invoice-btn"
            disabled={selectedForInvoice.size === 0}
          >
            <FaFileInvoice /> Create Invoice ({selectedForInvoice.size})
          </button>
        </div>
      )}

      {calculatorMode && (
        <div className="calculator-controls">
          <div className="calculator-selection-info">
            <button onClick={handleSelectAllCalculator} className="select-all-btn">
              <FaCheck /> {selectedForCalculator.size === filteredAppointments.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="selection-count">
              {selectedForCalculator.size} appointment{selectedForCalculator.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="calculator-totals">
            <div className="calculator-sum">
              <span className="sum-label">Unpaid:</span>
              <span className="sum-amount">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}{calculateTotals.unpaid.toFixed(2)}</span>
            </div>
            <div className="calculator-sum">
              <span className="sum-label">Paid:</span>
              <span className="sum-amount">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}{calculateTotals.paid.toFixed(2)}</span>
            </div>
            <div className="calculator-sum total">
              <span className="sum-label">Total:</span>
              <span className="sum-amount">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}{calculateTotals.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {taxYearMode && (
        <div className="tax-year-controls">
          <div className="tax-year-selection-info">
            <div className="tax-year-checkboxes">
              {availableTaxYears.map(taxYear => (
                <button
                  key={taxYear}
                  type="button"
                  className={`tax-year-checkbox-btn ${selectedTaxYears.has(taxYear) ? 'selected' : ''}`}
                  onClick={() => {
                    const newSet = new Set(selectedTaxYears);
                    if (selectedTaxYears.has(taxYear)) {
                      newSet.delete(taxYear);
                    } else {
                      newSet.add(taxYear);
                    }
                    setSelectedTaxYears(newSet);
                  }}
                >
                  {selectedTaxYears.has(taxYear) ? <FaCheck /> : <FaSquare />} {taxYear}
                </button>
              ))}
            </div>
            <button 
              onClick={() => {
                if (selectedTaxYears.size === availableTaxYears.length) {
                  setSelectedTaxYears(new Set());
                } else {
                  setSelectedTaxYears(new Set(availableTaxYears));
                }
              }}
              className="select-all-tax-years-btn"
            >
              {selectedTaxYears.size === availableTaxYears.length ? <FaCheck /> : <FaSquare />} {selectedTaxYears.size === availableTaxYears.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>
      )}

      {appointments.length === 0 ? (
        <div className="no-appointments">No appointments found</div>
      ) : (
        <div className="table-container">
          <div className="filter-info">
            Showing {filteredAppointments.length} of {appointments.length} appointments
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {(invoiceMode || calculatorMode) && <th className="invoice-select-header">
                    <input
                      type="checkbox"
                      checked={(invoiceMode ? selectedForInvoice.size : selectedForCalculator.size) === filteredAppointments.length && filteredAppointments.length > 0}
                      onChange={invoiceMode ? handleSelectAllInvoices : handleSelectAllCalculator}
                      className="select-all-checkbox"
                    />
                  </th>}
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
                  onClick={() => handleSort('date')}
                  style={{ width: columnWidths.date, position: 'relative' }}
                >
                  Date {sortConfig.column === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'date')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('client_name')}
                  style={{ width: columnWidths.client_name, position: 'relative' }}
                >
                  Client Name {sortConfig.column === 'client_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'client_name')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('service')}
                  style={{ width: columnWidths.service, position: 'relative' }}
                >
                  Service {sortConfig.column === 'service' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'service')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('type')}
                  style={{ width: columnWidths.type, position: 'relative' }}
                >
                  Type {sortConfig.column === 'type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'type')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('location')}
                  style={{ width: columnWidths.location, position: 'relative' }}
                >
                  Location {sortConfig.column === 'location' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'location')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('price')}
                  style={{ width: columnWidths.price, position: 'relative' }}
                >
                  Price {sortConfig.column === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'price')}
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
                  onClick={() => handleSort('paid')}
                  style={{ width: columnWidths.paid, position: 'relative' }}
                >
                  Paid {sortConfig.column === 'paid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'paid')}
                  ></div>
                </th>
                <th 
                  className="sortable resizable" 
                  onClick={() => handleSort('payment_date')}
                  style={{ width: columnWidths.payment_date, position: 'relative' }}
                >
                  Payment Date {sortConfig.column === 'payment_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDown(e, 'payment_date')}
                  ></div>
                </th>
                {adminMode && (
                  <th style={{ width: columnWidths.actions, position: 'relative' }}>
                    Actions
                    <div 
                      className="resize-handle"
                      onMouseDown={(e) => handleMouseDown(e, 'actions')}
                    ></div>
                  </th>
                )}
              </tr>
              <tr className="filter-row">
                {(invoiceMode || calculatorMode) && <th></th>}
                <th>
                  <input
                    type="text"
                    placeholder="Filter ID..."
                    value={filters.id}
                    onChange={(e) => handleFilterChange('id', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Filter date..."
                    value={filters.date}
                    onChange={(e) => handleFilterChange('date', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Filter client..."
                    value={filters.client_name}
                    onChange={(e) => handleFilterChange('client_name', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th>
                  <select
                    value={filters.service}
                    onChange={(e) => handleFilterChange('service', e.target.value)}
                    className="filter-select"
                  >
                    <option value="">All Services</option>
                    {uniqueValues.services.map(service => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                </th>
                <th>
                  <select
                    value={filters.type}
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                    className="filter-select"
                  >
                    <option value="">All Types</option>
                    {uniqueValues.types.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </th>
                <th>
                  <select
                    value={filters.location}
                    onChange={(e) => handleFilterChange('location', e.target.value)}
                    className="filter-select"
                  >
                    <option value="">All Locations</option>
                    {uniqueValues.locations.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Filter price..."
                    value={filters.price}
                    onChange={(e) => handleFilterChange('price', e.target.value)}
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
                  <select
                    value={filters.paid}
                    onChange={(e) => handleFilterChange('paid', e.target.value)}
                    className="filter-select"
                  >
                    <option value="">All</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Filter payment date..."
                    value={filters.payment_date}
                    onChange={(e) => handleFilterChange('payment_date', e.target.value)}
                    className="filter-input"
                  />
                </th>
                {adminMode && <th style={{ width: columnWidths.actions }}></th>}
              </tr>
            </thead>
          </table>
          <div 
            className="tbody-scroll-container" 
            ref={tableContainerRef}
            onScroll={handleScroll}
          >
            <table>
              <tbody>
              {filteredAppointments.map((apt) => {
                const isEditing = editingCell?.rowId === apt.id;
                const hasChanges = editValues[apt.id] && Object.keys(editValues[apt.id]).length > 0;
                const isNew = newAppointmentIdsSet.has(apt.id);
                
                return (
                  <tr key={apt.id} className={`${apt.paid ? 'paid' : 'unpaid'} ${adminMode ? 'admin-mode' : ''} ${invoiceMode && selectedForInvoice.has(apt.id) ? 'selected-for-invoice' : ''} ${calculatorMode && selectedForCalculator.has(apt.id) ? 'selected-for-calculator' : ''} ${isNew ? 'new-appointment' : ''}`}>
                    {(invoiceMode || calculatorMode) && (
                      <td className="invoice-select-cell">
                        <input
                          type="checkbox"
                          checked={invoiceMode ? selectedForInvoice.has(apt.id) : selectedForCalculator.has(apt.id)}
                          onChange={() => invoiceMode ? handleInvoiceToggle(apt.id) : handleCalculatorToggle(apt.id)}
                          className="invoice-checkbox"
                        />
                      </td>
                    )}
                    <td style={{ width: columnWidths.id }} className={`id-cell ${isNew ? 'new-id' : ''}`}>
                      {apt.id}
                    </td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'date')}
                      style={{ width: columnWidths.date }}
                    >
                      {isEditing && editingCell.column === 'date' ? (
                        <input
                          type="date"
                          value={editValues[apt.id]?.date || apt.date}
                          onChange={(e) => handleCellChange(apt.id, 'date', e.target.value)}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        />
                      ) : (
                        formatDate(editValues[apt.id]?.date ?? apt.date)
                      )}
                    </td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'client_name')}
                      style={{ width: columnWidths.client_name }}
                    >
                      {isEditing && editingCell.column === 'client_name' ? (
                        <input
                          type="text"
                          value={editValues[apt.id]?.client_name ?? apt.client_name}
                          onChange={(e) => handleCellChange(apt.id, 'client_name', e.target.value)}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        />
                      ) : (
                        editValues[apt.id]?.client_name ?? apt.client_name
                      )}
                    </td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'service')}
                      style={{ width: columnWidths.service }}
                    >
                      {isEditing && editingCell.column === 'service' ? (
                        <select
                          value={editValues[apt.id]?.service ?? apt.service ?? ''}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleCellChange(apt.id, 'service', e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        >
                          <option value="">Select Service</option>
                          {Object.entries(servicesByType).map(([type, typeServices]) => (
                            typeServices.length > 0 && (
                              <optgroup key={type} label={type}>
                                {typeServices.map((service) => (
                                  <option key={service.id} value={service.service_name}>
                                    {service.service_name} - £{service.price.toFixed(2)}
                                  </option>
                                ))}
                              </optgroup>
                            )
                          ))}
                        </select>
                      ) : (
                        apt.service
                      )}
                    </td>
                    <td style={{ width: columnWidths.type }}>{editValues[apt.id]?.type ?? apt.type}</td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'location')}
                      style={{ width: columnWidths.location }}
                    >
                      {isEditing && editingCell.column === 'location' ? (
                        <select
                          value={editValues[apt.id]?.location ?? apt.location ?? ''}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleCellChange(apt.id, 'location', e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        >
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.location_name}>
                              {loc.location_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        editValues[apt.id]?.location ?? apt.location
                      )}
                    </td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'price')}
                      style={{ width: columnWidths.price }}
                    >
                      {isEditing && editingCell.column === 'price' ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValues[apt.id]?.price ?? apt.price ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              handleCellChange(apt.id, 'price', '');
                            } else {
                              const numVal = parseFloat(val);
                              handleCellChange(apt.id, 'price', isNaN(numVal) ? 0 : numVal);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.stopPropagation();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        />
                      ) : (
                        formatCurrency(editValues[apt.id]?.price ?? apt.price)
                      )}
                    </td>
                    <td 
                      className={adminMode && !isEditing ? 'editable-cell' : ''}
                      onClick={() => handleCellClick(apt.id, 'distance')}
                      style={{ width: columnWidths.distance }}
                    >
                      {isEditing && editingCell.column === 'distance' ? (
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={editValues[apt.id]?.distance ?? apt.distance ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              handleCellChange(apt.id, 'distance', '');
                            } else {
                              const numVal = parseFloat(val);
                              handleCellChange(apt.id, 'distance', isNaN(numVal) ? null : numVal);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.stopPropagation();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {}}
                          autoFocus
                          className="cell-input"
                        />
                      ) : (
                        (editValues[apt.id]?.distance ?? apt.distance) ? `${editValues[apt.id]?.distance ?? apt.distance} mi` : '-'
                      )}
                    </td>
                    <td style={{ width: columnWidths.paid }}>
                      <button
                        className={`paid-toggle ${apt.paid ? 'paid' : 'unpaid'}`}
                        onClick={() => handleTogglePaid(apt.id, apt.paid)}
                      >
                        {apt.paid ? '✓ Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td style={{ width: columnWidths.payment_date }}>{apt.payment_date ? formatDate(apt.payment_date) : '-'}</td>
                    {adminMode && (
                      <td className="admin-actions" style={{ width: columnWidths.actions }}>
                        {hasChanges && (
                          <>
                            <button
                              onClick={() => handleSaveEdit(apt.id)}
                              className="admin-save-btn"
                              title="Save changes"
                            >
                              <FaSave />
                            </button>
                            <button
                              onClick={() => handleCancelEdit(apt.id)}
                              className="admin-cancel-btn"
                              title="Cancel changes"
                            >
                              <FaTimes />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteAppointment(apt.id)}
                          className="admin-delete-btn"
                          title="Delete appointment"
                        >
                          <FaTrash />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              </tbody>
            </table>
            {filteredAppointments.length === 0 && appointments.length > 0 && (
              <div className="no-results">No appointments match the current filters</div>
            )}
          </div>
          {/* Scroll to top/bottom buttons */}
          <div className="scroll-buttons">
            <button
              className="scroll-btn scroll-to-top"
              onClick={() => {
                if (tableContainerRef.current) {
                  tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              title="Scroll to top"
            >
              <FaArrowUp />
            </button>
            <button
              className="scroll-btn scroll-to-bottom"
              onClick={() => {
                if (tableContainerRef.current) {
                  tableContainerRef.current.scrollTo({ top: tableContainerRef.current.scrollHeight, behavior: 'smooth' });
                }
              }}
              title="Scroll to bottom"
            >
              <FaArrowDown />
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppointmentsList;

