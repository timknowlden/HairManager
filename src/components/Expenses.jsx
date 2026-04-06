import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEdit, FaTrash, FaPlus, FaReceipt, FaDownload, FaFileAlt, FaCamera, FaImage, FaQrcode, FaTimes } from 'react-icons/fa';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import './Expenses.css';
import { API_BASE } from '../config.js';

function Expenses() {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category_id: '',
    amount: '',
    vendor: '',
    notes: '',
    receipt_path: ''
  });
  const [dragging, setDragging] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null); // base64 data for lightbox
  const [filters, setFilters] = useState({
    tax_year: '',
    category_id: ''
  });
  const [sortConfig, setSortConfig] = useState({ column: 'date', direction: 'desc' });
  const formRef = useRef(null);

  useEffect(() => {
    fetchCategories();
    fetchExpenses();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [filters.tax_year, filters.category_id]);

  useEffect(() => {
    if ((showForm || editingId) && formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    }
  }, [showForm, editingId]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.tax_year) params.set('tax_year', filters.tax_year);
      if (filters.category_id) params.set('category_id', filters.category_id);
      const response = await fetch(`${API_BASE}/expenses?${params}`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Failed to fetch expenses');
      const data = await response.json();
      setExpenses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/expenses/categories`, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount) || 0,
        category_id: formData.category_id || null
      };

      let response;
      if (editingId) {
        response = await fetch(`${API_BASE}/expenses/${editingId}`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/expenses`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save expense');
      }

      setSuccess(editingId ? 'Expense updated' : 'Expense added');
      setShowForm(false);
      setEditingId(null);
      resetForm();
      fetchExpenses();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (expense) => {
    setFormData({
      date: expense.date || '',
      description: expense.description || '',
      category_id: expense.category_id || '',
      amount: expense.amount || '',
      vendor: expense.vendor || '',
      notes: expense.notes || '',
      receipt_path: expense.receipt_path || ''
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      const response = await fetch(`${API_BASE}/expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to delete');
      fetchExpenses();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      category_id: '',
      amount: '',
      vendor: '',
      notes: '',
      receipt_path: ''
    });
  };

  const handleReceiptFile = (file) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('Receipt file must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, receipt_path: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.tax_year) params.set('tax_year', filters.tax_year);
      const response = await fetch(`${API_BASE}/expenses/export/csv?${params}`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${filters.tax_year || 'all'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  // Available tax years
  const taxYears = useMemo(() => {
    const years = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const currentTaxYearStart = (month < 3 || (month === 3 && day < 6)) ? currentYear - 1 : currentYear;
    for (let y = currentTaxYearStart; y >= currentTaxYearStart - 5; y--) {
      years.push({ value: y.toString(), label: `${y}/${y + 1}` });
    }
    return years;
  }, []);

  // Sort expenses
  const sortedExpenses = useMemo(() => {
    const sorted = [...expenses];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.column];
      let bVal = b[sortConfig.column];
      if (sortConfig.column === 'amount') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [expenses, sortConfig]);

  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  }, [expenses]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  if (loading && expenses.length === 0) {
    return <div className="loading">Loading expenses...</div>;
  }

  return (
    <div className="expenses-manager">
      <div className="expenses-header">
        <h2><FaReceipt style={{ marginRight: 8 }} /> Expenses</h2>
        <div className="header-actions">
          <button onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }} className="add-btn">
            <FaPlus /> Add Expense
          </button>
          <button onClick={handleExportCSV} className="add-btn export-btn">
            <FaDownload /> Export CSV
          </button>
          <button onClick={() => navigate('/tax-report')} className="add-btn tax-report-link-btn">
            <FaFileAlt /> Tax Report
          </button>
          <button onClick={() => setShowQR(true)} className="add-btn export-btn" title="Mobile upload link">
            <FaQrcode /> Mobile Upload
          </button>
        </div>
      </div>

      <div className="expenses-filters">
        <div className="filter-group">
          <label>Tax Year</label>
          <select
            value={filters.tax_year}
            onChange={(e) => setFilters(prev => ({ ...prev, tax_year: e.target.value }))}
          >
            <option value="">All Time</option>
            {taxYears.map(ty => (
              <option key={ty.value} value={ty.value}>{ty.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Category</label>
          <select
            value={filters.category_id}
            onChange={(e) => setFilters(prev => ({ ...prev, category_id: e.target.value }))}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-summary">
          <span>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</span>
          <span className="filter-total">Total: {formatCurrency(totalExpenses)}</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showForm && (
        <div className="expense-form-container" ref={formRef}>
          <h3>{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
          <form onSubmit={handleSubmit} className="expense-form">
            <div className="form-group receipt-upload-group-full">
              <label>Receipt</label>
              <div
                className={`receipt-drop-zone receipt-drop-zone-full ${dragging ? 'dragging' : ''} ${formData.receipt_path ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleReceiptFile(file);
                }}
              >
                {formData.receipt_path ? (
                  <div className="receipt-preview-full">
                    <div className="receipt-preview-content" onClick={() => setViewReceipt(formData.receipt_path)} title="Click to enlarge">
                      {formData.receipt_path.startsWith('data:image') ? (
                        <img src={formData.receipt_path} alt="Receipt" className="receipt-thumb-full" />
                      ) : formData.receipt_path.startsWith('data:application/pdf') ? (
                        <iframe src={formData.receipt_path} className="receipt-pdf-preview" title="Receipt PDF" />
                      ) : (
                        <div className="receipt-file-icon"><FaFileAlt /> PDF attached</div>
                      )}
                      <span className="receipt-click-hint">Click to enlarge</span>
                    </div>
                    <button type="button" className="receipt-remove" onClick={() => setFormData(prev => ({ ...prev, receipt_path: '' }))}>
                      <FaTrash /> Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <FaCamera className="receipt-drop-icon" />
                    <span className="receipt-drop-text">Drop receipt image or PDF here, or click to browse</span>
                    <span className="receipt-drop-hint">Supports camera capture on mobile</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={(e) => { if (e.target.files[0]) handleReceiptFile(e.target.files[0]); }}
                      className="receipt-file-input"
                    />
                  </>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Amount (£) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  required
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                >
                  <option value="">Select category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Description *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  required
                  placeholder="What was the expense for?"
                />
              </div>
              <div className="form-group">
                <label>Vendor</label>
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                  placeholder="Shop or supplier name"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows="2"
                placeholder="Optional notes"
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="expense-submit-btn">
                {editingId ? 'Update' : 'Add'} Expense
              </button>
              <button type="button" onClick={cancelForm} className="expense-cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="expenses-table-container">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('date')}>
                Date {sortConfig.column === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('description')}>
                Description {sortConfig.column === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('category_name')}>
                Category {sortConfig.column === 'category_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('vendor')}>
                Vendor {sortConfig.column === 'vendor' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('amount')}>
                Amount {sortConfig.column === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-data">
                  {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses match the current filters'}
                </td>
              </tr>
            ) : (
              sortedExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.date).toLocaleDateString('en-GB')}</td>
                  <td>
                    {expense.description}
                    {expense.notes && <span className="expense-notes" title={expense.notes}> *</span>}
                    {expense.receipt_path && <button type="button" className="receipt-indicator-btn" title="View receipt" onClick={() => setViewReceipt(expense.receipt_path)}><FaImage /></button>}
                  </td>
                  <td><span className="category-badge">{expense.category_name || '-'}</span></td>
                  <td>{expense.vendor || '-'}</td>
                  <td className="amount-cell">{formatCurrency(expense.amount)}</td>
                  <td className="actions-cell">
                    <button onClick={() => handleEdit(expense)} className="edit-btn" title="Edit"><FaEdit /></button>
                    <button onClick={() => handleDelete(expense.id)} className="delete-btn" title="Delete"><FaTrash /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewReceipt && (
        <div className="receipt-lightbox" onClick={() => setViewReceipt(null)}>
          <button className="receipt-lightbox-close" onClick={() => setViewReceipt(null)}><FaTimes /></button>
          <div className="receipt-lightbox-content" onClick={e => e.stopPropagation()}>
            {viewReceipt.startsWith('data:image') ? (
              <img src={viewReceipt} alt="Receipt" />
            ) : viewReceipt.startsWith('data:application/pdf') ? (
              <iframe src={viewReceipt} title="Receipt PDF" />
            ) : (
              <p>Unable to preview this file type</p>
            )}
          </div>
        </div>
      )}

      {showQR && (
        <div className="qr-modal-overlay" onClick={() => setShowQR(false)}>
          <div className="qr-modal" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Mobile Receipt Upload</h3>
              <button className="qr-modal-close" onClick={() => setShowQR(false)}><FaTimes /></button>
            </div>
            <div className="qr-modal-body">
              <p>Scan this QR code on your phone to open the Expenses page and upload receipts using your camera.</p>
              <div className="qr-code-container">
                <QRCodeSVG value={window.location.href} size={200} />
              </div>
              <div className="qr-link">
                <input type="text" readOnly value={window.location.href} onClick={e => e.target.select()} />
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); }}>Copy</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Expenses;
