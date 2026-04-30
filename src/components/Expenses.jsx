import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEdit, FaTrash, FaPlus, FaReceipt, FaDownload, FaUpload, FaFileAlt, FaCamera, FaImage, FaQrcode, FaTimes } from 'react-icons/fa';
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
  const [uploadToken, setUploadToken] = useState('');
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [longReceiptHint, setLongReceiptHint] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]); // [{ name, dataUrl }] — pending after current
  const [queueTotal, setQueueTotal] = useState(0); // for display: "Receipt 1 of N"
  const [duplicatePrompt, setDuplicatePrompt] = useState(null); // { existing, message }
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filters, setFilters] = useState({
    tax_year: '',
    category_id: ''
  });
  const [sortConfig, setSortConfig] = useState({ column: 'date', direction: 'desc' });
  const formRef = useRef(null);

  useEffect(() => {
    fetchCategories();
    fetchExpenses();
    fetchPendingReceipts();
    // Poll for pending receipts every 10 seconds
    const interval = setInterval(fetchPendingReceipts, 10000);
    return () => clearInterval(interval);
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

  const fetchPendingReceipts = async () => {
    try {
      const response = await fetch(`${API_BASE}/expenses/pending-receipts`, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setPendingReceipts(data);
      }
    } catch (err) { /* silent */ }
  };

  const usePendingReceipt = async (receiptId) => {
    try {
      const response = await fetch(`${API_BASE}/expenses/pending-receipts/${receiptId}`, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, receipt_path: data.image_data }));
        setShowForm(true);
        // Delete from pending
        await fetch(`${API_BASE}/expenses/pending-receipts/${receiptId}`, { method: 'DELETE', headers: getAuthHeaders() });
        fetchPendingReceipts();
      }
    } catch (err) { console.error(err); }
  };

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

  const submitExpense = async (force = false) => {
    const payload = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      category_id: formData.category_id || null,
      ...(force ? { force: true } : {})
    };

    if (editingId) {
      return fetch(`${API_BASE}/expenses/${editingId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    return fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await submitExpense();

      if (response.status === 409) {
        // Duplicate detected — show prompt
        const data = await response.json();
        const amount = data.duplicateAmount ?? parseFloat(formData.amount) ?? 0;
        setDuplicatePrompt({
          existing: data.existing,
          message: `An expense for ${formatCurrency(amount)} already exists on this date`,
        });
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save expense');
      }

      setSuccess(editingId ? 'Expense updated' : 'Expense added');
      fetchExpenses();
      setTimeout(() => setSuccess(null), 3000);

      // If there are more queued files, advance to the next one
      if (!editingId && uploadQueue.length > 0) {
        advanceQueue();
      } else {
        setShowForm(false);
        setEditingId(null);
        setQueueTotal(0);
        resetForm();
      }
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
    setLongReceiptHint(false);
  };

  const scanReceipt = async (imageData) => {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/expenses/scan-receipt`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Auto-fill form fields
      setFormData(prev => ({
        ...prev,
        date: data.date || prev.date,
        amount: data.amount || prev.amount,
        vendor: data.vendor || prev.vendor,
        description: data.description || prev.description,
        category_id: data.category ? (categories.find(c => c.name === data.category)?.id || prev.category_id) : prev.category_id
      }));
      setSuccess('Receipt scanned — fields auto-filled. Please review.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError('Scan failed: ' + err.message);
    } finally {
      setScanning(false);
    }
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

  // Handle multiple files dropped/selected — queue them and load the first
  const handleMultipleFiles = async (files) => {
    if (!files || files.length === 0) return;
    if (files.length === 1) {
      handleReceiptFile(files[0]);
      return;
    }
    // Read all files as data URLs (skip oversized ones with a warning)
    const fileArr = Array.from(files);
    const oversized = fileArr.filter(f => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`${oversized.length} file${oversized.length !== 1 ? 's' : ''} skipped — must be under 5MB each`);
    }
    const valid = fileArr.filter(f => f.size <= 5 * 1024 * 1024);
    if (valid.length === 0) return;

    const items = await Promise.all(valid.map(f => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, dataUrl: reader.result });
      reader.readAsDataURL(f);
    })));

    // Load first into form, queue the rest
    setFormData(prev => ({ ...prev, receipt_path: items[0].dataUrl }));
    setUploadQueue(items.slice(1));
    setQueueTotal(items.length);
  };

  // Advance to next item in queue after a save
  const advanceQueue = () => {
    if (uploadQueue.length === 0) return false;
    const next = uploadQueue[0];
    const remaining = uploadQueue.slice(1);
    setUploadQueue(remaining);
    // Reset form fields but pre-load the next receipt
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      category_id: '',
      amount: '',
      vendor: '',
      notes: '',
      receipt_path: next.dataUrl,
    });
    setLongReceiptHint(false);
    return true;
  };

  // Skip the current file and move to the next without saving
  const skipQueueItem = () => {
    if (advanceQueue()) {
      setError(null);
    } else {
      // No more items
      setQueueTotal(0);
      setShowForm(false);
      resetForm();
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setUploadQueue([]);
    setQueueTotal(0);
    resetForm();
  };

  // Save the new expense even though a duplicate exists (keeps both)
  const handleDuplicateKeepBoth = async () => {
    setDuplicatePrompt(null);
    try {
      const response = await submitExpense(true);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save expense');
      }
      setSuccess('Expense added (duplicate kept)');
      fetchExpenses();
      setTimeout(() => setSuccess(null), 3000);
      if (uploadQueue.length > 0) advanceQueue();
      else { setShowForm(false); setQueueTotal(0); resetForm(); }
    } catch (err) {
      setError(err.message);
    }
  };

  // Discard the new expense, keep the existing one. Advance the queue if any.
  const handleDuplicateKeepExisting = () => {
    setDuplicatePrompt(null);
    setSuccess('Existing expense kept');
    setTimeout(() => setSuccess(null), 3000);
    if (uploadQueue.length > 0) {
      advanceQueue();
    } else {
      setShowForm(false);
      setQueueTotal(0);
      resetForm();
    }
  };

  // Delete the existing duplicate then save the new one
  const handleDuplicateReplace = async () => {
    if (!duplicatePrompt?.existing) return;
    try {
      const delRes = await fetch(`${API_BASE}/expenses/${duplicatePrompt.existing.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!delRes.ok) {
        const data = await delRes.json();
        throw new Error(data.error || 'Failed to delete existing expense');
      }
      // Now save the new one (force=true in case there's another duplicate)
      const response = await submitExpense(true);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save expense');
      }
      setDuplicatePrompt(null);
      setSuccess('Existing expense replaced');
      fetchExpenses();
      setTimeout(() => setSuccess(null), 3000);
      if (uploadQueue.length > 0) advanceQueue();
      else { setShowForm(false); setQueueTotal(0); resetForm(); }
    } catch (err) {
      setError(err.message);
      setDuplicatePrompt(null);
    }
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

  const handleImportCSV = async (file) => {
    if (!file || !file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    setError(null);
    try {
      const text = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
      });
      const res = await fetch(`${API_BASE}/expenses/import-csv`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: text })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setImportResult(data);
      setSuccess(`Imported ${data.imported} expense${data.imported !== 1 ? 's' : ''} from ${data.source}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
      fetchExpenses();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportLoading(false);
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
          <button onClick={() => { setShowImport(true); setImportResult(null); }} className="add-btn import-btn">
            <FaUpload /> Import Orders
          </button>
          <button onClick={handleExportCSV} className="add-btn export-btn">
            <FaDownload /> Export CSV
          </button>
          <button onClick={() => navigate('/tax-report')} className="add-btn tax-report-link-btn">
            <FaFileAlt /> Tax Report
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

      {pendingReceipts.length > 0 && (
        <div className="pending-receipts-bar">
          <span><FaCamera style={{ marginRight: 6 }} /> {pendingReceipts.length} receipt{pendingReceipts.length !== 1 ? 's' : ''} uploaded from mobile</span>
          <div className="pending-receipts-actions">
            {pendingReceipts.map(r => (
              <button key={r.id} onClick={() => usePendingReceipt(r.id)} className="use-receipt-btn">
                Use receipt #{r.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showForm && (
        <div className="expense-form-container" ref={formRef}>
          <div className="expense-form-header">
            <h3>{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
            {queueTotal > 1 && !editingId && (
              <div className="queue-indicator">
                <span>Receipt {queueTotal - uploadQueue.length} of {queueTotal}</span>
                <span className="queue-remaining">{uploadQueue.length} remaining</span>
                <button type="button" className="queue-skip-btn" onClick={skipQueueItem} title="Skip this receipt">
                  Skip
                </button>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="expense-form expense-form-2col">
            <div className="form-group receipt-upload-group-full expense-form-left">
              <label>Receipt</label>
              <div
                className={`receipt-drop-zone receipt-drop-zone-full ${dragging ? 'dragging' : ''} ${formData.receipt_path ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files.length > 0) handleMultipleFiles(e.dataTransfer.files);
                }}
              >
                {formData.receipt_path ? (
                  <div className="receipt-preview-full">
                    <div className="receipt-preview-content" onClick={() => setViewReceipt(formData.receipt_path)} title="Click to enlarge">
                      {formData.receipt_path.startsWith('data:image') ? (
                        <img
                          src={formData.receipt_path}
                          alt="Receipt"
                          className="receipt-thumb-full"
                          onLoad={(e) => {
                            const ratio = e.target.naturalHeight / e.target.naturalWidth;
                            setLongReceiptHint(ratio > 2.2);
                          }}
                        />
                      ) : formData.receipt_path.startsWith('data:application/pdf') ? (
                        <iframe src={formData.receipt_path} className="receipt-pdf-preview" title="Receipt PDF" />
                      ) : (
                        <div className="receipt-file-icon"><FaFileAlt /> PDF attached</div>
                      )}
                      <span className="receipt-click-hint">Click to enlarge</span>
                    </div>
                    {longReceiptHint && (
                      <div className="receipt-long-hint">
                        <span>📏</span>
                        This receipt looks long — for better AI scanning, try cropping it or splitting into sections on the mobile upload.
                      </div>
                    )}
                    <div className="receipt-actions">
                      <button type="button" className="receipt-scan-btn" disabled={scanning} onClick={() => scanReceipt(formData.receipt_path)}>
                        {scanning ? 'Scanning...' : 'Scan with AI'}
                      </button>
                      <button type="button" className="receipt-remove" onClick={() => setFormData(prev => ({ ...prev, receipt_path: '' }))}>
                        <FaTrash /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="receipt-empty-state">
                    <div className="receipt-desktop-upload">
                      <FaCamera className="receipt-drop-icon" />
                      <span className="receipt-drop-text">Drop receipts here (multiple OK), or click to browse</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        capture="environment"
                        multiple
                        onChange={(e) => { if (e.target.files.length > 0) handleMultipleFiles(e.target.files); }}
                        className="receipt-file-input"
                      />
                    </div>
                    <div className="receipt-mobile-divider">or upload from your phone</div>
                    <div className="receipt-mobile-section" onClick={e => e.stopPropagation()}>
                      {uploadToken ? (
                        <div className="receipt-qr-inline">
                          <QRCodeSVG value={`${window.location.origin}/upload-receipt?token=${uploadToken}`} size={120} />
                          <div className="receipt-qr-links">
                            <button type="button" className="receipt-email-link" onClick={() => {
                              const url = `${window.location.origin}/upload-receipt?token=${uploadToken}`;
                              window.location.href = `mailto:?subject=Upload Receipt&body=Use this link to upload a receipt:%0A%0A${encodeURIComponent(url)}`;
                            }}>
                              Email link to phone
                            </button>
                            <button type="button" className="receipt-copy-link" onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/upload-receipt?token=${uploadToken}`);
                            }}>
                              Copy link
                            </button>
                            <span className="receipt-qr-expiry">Expires in 30 min</span>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="receipt-generate-qr" onClick={async () => {
                          try {
                            const response = await fetch(`${API_BASE}/expenses/upload-token`, { method: 'POST', headers: getAuthHeaders() });
                            if (response.ok) { const data = await response.json(); setUploadToken(data.token); }
                          } catch (err) { console.error(err); }
                        }}>
                          <FaQrcode /> Generate mobile upload link
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="expense-form-right">
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
            </div>
          </form>
        </div>
      )}

      <div className="expenses-table-container">
        <table>
          <colgroup>
            <col className="col-date" />
            <col className="col-desc" />
            <col className="col-receipt" />
            <col className="col-cat" />
            <col className="col-vendor" />
            <col className="col-amount" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('date')}>
                Date {sortConfig.column === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('description')}>
                Description {sortConfig.column === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="receipt-header" title="Receipt"><FaImage /></th>
              <th className="sortable" onClick={() => handleSort('category_name')}>
                Category {sortConfig.column === 'category_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => handleSort('vendor')}>
                Vendor {sortConfig.column === 'vendor' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable amount-header" onClick={() => handleSort('amount')}>
                Amount {sortConfig.column === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">
                  {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses match the current filters'}
                </td>
              </tr>
            ) : (
              sortedExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.date).toLocaleDateString('en-GB')}</td>
                  <td className="desc-cell">
                    {expense.description}
                    {expense.notes && <span className="expense-notes" title={expense.notes}> *</span>}
                  </td>
                  <td className="receipt-cell">
                    {expense.receipt_path && (
                      <button
                        type="button"
                        className="receipt-indicator-btn"
                        title="View receipt"
                        onClick={() => setViewReceipt(expense.receipt_path)}
                      >
                        <FaImage />
                      </button>
                    )}
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

      {/* Import Orders Modal */}
      {showImport && (
        <div className="import-modal-overlay" onClick={() => !importLoading && setShowImport(false)}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <button className="import-modal-close" onClick={() => !importLoading && setShowImport(false)}><FaTimes /></button>
            <h3><FaUpload /> Import Orders as Expenses</h3>

            {importResult ? (
              <div className="import-result">
                <div className="import-result-icon">
                  {importResult.imported > 0 ? <FaReceipt style={{ color: '#10b981', fontSize: 40 }} /> : <FaTimes style={{ color: '#9ca3af', fontSize: 40 }} />}
                </div>
                <p><strong>{importResult.imported}</strong> expense{importResult.imported !== 1 ? 's' : ''} imported from <strong>{importResult.source}</strong></p>
                {importResult.skipped > 0 && <p className="import-skipped">{importResult.skipped} skipped (duplicates or empty)</p>}
                <div className="import-result-actions">
                  <button className="import-btn-primary" onClick={() => { setShowImport(false); setImportResult(null); }}>Done</button>
                  <button className="import-btn-secondary" onClick={() => setImportResult(null)}>Import Another</button>
                </div>
              </div>
            ) : (
              <>
                <p className="import-intro">Upload a CSV export from Amazon or eBay to automatically create expense records.</p>

                <div className="import-instructions">
                  <div className="import-source">
                    <h4>Amazon</h4>
                    <ol>
                      <li>Log into <a href="https://www.amazon.co.uk" target="_blank" rel="noopener noreferrer">amazon.co.uk</a></li>
                      <li>Go to <strong>Account &amp; Lists</strong> &rarr; <strong>Your Account</strong></li>
                      <li>Under "Ordering and shopping preferences", click <strong>Download order reports</strong></li>
                      <li>Set your date range, select <strong>Items</strong> as report type</li>
                      <li>Click <strong>Request Report</strong>, wait, then <strong>Download CSV</strong></li>
                    </ol>
                  </div>

                  <div className="import-source">
                    <h4>eBay</h4>
                    <ol>
                      <li>Log into <a href="https://www.ebay.co.uk" target="_blank" rel="noopener noreferrer">ebay.co.uk</a></li>
                      <li>Click your name &rarr; <strong>Purchase history</strong></li>
                      <li>Use the date filter to select the period you want</li>
                      <li>Look for a <strong>Download</strong> or <strong>Export</strong> option on the page</li>
                      <li>If no export is available, try <a href="https://www.ebay.co.uk/sh/ord" target="_blank" rel="noopener noreferrer">Seller Hub Orders</a> (for seller transactions)</li>
                    </ol>
                  </div>
                </div>

                <label className="import-upload-btn">
                  {importLoading ? 'Importing...' : 'Choose CSV File'}
                  <input
                    type="file"
                    accept=".csv"
                    disabled={importLoading}
                    onChange={e => { if (e.target.files[0]) handleImportCSV(e.target.files[0]); e.target.value = ''; }}
                    hidden
                  />
                </label>
                <p className="import-hint">Duplicates are automatically skipped. Expenses are categorised as "Supplies & Materials" by default.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Duplicate detection modal */}
      {duplicatePrompt && (
        <div className="duplicate-modal-overlay" onClick={() => setDuplicatePrompt(null)}>
          <div className="duplicate-modal" onClick={e => e.stopPropagation()}>
            <h3>Possible duplicate</h3>
            <p className="duplicate-message">{duplicatePrompt.message}</p>
            <div className="duplicate-cards">
              <div className="duplicate-card existing">
                <div className="duplicate-card-label">Existing</div>
                <div className="duplicate-amount">{formatCurrency(duplicatePrompt.existing.amount)}</div>
                <div className="duplicate-meta">
                  <div><strong>Date:</strong> {new Date(duplicatePrompt.existing.date).toLocaleDateString('en-GB')}</div>
                  <div><strong>Description:</strong> {duplicatePrompt.existing.description}</div>
                  {duplicatePrompt.existing.vendor && <div><strong>Vendor:</strong> {duplicatePrompt.existing.vendor}</div>}
                  {duplicatePrompt.existing.category_name && <div><strong>Category:</strong> {duplicatePrompt.existing.category_name}</div>}
                </div>
                {duplicatePrompt.existing.receipt_path && (
                  <div className="duplicate-receipt-thumb" onClick={() => setViewReceipt(duplicatePrompt.existing.receipt_path)}>
                    {duplicatePrompt.existing.receipt_path.startsWith('data:image') ? (
                      <img src={duplicatePrompt.existing.receipt_path} alt="Existing receipt" />
                    ) : (
                      <FaFileAlt />
                    )}
                  </div>
                )}
              </div>
              <div className="duplicate-card new">
                <div className="duplicate-card-label">New</div>
                <div className="duplicate-amount">{formatCurrency(parseFloat(formData.amount) || 0)}</div>
                <div className="duplicate-meta">
                  <div><strong>Date:</strong> {new Date(formData.date).toLocaleDateString('en-GB')}</div>
                  <div><strong>Description:</strong> {formData.description}</div>
                  {formData.vendor && <div><strong>Vendor:</strong> {formData.vendor}</div>}
                </div>
                {formData.receipt_path && (
                  <div className="duplicate-receipt-thumb" onClick={() => setViewReceipt(formData.receipt_path)}>
                    {formData.receipt_path.startsWith('data:image') ? (
                      <img src={formData.receipt_path} alt="New receipt" />
                    ) : (
                      <FaFileAlt />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="duplicate-actions">
              <button className="btn-keep-both" onClick={handleDuplicateKeepBoth}>
                Keep both
              </button>
              <button className="btn-keep-existing" onClick={handleDuplicateKeepExisting}>
                Keep existing only
              </button>
              <button className="btn-replace" onClick={handleDuplicateReplace}>
                <FaTrash /> Delete existing & save new
              </button>
              <button className="btn-cancel-dup" onClick={() => setDuplicatePrompt(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Expenses;
