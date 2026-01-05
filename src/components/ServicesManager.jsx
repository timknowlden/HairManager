import { useState, useEffect, useMemo, useRef } from 'react';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './ServicesManager.css';

import { API_BASE } from '../config.js';

function ServicesManager() {
  const { getAuthHeaders } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    service_name: '',
    type: '',
    price: ''
  });

  // Column widths state for resizing
  const [columnWidths, setColumnWidths] = useState({
    id: 40,
    service_name: 200,
    type: 100,
    price: 100,
    actions: 100
  });

  const [resizingColumn, setResizingColumn] = useState(null);

  // Sort state - default to ID ascending
  const [sortConfig, setSortConfig] = useState({ column: 'id', direction: 'asc' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    service_name: '',
    type: 'Hair',
    price: ''
  });
  const formRef = useRef(null); // Ref for the form container

  useEffect(() => {
    fetchServices();
  }, []);

  // Scroll to form when it opens
  useEffect(() => {
    if (showAddForm && formRef.current) {
      // Use setTimeout to ensure the form is rendered before scrolling
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showAddForm]);

  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/services`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }
      const data = await response.json();
      setServices(data);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price) || 0
      };

      let response;
      if (editingId) {
        response = await fetch(`${API_BASE}/services/${editingId}`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/services`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save service');
      }

      setSuccess(editingId ? 'Service updated successfully' : 'Service added successfully');
      setShowAddForm(false);
      setEditingId(null);
      resetForm();
      fetchServices();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (service) => {
    setFormData({
      service_name: service.service_name || '',
      type: service.type || 'Hair',
      price: service.price || ''
    });
    setEditingId(service.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/services/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete service');
      }

      setSuccess('Service deleted successfully');
      fetchServices();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkImport = async () => {
    const importData = `Blow Dry	Hair	£15.00
Shampoo & Set	Hair	£14.00
Dry Cut	Hair	£14.00
Cut & Blow Dry	Hair	£25.00
Cut & Set	Hair	£24.00
Restyling	Hair	£30.00
Gents Dry Cut	Hair	£14.50
Clipper Cuts 	Hair	£6.00
Beard Trim	Hair	£5.00
Child Cut	Hair	£10.00
Child Cut & Blow Dry	Hair	£18.00
Other	Hair	£0.00
File & Polish	Nails	£10.00
Manicure	Nails	£18.00
Gel Polish	Nails	£20.00
Removal	Nails	£6.00
Gel Removal & Re-Apply	Nails	£25.00
Pedicure	Nails	£20.00
Blow Dry & Fringe Trim 	Hair	£17.00
Nails Cut & Filed 	Nails	£6.00
Wash & Cut 	Hair	£20.00
Colour 	Hair	£60.00
Colour, cut & blow dry 	Hair	£45.00
Hair wash 	Hair	£5.00`;

    const lines = importData.split('\n').filter(line => line.trim());
    const servicesToImport = lines.map(line => {
      const parts = line.split('\t');
      const priceStr = parts[2]?.trim() || '0';
      const price = parseFloat(priceStr.replace(/£/g, '').replace(/,/g, '')) || 0;
      
      return {
        service_name: parts[0]?.trim() || '',
        type: parts[1]?.trim() || 'Hair',
        price: price
      };
    }).filter(svc => svc.service_name);

    if (servicesToImport.length === 0) {
      setError('No valid services found in the data');
      return;
    }

    try {
      const promises = servicesToImport.map(service => 
        fetch(`${API_BASE}/services`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(service)
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      setSuccess(`Successfully imported ${successful} services`);
      fetchServices();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      service_name: '',
      type: 'Hair',
      price: ''
    });
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    resetForm();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
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

      if (column === 'id' || column === 'price') {
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

  // Filter and sort services
  const filteredAndSortedServices = useMemo(() => {
    let filtered = services.filter(svc => {
      if (filters.service_name && !svc.service_name.toLowerCase().includes(filters.service_name.toLowerCase())) return false;
      if (filters.type && svc.type !== filters.type) return false;
      if (filters.price) {
        const priceStr = svc.price.toString();
        if (!priceStr.includes(filters.price)) return false;
      }
      return true;
    });

    // Always apply sorting (defaults to ID if no column selected)
    const sortColumn = sortConfig.column || 'id';
    const sortDirection = sortConfig.direction || 'asc';
    filtered = sortData(filtered, sortColumn, sortDirection);

    return filtered;
  }, [services, filters, sortConfig]);

  const handleFilterChange = (column, value) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      service_name: '',
      type: '',
      price: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(f => f !== '');

  // Get unique types for dropdown
  const uniqueTypes = useMemo(() => {
    return [...new Set(services.map(s => s.type))].sort();
  }, [services]);

  if (loading) {
    return <div className="loading">Loading services...</div>;
  }

  return (
    <div className="services-manager">
      <div className="services-header">
        <h2>Services Management</h2>
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
              + Add Service
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="service-form-container" ref={formRef}>
          <h3>{editingId ? 'Edit Service' : 'Add New Service'}</h3>
          <form onSubmit={handleSubmit} className="service-form">
            <div className="form-row">
              <div className="form-group">
                <label>Service Name *</label>
                <input
                  type="text"
                  name="service_name"
                  value={formData.service_name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="Hair">Hair</option>
                  <option value="Nails">Nails</option>
                </select>
              </div>
              <div className="form-group">
                <label>Price (£) *</label>
                <input
                  type="number"
                  step="0.01"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="service-submit-btn">
                {editingId ? 'Update' : 'Add'} Service
              </button>
              <button type="button" onClick={cancelForm} className="service-cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="services-table-container">
        <div className="filter-info">
          Showing {filteredAndSortedServices.length} of {services.length} services
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
                onClick={() => handleSort('service_name')}
                style={{ width: columnWidths.service_name, position: 'relative' }}
              >
                Service Name {sortConfig.column === 'service_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'service_name')}
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
                onClick={() => handleSort('price')}
                style={{ width: columnWidths.price, position: 'relative' }}
              >
                Price {sortConfig.column === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, 'price')}
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
              <th></th>
              <th>
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={filters.service_name}
                  onChange={(e) => handleFilterChange('service_name', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Types</option>
                  {uniqueTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedServices.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
                  {services.length === 0 ? 'No services found' : 'No services match the current filters'}
                </td>
              </tr>
            ) : (
              filteredAndSortedServices.map((service) => (
                <tr key={service.id}>
                  <td style={{ width: columnWidths.id }}>{service.id}</td>
                  <td style={{ width: columnWidths.service_name }}>{service.service_name}</td>
                  <td style={{ width: columnWidths.type }}>{service.type}</td>
                  <td style={{ width: columnWidths.price }}>{formatCurrency(service.price)}</td>
                  <td className="actions-cell" style={{ width: columnWidths.actions }}>
                    <button onClick={() => handleEdit(service)} className="edit-btn" title="Edit">
                      <FaEdit />
                    </button>
                    <button onClick={() => handleDelete(service.id)} className="delete-btn" title="Delete">
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

export default ServicesManager;

