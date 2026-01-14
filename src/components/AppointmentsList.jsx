import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { FaWrench, FaSave, FaTimes, FaWindowClose, FaBan, FaFileInvoice, FaCheck, FaTrash, FaCalculator, FaArrowUp, FaArrowDown, FaSquare, FaSync, FaCalendarAlt, FaChevronLeft, FaChevronRight, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
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
  const [selectedForInvoice, setSelectedForInvoice] = useState([]); // Array to preserve order
  const [calculatorMode, setCalculatorMode] = useState(false);
  const [selectedForCalculator, setSelectedForCalculator] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null); // Track last selected index for shift-click
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

  // Date filter mode: 'day', 'month', 'year', or '' (text search)
  const [dateFilterMode, setDateFilterMode] = useState('day'); // Default to day mode
  const [dateFilterDay, setDateFilterDay] = useState('');
  const [dateFilterMonth, setDateFilterMonth] = useState('');
  const [dateFilterYear, setDateFilterYear] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef(null);
  
  // Calendar view state (for day picker grid)
  const [calendarView, setCalendarView] = useState(() => {
    const today = new Date();
    return {
      month: today.getMonth(),
      year: today.getFullYear()
    };
  });
  
  // Month picker year state
  const [monthPickerYear, setMonthPickerYear] = useState(() => {
    const today = new Date();
    return today.getFullYear();
  });
  
  // Year picker decade state (for year grid)
  const [yearPickerDecade, setYearPickerDecade] = useState(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    // Round down to nearest decade (e.g., 2024 -> 2020)
    return Math.floor(currentYear / 10) * 10;
  });
  
  // Update calendar view when dateFilterDay changes
  useEffect(() => {
    if (dateFilterDay) {
      const selectedDate = new Date(dateFilterDay);
      setCalendarView({
        month: selectedDate.getMonth(),
        year: selectedDate.getFullYear()
      });
    }
  }, [dateFilterDay]);

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

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        // Only close if clicking outside the entire container (button + popup)
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      // Use click instead of mousedown to avoid conflicts with button clicks
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showDatePicker]);

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

  const handleTogglePaid = async (id, currentPaidStatus, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
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

      // Update local state instead of refetching to prevent page movement
      setAppointments(prev => prev.map(apt => {
        if (apt.id === id) {
          return {
            ...apt,
            paid: currentPaidStatus ? 0 : 1,
            payment_date: currentPaidStatus ? null : new Date().toISOString()
          };
        }
        return apt;
      }));
    } catch (err) {
      setError(err.message);
      // If update fails, refetch to ensure consistency
      fetchAppointments();
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
  const handleInvoiceToggle = (id, event) => {
    const currentIndex = filteredAppointments.findIndex(apt => apt.id === id);
    
    // Get shiftKey from event (check both synthetic and native event)
    const shiftKey = event?.shiftKey || event?.nativeEvent?.shiftKey || false;
    
    // Validate lastSelectedIndex is still within bounds
    const validLastIndex = lastSelectedIndex !== null && 
                           lastSelectedIndex >= 0 && 
                           lastSelectedIndex < filteredAppointments.length
                           ? lastSelectedIndex 
                           : null;
    
    // Check if shift key is pressed and we have a valid last selected index
    if (shiftKey && validLastIndex !== null && validLastIndex !== currentIndex && currentIndex !== -1) {
      // Select range from lastSelectedIndex to currentIndex
      const startIndex = Math.min(validLastIndex, currentIndex);
      const endIndex = Math.max(validLastIndex, currentIndex);
      const rangeIds = filteredAppointments
        .slice(startIndex, endIndex + 1)
        .map(apt => apt.id);
      
      setSelectedForInvoice(prev => {
        const newSelection = [...prev];
        const isCurrentlySelected = prev.includes(id);
        
        // If the clicked item is selected, deselect the range; otherwise, select it
        if (isCurrentlySelected) {
          // Remove all items in range
          return newSelection.filter(item => !rangeIds.includes(item));
        } else {
          // Add all items in range (avoid duplicates)
          rangeIds.forEach(rangeId => {
            if (!newSelection.includes(rangeId)) {
              newSelection.push(rangeId);
            }
          });
          return newSelection;
        }
      });
      
      // Update last selected index to the current one
      setLastSelectedIndex(currentIndex);
    } else {
      // Normal toggle behavior
      setSelectedForInvoice(prev => {
        const index = prev.indexOf(id);
        if (index !== -1) {
          // Remove from array (preserves order of remaining items)
          return prev.filter(item => item !== id);
        } else {
          // Add to end of array (preserves selection order)
          return [...prev, id];
        }
      });
      
      // Update last selected index only if the item was found
      if (currentIndex !== -1) {
        setLastSelectedIndex(currentIndex);
      }
    }
  };

  const handleSelectAllInvoices = () => {
    if (selectedForInvoice.length === filteredAppointments.length) {
      setSelectedForInvoice([]);
      setLastSelectedIndex(null);
    } else {
      setSelectedForInvoice(filteredAppointments.map(a => a.id));
      // Set last selected index to the last item when selecting all
      setLastSelectedIndex(filteredAppointments.length - 1);
    }
  };

  const handleCreateInvoice = () => {
    if (selectedForInvoice.length === 0) {
      setError('Please select at least one appointment for the invoice');
      return;
    }

    // Preserve selection order by mapping selected IDs to appointments in order
    const selectedAppointments = selectedForInvoice
      .map(id => filteredAppointments.find(a => a.id === id))
      .filter(Boolean); // Remove any undefined entries
    
    console.log('Creating invoice with appointments:', selectedAppointments);
    console.log('onCreateInvoice callback:', onCreateInvoice);
    
    // Store in localStorage as backup
    localStorage.setItem('invoiceAppointments', JSON.stringify(selectedAppointments));
    
    // Clear selection and exit invoice mode
    setSelectedForInvoice([]);
    setLastSelectedIndex(null);
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
      setSelectedForInvoice([]);
      setLastSelectedIndex(null);
      setInvoiceMode(false);
    } else {
      // Close other modes when opening invoice
      setCalculatorMode(false);
      setTaxYearMode(false);
      if (calculatorMode) {
        setSelectedForCalculator(new Set());
        setLastSelectedIndex(null);
      }
      setLastSelectedIndex(null); // Reset when entering invoice mode
      setInvoiceMode(true);
    }
    setAdminMode(false); // Disable admin mode when enabling invoice
  };

  const toggleCalculatorMode = () => {
    if (calculatorMode) {
      setSelectedForCalculator(new Set());
      setLastSelectedIndex(null);
      setCalculatorMode(false);
    } else {
      // Close other modes when opening calculator
      setInvoiceMode(false);
      setTaxYearMode(false);
      if (invoiceMode) {
        setSelectedForInvoice([]);
        setLastSelectedIndex(null);
      }
      setLastSelectedIndex(null); // Reset when entering calculator mode
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
        setSelectedForInvoice([]);
        setLastSelectedIndex(null);
      }
      if (calculatorMode) {
        setSelectedForCalculator(new Set());
        setLastSelectedIndex(null);
      }
      setTaxYearMode(true);
    }
  };

  // Calculator mode
  const handleCalculatorToggle = (id, event) => {
    const currentIndex = filteredAppointments.findIndex(apt => apt.id === id);
    
    // Get shiftKey from event (check both synthetic and native event)
    const shiftKey = event?.shiftKey || event?.nativeEvent?.shiftKey || false;
    
    // Validate lastSelectedIndex is still within bounds
    const validLastIndex = lastSelectedIndex !== null && 
                           lastSelectedIndex >= 0 && 
                           lastSelectedIndex < filteredAppointments.length
                           ? lastSelectedIndex 
                           : null;
    
    // Check if shift key is pressed and we have a valid last selected index
    if (shiftKey && validLastIndex !== null && validLastIndex !== currentIndex && currentIndex !== -1) {
      // Select range from lastSelectedIndex to currentIndex
      const startIndex = Math.min(validLastIndex, currentIndex);
      const endIndex = Math.max(validLastIndex, currentIndex);
      const rangeIds = filteredAppointments
        .slice(startIndex, endIndex + 1)
        .map(apt => apt.id);
      
      setSelectedForCalculator(prev => {
        const newSet = new Set(prev);
        const isCurrentlySelected = prev.has(id);
        
        // If the clicked item is selected, deselect the range; otherwise, select it
        if (isCurrentlySelected) {
          // Remove all items in range
          rangeIds.forEach(rangeId => newSet.delete(rangeId));
        } else {
          // Add all items in range
          rangeIds.forEach(rangeId => newSet.add(rangeId));
        }
        return newSet;
      });
      
      // Update last selected index to the current one
      setLastSelectedIndex(currentIndex);
    } else {
      // Normal toggle behavior
      setSelectedForCalculator(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
      
      // Update last selected index only if the item was found
      if (currentIndex !== -1) {
        setLastSelectedIndex(currentIndex);
      }
    }
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

  // Calendar helper functions
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarDays = (month, year) => {
    const daysInMonth = getDaysInMonth(month, year);
    const firstDay = getFirstDayOfMonth(month, year);
    const days = [];
    
    // Adjust for Monday as first day (0 = Sunday, 1 = Monday, etc.)
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    
    // Previous month's trailing days
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevMonth, prevYear);
    
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false
      });
    }
    
    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        month,
        year,
        isCurrentMonth: true
      });
    }
    
    // Next month's leading days
    const daysNeeded = 42 - days.length; // 6 weeks * 7 days
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    
    for (let day = 1; day <= daysNeeded; day++) {
      days.push({
        day,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const formatMonthYear = (month, year) => {
    const date = new Date(year, month);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  const isToday = (day, month, year) => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const isSelected = (day, month, year) => {
    if (!dateFilterDay) return false;
    const selected = new Date(dateFilterDay);
    return day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
  };

  const handleDaySelect = (day, month, year) => {
    const date = new Date(year, month, day);
    const dateString = date.toISOString().split('T')[0];
    setDateFilterDay(dateString);
    setDateFilterMode('day');
    setDateFilterMonth('');
    setDateFilterYear('');
    setFilters(prev => ({ ...prev, date: '' }));
    // Update calendar view to show selected month
    setCalendarView({ month, year });
  };

  const navigateMonth = (direction) => {
    setCalendarView(prev => {
      let newMonth = prev.month + direction;
      let newYear = prev.year;
      
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      } else if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
      
      return { month: newMonth, year: newYear };
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCalendarView({
      month: today.getMonth(),
      year: today.getFullYear()
    });
    handleDaySelect(today.getDate(), today.getMonth(), today.getFullYear());
  };

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
      
      // Date filter - handle different modes
      if (dateFilterMode === 'day' && dateFilterDay) {
        const aptDate = new Date(apt.date);
        const filterDate = new Date(dateFilterDay);
        if (aptDate.toDateString() !== filterDate.toDateString()) return false;
      } else if (dateFilterMode === 'month' && dateFilterMonth) {
        const aptDate = new Date(apt.date);
        const [year, month] = dateFilterMonth.split('-');
        if (aptDate.getFullYear() !== parseInt(year) || aptDate.getMonth() + 1 !== parseInt(month)) return false;
      } else if (dateFilterMode === 'year' && dateFilterYear) {
        const aptDate = new Date(apt.date);
        if (aptDate.getFullYear() !== parseInt(dateFilterYear)) return false;
      } else if (filters.date) {
        // Text search when no mode is selected
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
  }, [appointments, filters, sortConfig, selectedTaxYears, dateFilterMode, dateFilterDay, dateFilterMonth, dateFilterYear]);

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
          // Get the table-wrapper element (parent of headerTable)
          const tableWrapper = headerTable.parentElement;
          
          if (!tableWrapper) return;
          
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
              // Get the table-wrapper's width (this is the actual available width)
              const tableWrapperWidth = tableWrapper.offsetWidth;
              
              // Calculate total width needed based on columnWidths state
              // Account for invoice/calculator checkbox column if present
              let totalWidth = 0;
              const columnWidthArray = [];
              
              // Build array of column widths in order
              if (invoiceMode || calculatorMode) {
                columnWidthArray.push(60); // Checkbox column (increased for selection number)
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
              
              // Set table width to table-wrapper width to fill available space
              const tableWidth = tableWrapperWidth;
              
              // Set both tables to container width
              headerTable.style.width = `${tableWidth}px`;
              headerTable.style.minWidth = `${tableWidth}px`;
              headerTable.style.maxWidth = `${tableWidth}px`;
              bodyTable.style.width = `${tableWidth}px`;
              bodyTable.style.minWidth = `${tableWidth}px`;
              bodyTable.style.maxWidth = `${tableWidth}px`;
              
              // Calculate remaining space
              const remainingSpace = tableWidth - totalWidth;
              
              // Find indices of Client Name, Service, and Location columns
              // These are the columns that should expand to fill remaining space
              let clientNameIndex = -1;
              let serviceIndex = -1;
              let locationIndex = -1;
              
              // Account for checkbox column offset if present
              const checkboxOffset = (invoiceMode || calculatorMode) ? 1 : 0;
              clientNameIndex = 2 + checkboxOffset; // ID, Date, then Client Name
              serviceIndex = 3 + checkboxOffset;    // ID, Date, Client Name, then Service
              locationIndex = 5 + checkboxOffset;   // ID, Date, Client Name, Service, Type, then Location
              
              // Distribute remaining space equally among the three columns
              const spacePerColumn = remainingSpace > 0 ? Math.floor(remainingSpace / 3) : 0;
              
              // Apply exact widths from columnWidthArray to all cells
              // Client Name, Service, and Location get additional space
              headerCells.forEach((headerCell, index) => {
                if (columnWidthArray[index] !== undefined) {
                  let width = columnWidthArray[index];
                  // Add space to Client Name, Service, or Location columns
                  if (index === clientNameIndex || index === serviceIndex || index === locationIndex) {
                    width += spacePerColumn;
                  }
                  headerCell.style.width = `${width}px`;
                  headerCell.style.minWidth = `${columnWidthArray[index]}px`; // Min is the original width
                  headerCell.style.maxWidth = `${width}px`;
                }
              });
              
              bodyCells.forEach((bodyCell, index) => {
                if (columnWidthArray[index] !== undefined) {
                  let width = columnWidthArray[index];
                  // Add space to Client Name, Service, or Location columns
                  if (index === clientNameIndex || index === serviceIndex || index === locationIndex) {
                    width += spacePerColumn;
                  }
                  bodyCell.style.width = `${width}px`;
                  bodyCell.style.minWidth = `${columnWidthArray[index]}px`; // Min is the original width
                  bodyCell.style.maxWidth = `${width}px`;
                }
              });
              
              // Apply widths to all body rows
              const allBodyRows = bodyTable.querySelectorAll('tbody tr');
              allBodyRows.forEach((row) => {
                const rowCells = row.querySelectorAll('td');
                rowCells.forEach((cell, index) => {
                  if (columnWidthArray[index] !== undefined) {
                    let width = columnWidthArray[index];
                    // Add space to Client Name, Service, or Location columns
                    if (index === clientNameIndex || index === serviceIndex || index === locationIndex) {
                      width += spacePerColumn;
                    }
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${columnWidthArray[index]}px`; // Min is the original width
                    cell.style.maxWidth = `${width}px`;
                  }
                });
              });
              
              // Apply widths to all header rows (including filter row)
              const allHeaderRows = headerTable.querySelectorAll('thead tr');
              allHeaderRows.forEach((row, rowIndex) => {
                const rowCells = row.querySelectorAll('th');
                rowCells.forEach((cell, index) => {
                  if (columnWidthArray[index] !== undefined) {
                    let width = columnWidthArray[index];
                    // Add space to Client Name, Service, or Location columns
                    if (index === clientNameIndex || index === serviceIndex || index === locationIndex) {
                      width += spacePerColumn;
                    }
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${columnWidthArray[index]}px`; // Min is the original width
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
      setLastSelectedIndex(null);
    } else {
      const allIds = new Set(filteredAppointments.map(a => a.id));
      setSelectedForCalculator(allIds);
      // Set last selected index to the last item when selecting all
      setLastSelectedIndex(filteredAppointments.length - 1);
    }
  };

  // Mark selected appointments as paid
  const handleMarkSelectedAsPaid = async () => {
    if (selectedForCalculator.size === 0) {
      setError('Please select at least one appointment');
      return;
    }

    const count = selectedForCalculator.size;
    const confirmMessage = `Are you sure you want to mark ${count} appointment${count !== 1 ? 's' : ''} as paid?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedIds = Array.from(selectedForCalculator);
      const promises = selectedIds.map(id => 
        fetch(`${API_BASE}/appointments/${id}/pay`, {
          method: 'PATCH',
          headers: getAuthHeaders()
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.ok);
      
      if (failed.length > 0) {
        const failedCount = failed.length;
        setError(`Failed to mark ${failedCount} appointment${failedCount !== 1 ? 's' : ''} as paid`);
        // If some failed, refetch to ensure consistency
        if (successful.length > 0) {
          fetchAppointments();
        }
      } else {
        // Update local state instead of refetching to prevent page movement
        const now = new Date().toISOString();
        setAppointments(prev => prev.map(apt => {
          if (selectedForCalculator.has(apt.id)) {
            return {
              ...apt,
              paid: 1,
              payment_date: now
            };
          }
          return apt;
        }));
        // Clear selection after successful update
        setSelectedForCalculator(new Set());
        setLastSelectedIndex(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to mark appointments as paid');
    } finally {
      setLoading(false);
    }
  };

  // Mark selected appointments as unpaid
  const handleMarkSelectedAsUnpaid = async () => {
    if (selectedForCalculator.size === 0) {
      setError('Please select at least one appointment');
      return;
    }

    const count = selectedForCalculator.size;
    const confirmMessage = `Are you sure you want to mark ${count} appointment${count !== 1 ? 's' : ''} as unpaid?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedIds = Array.from(selectedForCalculator);
      const promises = selectedIds.map(id => 
        fetch(`${API_BASE}/appointments/${id}/unpay`, {
          method: 'PATCH',
          headers: getAuthHeaders()
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.ok);
      
      if (failed.length > 0) {
        const failedCount = failed.length;
        setError(`Failed to mark ${failedCount} appointment${failedCount !== 1 ? 's' : ''} as unpaid`);
        // If some failed, refetch to ensure consistency
        if (successful.length > 0) {
          fetchAppointments();
        }
      } else {
        // Update local state instead of refetching to prevent page movement
        setAppointments(prev => prev.map(apt => {
          if (selectedForCalculator.has(apt.id)) {
            return {
              ...apt,
              paid: 0,
              payment_date: null
            };
          }
          return apt;
        }));
        // Clear selection after successful update
        setSelectedForCalculator(new Set());
        setLastSelectedIndex(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to mark appointments as unpaid');
    } finally {
      setLoading(false);
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
    setDateFilterMode('');
    setDateFilterDay('');
    setDateFilterMonth('');
    setDateFilterYear('');
  };

  const hasActiveFilters = Object.values(filters).some(f => f !== '') || 
    (dateFilterMode === 'day' && dateFilterDay) ||
    (dateFilterMode === 'month' && dateFilterMonth) ||
    (dateFilterMode === 'year' && dateFilterYear);

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
          <div className="title-group">
            <h2>Appointments</h2>
            <p className="appointment-count-text">Showing {filteredAppointments.length} of {appointments.length} appointments</p>
          </div>
        </div>
        <div className="header-actions">
          <button 
            onClick={toggleInvoiceMode} 
            className={`invoice-btn ${invoiceMode ? 'active' : ''}`}
            title="Toggle invoice selection mode"
          >
            <FaFileInvoice /> <span className="invoice-btn-text">{invoiceMode ? 'Exit Invoice' : 'Invoice'}</span>
          </button>
          <button 
            onClick={toggleCalculatorMode} 
            className={`calculator-btn ${calculatorMode ? 'active' : ''}`}
            title="Toggle calculator mode"
          >
            <FaCalculator /> <span className="calculator-btn-text">{calculatorMode ? 'Exit Calculator' : 'Calculator'}</span>
          </button>
          <button 
            onClick={toggleAdminMode} 
            className={`admin-btn ${adminMode ? 'active' : ''}`}
            title="Toggle admin editing mode"
          >
            <FaWrench /> <span className="admin-btn-text">{adminMode ? 'Exit Admin' : 'Admin'}</span>
          </button>
          <button onClick={fetchAppointments} className="refresh-btn" title="Refresh">
            <FaSync />
          </button>
          <div className="nav-divider"></div>
          <button 
            onClick={toggleTaxYearMode} 
            className={`tax-year-btn ${taxYearMode ? 'active' : ''}`}
            title={taxYearMode ? 'Close tax year filter' : 'Filter by tax year'}
          >
            <FaCalendarAlt /> <span className="tax-year-btn-text">{taxYearMode ? 'Exit Tax Year' : 'Tax Year'}</span> {selectedTaxYears.size > 0 && <span className="tax-year-count">({selectedTaxYears.size})</span>}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="clear-filters-btn">
              <FaTimes /> <span className="clear-filters-text">Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {invoiceMode && (
        <div className="invoice-controls">
          <div className="invoice-selection-info">
            <button onClick={handleSelectAllInvoices} className="select-all-btn">
              <FaCheck /> {selectedForInvoice.length === filteredAppointments.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="selection-count">
              {selectedForInvoice.length} appointment{selectedForInvoice.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button 
            onClick={handleCreateInvoice} 
            className="create-invoice-btn"
            disabled={selectedForInvoice.length === 0}
          >
            <FaFileInvoice /> Create Invoice ({selectedForInvoice.length})
          </button>
        </div>
      )}

      {calculatorMode && (
        <div className="calculator-controls">
          <div className="calculator-controls-top">
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
          {selectedForCalculator.size > 0 && (
            <div className="calculator-actions">
              <button
                onClick={handleMarkSelectedAsPaid}
                className="mark-paid-btn"
                disabled={loading}
                title="Mark selected appointments as paid"
              >
                <FaCheckCircle /> Mark as Paid ({selectedForCalculator.size})
              </button>
              <button
                onClick={handleMarkSelectedAsUnpaid}
                className="mark-unpaid-btn"
                disabled={loading}
                title="Mark selected appointments as unpaid"
              >
                <FaTimesCircle /> Mark as Unpaid ({selectedForCalculator.size})
              </button>
            </div>
          )}
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
          <div className="table-wrapper">
            <table ref={headerTableRef}>
              <thead>
                <tr>
                  {(invoiceMode || calculatorMode) && <th className="invoice-select-header">
                    <input
                      type="checkbox"
                      checked={(invoiceMode ? selectedForInvoice.length : selectedForCalculator.size) === filteredAppointments.length && filteredAppointments.length > 0}
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
                    className="sortable resizable column-service" 
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
                    className="sortable resizable column-type" 
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
                  className="sortable resizable column-location" 
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
                  className="sortable resizable column-price" 
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
                    className="sortable resizable column-distance" 
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
                    className="sortable resizable column-payment-date" 
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
                  <div className="date-filter-container" ref={datePickerRef}>
                    <button
                      type="button"
                      className="date-filter-mode-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Always set to day mode if not already set when opening
                        if (dateFilterMode === '' || dateFilterMode === undefined) {
                          setDateFilterMode('day');
                          // Set calendar view to current month/year
                          const today = new Date();
                          setCalendarView({
                            month: today.getMonth(),
                            year: today.getFullYear()
                          });
                        }
                        // Always open the picker when button is clicked
                        setShowDatePicker(true);
                      }}
                      title="Open date picker"
                    >
                      <FaCalendarAlt /> <span className="date-filter-btn-text">Date</span>
                    </button>
                    {showDatePicker && (
                      <div className="date-picker-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="date-picker-header">
                          <span>Select Date</span>
                          <button
                            type="button"
                            className="date-picker-close"
                            onClick={() => setShowDatePicker(false)}
                            title="Close"
                          >
                            <FaTimes />
                          </button>
                        </div>
                        <div className="date-picker-mode-switcher">
                          <button
                            type="button"
                            className={`date-picker-mode-switch-btn ${dateFilterMode === 'day' ? 'active' : ''}`}
                            onClick={() => {
                              setDateFilterMode('day');
                              setDateFilterMonth('');
                              setDateFilterYear('');
                              setFilters(prev => ({ ...prev, date: '' }));
                              // Update calendar view if a date is already selected
                              if (dateFilterDay) {
                                const selectedDate = new Date(dateFilterDay);
                                setCalendarView({
                                  month: selectedDate.getMonth(),
                                  year: selectedDate.getFullYear()
                                });
                              }
                            }}
                          >
                            Day
                          </button>
                          <button
                            type="button"
                            className={`date-picker-mode-switch-btn ${dateFilterMode === 'month' ? 'active' : ''}`}
                            onClick={() => {
                              setDateFilterMode('month');
                              setDateFilterDay('');
                              setDateFilterYear('');
                              setFilters(prev => ({ ...prev, date: '' }));
                              // Set month picker year from selected month or current year
                              if (dateFilterMonth) {
                                const [year] = dateFilterMonth.split('-');
                                setMonthPickerYear(parseInt(year));
                              } else {
                                const today = new Date();
                                setMonthPickerYear(today.getFullYear());
                              }
                            }}
                          >
                            Month
                          </button>
                          <button
                            type="button"
                            className={`date-picker-mode-switch-btn ${dateFilterMode === 'year' ? 'active' : ''}`}
                            onClick={() => {
                              setDateFilterMode('year');
                              setDateFilterDay('');
                              setDateFilterMonth('');
                              setFilters(prev => ({ ...prev, date: '' }));
                              // Set year picker decade from selected year or current decade
                              if (dateFilterYear) {
                                const year = parseInt(dateFilterYear);
                                setYearPickerDecade(Math.floor(year / 10) * 10);
                              } else {
                                const today = new Date();
                                const currentYear = today.getFullYear();
                                setYearPickerDecade(Math.floor(currentYear / 10) * 10);
                              }
                            }}
                          >
                            Year
                          </button>
                        </div>
                        <div className="date-picker-input-section">
                          {dateFilterMode === 'day' && (
                            <div className="calendar-day-picker">
                              <div className="calendar-header-nav">
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => navigateMonth(-1)}
                                  title="Previous month"
                                >
                                  <FaChevronLeft />
                                </button>
                                <button
                                  type="button"
                                  className="calendar-month-year-btn"
                                  onClick={() => {
                                    // Switch to month picker when clicking month/year
                                    setDateFilterMode('month');
                                  }}
                                  title="Click to select month"
                                >
                                  {formatMonthYear(calendarView.month, calendarView.year)}
                                </button>
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => navigateMonth(1)}
                                  title="Next month"
                                >
                                  <FaChevronRight />
                                </button>
                              </div>
                              <div className="calendar-weekdays">
                                <div className="calendar-weekday">Mo</div>
                                <div className="calendar-weekday">Tu</div>
                                <div className="calendar-weekday">We</div>
                                <div className="calendar-weekday">Th</div>
                                <div className="calendar-weekday">Fr</div>
                                <div className="calendar-weekday">Sa</div>
                                <div className="calendar-weekday">Su</div>
                              </div>
                              <div className="calendar-days-grid">
                                {generateCalendarDays(calendarView.month, calendarView.year).map((dateInfo, index) => {
                                  const { day, month, year, isCurrentMonth } = dateInfo;
                                  const dayIsToday = isToday(day, month, year);
                                  const dayIsSelected = isSelected(day, month, year);
                                  
                                  return (
                                    <button
                                      key={index}
                                      type="button"
                                      className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${dayIsToday ? 'today' : ''} ${dayIsSelected ? 'selected' : ''}`}
                                      onClick={() => {
                                        handleDaySelect(day, month, year);
                                        // Update calendar view to show selected month
                                        setCalendarView({ month, year });
                                      }}
                                    >
                                      {day}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {dateFilterMode === 'month' && (
                            <div className="month-picker">
                              <div className="month-picker-year-nav">
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => setMonthPickerYear(monthPickerYear - 1)}
                                  title="Previous year"
                                >
                                  <FaChevronLeft />
                                </button>
                                <button
                                  type="button"
                                  className="calendar-month-year-btn"
                                  onClick={() => {
                                    // Switch to year picker when clicking year
                                    setDateFilterMode('year');
                                  }}
                                  title="Click to select year"
                                >
                                  {monthPickerYear}
                                </button>
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => setMonthPickerYear(monthPickerYear + 1)}
                                  title="Next year"
                                >
                                  <FaChevronRight />
                                </button>
                              </div>
                              <div className="month-picker-grid">
                                {[
                                  'January', 'February', 'March', 'April',
                                  'May', 'June', 'July', 'August',
                                  'September', 'October', 'November', 'December'
                                ].map((monthName, index) => {
                                  const monthValue = `${monthPickerYear}-${String(index + 1).padStart(2, '0')}`;
                                  const isSelected = dateFilterMonth === monthValue;
                                  
                                  return (
                                    <button
                                      key={index}
                                      type="button"
                                      className={`month-picker-btn ${isSelected ? 'selected' : ''}`}
                                      onClick={() => {
                                        setDateFilterMonth(monthValue);
                                        // Keep the year in sync
                                        setMonthPickerYear(monthPickerYear);
                                      }}
                                    >
                                      {monthName.substring(0, 3)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {dateFilterMode === 'year' && (
                            <div className="year-picker">
                              <div className="year-picker-decade-nav">
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => setYearPickerDecade(yearPickerDecade - 10)}
                                  title="Previous decade"
                                >
                                  <FaChevronLeft />
                                </button>
                                <div className="year-picker-decade-display">
                                  {yearPickerDecade}s
                                </div>
                                <button
                                  type="button"
                                  className="calendar-nav-btn"
                                  onClick={() => setYearPickerDecade(yearPickerDecade + 10)}
                                  title="Next decade"
                                >
                                  <FaChevronRight />
                                </button>
                              </div>
                              <div className="year-picker-grid">
                                {Array.from({ length: 12 }, (_, i) => {
                                  const year = yearPickerDecade + i;
                                  const isSelected = dateFilterYear === year.toString();
                                  
                                  return (
                                    <button
                                      key={year}
                                      type="button"
                                      className={`year-picker-btn ${isSelected ? 'selected' : ''}`}
                                      onClick={() => {
                                        setDateFilterYear(year.toString());
                                      }}
                                    >
                                      {year}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="date-picker-actions">
                          <button
                            type="button"
                            className="date-picker-clear-btn"
                            onClick={() => {
                              setDateFilterDay('');
                              setDateFilterMonth('');
                              setDateFilterYear('');
                              setDateFilterMode('day');
                              setFilters(prev => ({ ...prev, date: '' }));
                            }}
                          >
                            Clear
                          </button>
                          {dateFilterMode === 'day' && (
                            <button
                              type="button"
                              className="date-picker-today-btn"
                              onClick={goToToday}
                            >
                              Today
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                <th className="column-service">
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
                <th className="column-type">
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
                <th className="column-location">
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
                <th className="column-price">
                  <input
                    type="text"
                    placeholder="Filter price..."
                    value={filters.price}
                    onChange={(e) => handleFilterChange('price', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th className="column-distance">
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
                <th className="column-payment-date">
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
                  <tr key={apt.id} className={`${apt.paid ? 'paid' : 'unpaid'} ${adminMode ? 'admin-mode' : ''} ${invoiceMode && selectedForInvoice.includes(apt.id) ? 'selected-for-invoice' : ''} ${calculatorMode && selectedForCalculator.has(apt.id) ? 'selected-for-calculator' : ''} ${isNew ? 'new-appointment' : ''}`}>
                    {(invoiceMode || calculatorMode) && (
                      <td className="invoice-select-cell">
                        <div className="checkbox-wrapper">
                          <input
                            type="checkbox"
                            checked={invoiceMode ? selectedForInvoice.includes(apt.id) : selectedForCalculator.has(apt.id)}
                            readOnly
                            onClick={(e) => {
                              e.stopPropagation();
                              // onClick should have shiftKey - pass the event
                              invoiceMode ? handleInvoiceToggle(apt.id, e) : handleCalculatorToggle(apt.id, e);
                            }}
                            className="invoice-checkbox"
                          />
                          {invoiceMode && selectedForInvoice.includes(apt.id) && (
                            <span className="selection-number">
                              {selectedForInvoice.indexOf(apt.id) + 1}
                            </span>
                          )}
                        </div>
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
                      className={`column-service ${adminMode && !isEditing ? 'editable-cell' : ''}`}
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
                    <td className="column-type" style={{ width: columnWidths.type }}>{editValues[apt.id]?.type ?? apt.type}</td>
                    <td 
                      className={`column-location ${adminMode && !isEditing ? 'editable-cell' : ''}`}
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
                      className={`column-price ${adminMode && !isEditing ? 'editable-cell' : ''}`}
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
                      className={`column-distance ${adminMode && !isEditing ? 'editable-cell' : ''}`}
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
                        onClick={(e) => handleTogglePaid(apt.id, apt.paid, e)}
                      >
                        {apt.paid ? '✓ Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td className="column-payment-date" style={{ width: columnWidths.payment_date }}>{apt.payment_date ? formatDate(apt.payment_date) : '-'}</td>
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

