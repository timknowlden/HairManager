import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaTrash, FaPlus } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './EntryForm.css';

import { API_BASE } from '../config.js';

const FORM_STORAGE_KEY = 'entryFormState';

function EntryForm({ onAppointmentsAdded }) {
  const { getAuthHeaders } = useAuth();
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [clientNames, setClientNames] = useState([]);
  
  // Load form state from localStorage on mount
  const loadFormState = () => {
    try {
      const saved = localStorage.getItem(FORM_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          selectedLocation: parsed.selectedLocation || '',
          selectedDate: parsed.selectedDate || new Date().toISOString().split('T')[0],
          appointments: parsed.appointments && parsed.appointments.length > 0 
            ? parsed.appointments 
            : [{ client_name: '', service: '', price: '' }]
        };
      }
    } catch (err) {
      console.error('Error loading form state:', err);
    }
    return {
      selectedLocation: '',
      selectedDate: new Date().toISOString().split('T')[0],
      appointments: [{ client_name: '', service: '', price: '' }]
    };
  };

  const initialState = loadFormState();
  const [selectedLocation, setSelectedLocation] = useState(initialState.selectedLocation);
  const [selectedDate, setSelectedDate] = useState(initialState.selectedDate);
  const [appointments, setAppointments] = useState(initialState.appointments);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currency, setCurrency] = useState('GBP');
  // Autocomplete state for each appointment row
  const [autocompleteStates, setAutocompleteStates] = useState({});
  // Position state for autocomplete suggestions
  const [autocompletePositions, setAutocompletePositions] = useState({});
  // Selected index for keyboard navigation in autocomplete
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState({});
  // Service autocomplete state
  const [serviceAutocompleteStates, setServiceAutocompleteStates] = useState({});
  const [serviceAutocompletePositions, setServiceAutocompletePositions] = useState({});
  const [selectedServiceAutocompleteIndex, setSelectedServiceAutocompleteIndex] = useState({});
  
  // Refs for autocomplete inputs
  const clientNameInputRefs = useRef({});
  const serviceInputRefs = useRef({});
  // Refs for appointment rows (for auto-scrolling)
  const appointmentRowRefs = useRef({});

  useEffect(() => {
    fetchLocations();
    fetchServices();
    fetchClientNames();
    fetchProfileSettings();
  }, []);

  // Save form state to localStorage whenever it changes
  useEffect(() => {
    const formState = {
      selectedLocation,
      selectedDate,
      appointments
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formState));
  }, [selectedLocation, selectedDate, appointments]);

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

  const fetchClientNames = async () => {
    try {
      const response = await fetch(`${API_BASE}/appointments`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      // Get unique client names, sorted alphabetically
      const uniqueNames = [...new Set(data.map(apt => apt.client_name).filter(Boolean))].sort();
      setClientNames(uniqueNames);
    } catch (err) {
      console.error('Error fetching client names:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await fetch(`${API_BASE}/locations`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      setLocations(data);
      if (data.length > 0 && !selectedLocation) {
        setSelectedLocation(data[0].location_name);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch(`${API_BASE}/services`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      setServices(data);
    } catch (err) {
      console.error('Error fetching services:', err);
    }
  };

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

  const addAppointmentRow = () => {
    const newIndex = appointments.length;
    setAppointments([...appointments, { client_name: '', service: '', price: '' }]);
    
    // Auto-scroll to the new row after it's rendered, prioritizing row visibility
    setTimeout(() => {
      const rowElement = appointmentRowRefs.current[newIndex];
      const submitButton = document.querySelector('.submit-btn');
      const addButton = document.querySelector('.add-appointment-btn');
      
      if (rowElement) {
        const rowRect = rowElement.getBoundingClientRect();
        const rowTop = rowRect.top + window.scrollY;
        const rowHeight = rowElement.offsetHeight;
        const viewportHeight = window.innerHeight;
        const currentScrollY = window.scrollY;
        
        // Calculate button positions
        const submitButtonBottom = submitButton 
          ? submitButton.getBoundingClientRect().bottom + window.scrollY
          : Infinity;
        const addButtonBottom = addButton
          ? addButton.getBoundingClientRect().bottom + window.scrollY
          : Infinity;
        const buttonsBottom = Math.min(submitButtonBottom, addButtonBottom);
        
        // Target: position new row in upper-middle of viewport (about 30% from top)
        const targetRowTop = currentScrollY + (viewportHeight * 0.3);
        const desiredScrollTop = rowTop - (viewportHeight * 0.3);
        
        // Ensure buttons remain visible (at least 250px of buttons visible at bottom)
        const minScrollTop = buttonsBottom - viewportHeight + 250;
        const maxScrollTop = buttonsBottom - viewportHeight - 30;
        
        // Calculate final scroll position
        let finalScrollTop = desiredScrollTop;
        
        // If scrolling would hide buttons, adjust
        if (finalScrollTop > maxScrollTop) {
          // Try to show row while keeping buttons visible
          finalScrollTop = Math.max(maxScrollTop, rowTop - (viewportHeight - 250));
        }
        
        // Only scroll if the row is not already well-positioned
        const rowVisibleTop = rowRect.top;
        const rowVisibleBottom = rowRect.bottom;
        const isRowWellPositioned = rowVisibleTop > 50 && rowVisibleTop < viewportHeight * 0.4 && rowVisibleBottom < buttonsBottom - currentScrollY;
        
        if (!isRowWellPositioned && finalScrollTop !== currentScrollY) {
          window.scrollTo({ 
            top: finalScrollTop, 
            behavior: 'smooth' 
          });
        }
      }
    }, 50);
  };

  const removeAppointmentRow = (index) => {
    if (appointments.length > 1) {
      setAppointments(appointments.filter((_, i) => i !== index));
    }
  };

  const updateAppointment = (index, field, value) => {
    const updated = [...appointments];
    updated[index][field] = value;
    
    // When service is selected, always reset price to match service price
    if (field === 'service' && value) {
      const selectedService = services.find(s => s.service_name === value);
      if (selectedService) {
        updated[index].price = selectedService.price.toFixed(2);
      }
    }
    
    setAppointments(updated);
    
    // Update autocomplete visibility for client_name changes
    if (field === 'client_name') {
      setAutocompleteStates(prev => ({
        ...prev,
        [index]: value.length > 0 && value.trim().length > 0
      }));
      setSelectedAutocompleteIndex(prev => ({ ...prev, [index]: -1 }));
    }
    
    // Update autocomplete visibility for service changes
    if (field === 'service') {
      setServiceAutocompleteStates(prev => ({
        ...prev,
        [index]: value.length > 0 && value.trim().length > 0
      }));
      setSelectedServiceAutocompleteIndex(prev => ({ ...prev, [index]: -1 }));
    }
  };

  const handleClientNameInput = (index, value) => {
    updateAppointment(index, 'client_name', value);
  };

  const selectClientName = (index, name) => {
    updateAppointment(index, 'client_name', name);
    setAutocompleteStates(prev => ({
      ...prev,
      [index]: false
    }));
  };

  const getFilteredClientNames = (index) => {
    const currentValue = appointments[index]?.client_name || '';
    if (!currentValue || currentValue.trim().length === 0) {
      return [];
    }
    const searchTerm = currentValue.toLowerCase();
    return clientNames.filter(name => 
      name.toLowerCase().includes(searchTerm) && 
      name.toLowerCase() !== searchTerm
    ).slice(0, 8); // Limit to 8 suggestions
  };

  const getFilteredServicesByType = (index) => {
    const currentValue = appointments[index]?.service || '';
    const grouped = {};
    
    if (!currentValue || currentValue.trim().length === 0) {
      // Show all services grouped by type when input is empty
      services.forEach(service => {
        if (!grouped[service.type]) {
          grouped[service.type] = [];
        }
        grouped[service.type].push(service);
      });
      // Limit each type to 15 services
      Object.keys(grouped).forEach(type => {
        grouped[type] = grouped[type].slice(0, 15);
      });
    } else {
      // Filter services by search term
      const searchTerm = currentValue.toLowerCase();
      services.forEach(service => {
        if (service.service_name.toLowerCase().includes(searchTerm) && 
            service.service_name.toLowerCase() !== searchTerm) {
          if (!grouped[service.type]) {
            grouped[service.type] = [];
          }
          grouped[service.type].push(service);
        }
      });
      // Limit each type to 8 services when filtering
      Object.keys(grouped).forEach(type => {
        grouped[type] = grouped[type].slice(0, 8);
      });
    }
    
    return grouped;
  };

  const handleClientNameKeyDown = (index, e) => {
    const filtered = getFilteredClientNames(index);
    const currentIndex = selectedAutocompleteIndex[index] ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < filtered.length - 1 ? currentIndex + 1 : 0;
      setSelectedAutocompleteIndex(prev => ({ ...prev, [index]: nextIndex }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : filtered.length - 1;
      setSelectedAutocompleteIndex(prev => ({ ...prev, [index]: prevIndex }));
    } else if (e.key === 'Enter' && currentIndex >= 0 && currentIndex < filtered.length) {
      e.preventDefault();
      selectClientName(index, filtered[currentIndex]);
    } else if (e.key === 'Escape') {
      setAutocompleteStates(prev => ({ ...prev, [index]: false }));
      setSelectedAutocompleteIndex(prev => ({ ...prev, [index]: -1 }));
    }
  };

  const handleServiceKeyDown = (index, e) => {
    const grouped = getFilteredServicesByType(index);
    // Flatten all services into a single array for navigation
    const allServices = Object.values(grouped).flat();
    const currentIndex = selectedServiceAutocompleteIndex[index] ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < allServices.length - 1 ? currentIndex + 1 : 0;
      setSelectedServiceAutocompleteIndex(prev => ({ ...prev, [index]: nextIndex }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : allServices.length - 1;
      setSelectedServiceAutocompleteIndex(prev => ({ ...prev, [index]: prevIndex }));
    } else if (e.key === 'Enter' && currentIndex >= 0 && currentIndex < allServices.length) {
      e.preventDefault();
      selectService(index, allServices[currentIndex].service_name);
    } else if (e.key === 'Escape') {
      setServiceAutocompleteStates(prev => ({ ...prev, [index]: false }));
      setSelectedServiceAutocompleteIndex(prev => ({ ...prev, [index]: -1 }));
    }
  };

  const selectService = (index, serviceName) => {
    updateAppointment(index, 'service', serviceName);
    setServiceAutocompleteStates(prev => ({
      ...prev,
      [index]: false
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedLocation || !selectedDate) {
      setError('Please select a location and date');
      return;
    }

    const validAppointments = appointments
      .filter(apt => apt.client_name.trim() && apt.service.trim())
      .map(apt => ({
        ...apt,
        price: apt.price ? parseFloat(apt.price) : null
      }));

    if (validAppointments.length === 0) {
      setError('Please add at least one appointment');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/appointments/batch`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: selectedLocation,
          date: selectedDate,
          appointments: validAppointments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create appointments');
      }

      setSuccess(`Successfully created ${data.appointments.length} appointment(s)`);
      
      // Clear form state from localStorage and reset form
      localStorage.removeItem(FORM_STORAGE_KEY);
      setAppointments([{ client_name: '', service: '', price: '' }]);
      setSelectedLocation('');
      setSelectedDate(new Date().toISOString().split('T')[0]);
      
      // Notify parent component with new appointment IDs
      if (onAppointmentsAdded) {
        const newIds = data.appointments.map(apt => apt.id);
        onAppointmentsAdded(newIds);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entry-form">
      <h2>New Appointment Entry</h2>
      
      <form onSubmit={handleSubmit} onKeyDown={(e) => {
        // Prevent Enter key from submitting form
        if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
        }
      }}>
        <div className="form-header">
          <div className="form-group">
            <label htmlFor="location">
              <span className="label-icon">📍</span> Location *
            </label>
            <select
              id="location"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              required
              className="location-select"
            >
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.location_name}>
                  {loc.location_name} {loc.distance ? `(${loc.distance} mi)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="date">
              <span className="label-icon">📅</span> Date *
            </label>
            <input
              type="date"
              id="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="date-input"
            />
          </div>
        </div>

        <div className="appointments-section">
          <div className="section-header">
            <h3>
              <span className="section-icon">👥</span> Appointments
            </h3>
            <div className="section-stats">
              <span className="appointment-count">{appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}</span>
              {(() => {
                const totalPrice = appointments.reduce((sum, apt) => {
                  const price = parseFloat(apt.price) || 0;
                  return sum + price;
                }, 0);
                return totalPrice > 0 ? (
                  <span className="total-price">Total: {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}{totalPrice.toFixed(2)}</span>
                ) : null;
              })()}
            </div>
          </div>
          
          <div className="appointments-list">
            <div className="appointments-header">
              <div className="header-number"></div>
              <div className="header-client-name">Client Name</div>
              <div className="header-service">Service</div>
              <div className="header-price">Price</div>
              <div className="header-actions"></div>
            </div>
            {appointments.map((apt, index) => (
              <div 
                key={index} 
                ref={(el) => { appointmentRowRefs.current[index] = el; }}
                className={`appointment-row ${autocompleteStates[index] && getFilteredClientNames(index).length > 0 ? 'autocomplete-open' : ''}`}
              >
                <div className="appointment-number">{index + 1}</div>
                <div className="appointment-client-name">
                  <div className="autocomplete-wrapper">
                    <div className="autocomplete-container">
                      <input
                        ref={(el) => { clientNameInputRefs.current[index] = el; }}
                        type="text"
                        value={apt.client_name}
                        onChange={(e) => handleClientNameInput(index, e.target.value)}
                        onKeyDown={(e) => handleClientNameKeyDown(index, e)}
                        onFocus={(e) => {
                          setAutocompleteStates(prev => ({ ...prev, [index]: true }));
                          // Calculate position for fixed positioning (viewport coordinates)
                          const rect = e.target.getBoundingClientRect();
                          setAutocompletePositions(prev => ({
                            ...prev,
                            [index]: {
                              top: rect.bottom,
                              left: rect.left,
                              width: rect.width
                            }
                          }));
                        }}
                        onBlur={() => {
                          // Delay hiding to allow click on suggestion
                          setTimeout(() => {
                            setAutocompleteStates(prev => ({ ...prev, [index]: false }));
                          }, 200);
                        }}
                        placeholder="Type to search previous clients..."
                        autoFocus={index === appointments.length - 1 && appointments.length > 1}
                        className="autocomplete-input"
                      />
                      {autocompleteStates[index] && getFilteredClientNames(index).length > 0 && createPortal(
                        <ul 
                          className="autocomplete-suggestions"
                          ref={(el) => {
                            if (el) {
                              // #region agent log
                              const computed = window.getComputedStyle(el);
                              const button = document.querySelector('.add-appointment-btn');
                              const buttonComputed = button ? window.getComputedStyle(button) : null;
                              // Check for stacking context creators in parents
                              let parent = el.parentElement;
                              const parentStackingContexts = [];
                              while (parent && parent !== document.body) {
                                const parentStyle = window.getComputedStyle(parent);
                                const hasStackingContext = parentStyle.transform !== 'none' || 
                                  parseFloat(parentStyle.opacity) < 1 || 
                                  parentStyle.isolation === 'isolate' ||
                                  parentStyle.position === 'fixed' ||
                                  (parentStyle.position === 'absolute' && parentStyle.zIndex !== 'auto');
                                if (hasStackingContext) {
                                  parentStackingContexts.push({
                                    tag: parent.tagName,
                                    className: parent.className,
                                    zIndex: parentStyle.zIndex,
                                    position: parentStyle.position,
                                    transform: parentStyle.transform,
                                    opacity: parentStyle.opacity
                                  });
                                }
                                parent = parent.parentElement;
                              }
                              fetch('http://127.0.0.1:7242/ingest/360bcd24-ca3c-48a3-bd97-c0d0287d971c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EntryForm.jsx:283',message:'Autocomplete suggestions rendered via portal - checking z-index and stacking contexts POST-FIX',data:{suggestionsZIndex:computed.zIndex,suggestionsPosition:computed.position,buttonZIndex:buttonComputed?.zIndex,buttonPosition:buttonComputed?.position,buttonTransform:buttonComputed?.transform,inlineZIndex:el.style.zIndex,parentStackingContexts:parentStackingContexts,isPortal:true},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
                              // #endregion
                            }
                          }}
                          style={autocompletePositions[index] ? {
                            position: 'fixed',
                            top: `${autocompletePositions[index].top}px`,
                            left: `${autocompletePositions[index].left}px`,
                            width: `${autocompletePositions[index].width}px`,
                            zIndex: 99999
                          } : {}}
                        >
                          {getFilteredClientNames(index).map((name, idx) => (
                            <li
                              key={idx}
                              onClick={() => selectClientName(index, name)}
                              className={`autocomplete-suggestion ${selectedAutocompleteIndex[index] === idx ? 'selected' : ''}`}
                            >
                              {name}
                            </li>
                          ))}
                        </ul>,
                        document.body
                      )}
                    </div>
                  </div>
                </div>
                <div className="appointment-service">
                  <div className="autocomplete-wrapper">
                    <div className="autocomplete-container">
                      <input
                        ref={(el) => { serviceInputRefs.current[index] = el; }}
                        type="text"
                        value={apt.service}
                        onChange={(e) => {
                          updateAppointment(index, 'service', e.target.value);
                        }}
                        onKeyDown={(e) => handleServiceKeyDown(index, e)}
                        onFocus={(e) => {
                          setServiceAutocompleteStates(prev => ({ ...prev, [index]: true }));
                          const rect = e.target.getBoundingClientRect();
                          setServiceAutocompletePositions(prev => ({
                            ...prev,
                            [index]: {
                              top: rect.bottom,
                              left: rect.left,
                              width: rect.width
                            }
                          }));
                        }}
                        onClick={(e) => {
                          // Show autocomplete on click even if already focused
                          setServiceAutocompleteStates(prev => ({ ...prev, [index]: true }));
                          const rect = e.target.getBoundingClientRect();
                          setServiceAutocompletePositions(prev => ({
                            ...prev,
                            [index]: {
                              top: rect.bottom,
                              left: rect.left,
                              width: rect.width
                            }
                          }));
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setServiceAutocompleteStates(prev => ({ ...prev, [index]: false }));
                          }, 200);
                        }}
                        placeholder="Type to search services..."
                        className="autocomplete-input"
                      />
                      {serviceAutocompleteStates[index] && services.length > 0 && (() => {
                        const grouped = getFilteredServicesByType(index);
                        // Flatten for keyboard navigation index calculation
                        const allServices = Object.values(grouped).flat();
                        let globalIndex = 0;
                        
                        return createPortal(
                          <ul 
                            className="autocomplete-suggestions autocomplete-suggestions-grouped"
                            style={serviceAutocompletePositions[index] ? {
                              position: 'fixed',
                              top: `${serviceAutocompletePositions[index].top}px`,
                              left: `${serviceAutocompletePositions[index].left}px`,
                              width: `${serviceAutocompletePositions[index].width}px`,
                              zIndex: 99999,
                              maxHeight: '400px',
                              overflowY: 'auto'
                            } : {}}
                          >
                            {Object.entries(grouped).map(([type, typeServices]) => 
                              typeServices.length > 0 && (
                                <React.Fragment key={type}>
                                  <li className="autocomplete-group-header">
                                    {type}
                                  </li>
                                  {typeServices.map((service) => {
                                    const currentGlobalIndex = globalIndex++;
                                    return (
                                      <li
                                        key={service.id}
                                        onClick={() => selectService(index, service.service_name)}
                                        className={`autocomplete-suggestion ${selectedServiceAutocompleteIndex[index] === currentGlobalIndex ? 'selected' : ''}`}
                                      >
                                        {service.service_name} - £{service.price.toFixed(2)}
                                      </li>
                                    );
                                  })}
                                </React.Fragment>
                              )
                            )}
                          </ul>,
                          document.body
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="appointment-price">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={apt.price || ''}
                    onChange={(e) => updateAppointment(index, 'price', e.target.value)}
                    placeholder="0.00"
                    className="price-input"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAppointmentRow(index)}
                  className="remove-btn"
                  disabled={appointments.length === 1}
                  title="Remove appointment"
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
          
          <button 
            type="button" 
            onClick={addAppointmentRow} 
            className="add-appointment-btn"
            ref={(el) => {
              if (el) {
                // #region agent log
                const computed = window.getComputedStyle(el);
                let parent = el.parentElement;
                const parentInfo = [];
                while (parent && parent !== document.body) {
                  const parentStyle = window.getComputedStyle(parent);
                  parentInfo.push({
                    tag: parent.tagName,
                    className: parent.className,
                    zIndex: parentStyle.zIndex,
                    position: parentStyle.position,
                    transform: parentStyle.transform,
                    opacity: parentStyle.opacity
                  });
                  parent = parent.parentElement;
                }
                fetch('http://127.0.0.1:7242/ingest/360bcd24-ca3c-48a3-bd97-c0d0287d971c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'EntryForm.jsx:384',message:'Add button rendered - checking z-index and parents POST-FIX',data:{buttonZIndex:computed.zIndex,buttonPosition:computed.position,buttonTransform:computed.transform,parentInfo:parentInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
              }
            }}
          >
            <FaPlus /> Add Another Appointment
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Creating...' : 'Create Appointments'}
        </button>
      </form>
    </div>
  );
}

export default EntryForm;

