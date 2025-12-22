import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './EmailLogs.css';
import { API_BASE } from '../config.js';

function EmailLogs() {
  const { getAuthHeaders } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    recipient: '',
    invoiceNumber: ''
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/email-logs`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error('Failed to fetch email logs');
      }
      const data = await response.json();
      setLogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Extract invoice number from subject if missing from invoice_number field
  const getInvoiceNumber = (log) => {
    if (log.invoice_number && log.invoice_number !== 'unknown') {
      return log.invoice_number;
    }
    // Try to extract from subject: "Invoice 2775 from ..." or "Invoice 2775"
    if (log.subject) {
      const match = log.subject.match(/Invoice\s+(\d+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
    return log.invoice_number || 'unknown';
  };

  const filteredLogs = logs.filter(log => {
    if (filters.status && log.status !== filters.status) return false;
    if (filters.recipient && !log.recipient_email.toLowerCase().includes(filters.recipient.toLowerCase())) return false;
    const invoiceNum = getInvoiceNumber(log);
    if (filters.invoiceNumber && !invoiceNum.includes(filters.invoiceNumber)) return false;
    return true;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered':
        return '#4CAF50'; // Green
      case 'sent':
        return '#2196F3'; // Blue
      case 'opened':
        return '#9C27B0'; // Purple
      case 'failed':
        return '#F44336'; // Red
      case 'pending':
        return '#FF9800'; // Orange
      default:
        return '#757575'; // Grey
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewPdf = async (logId) => {
    try {
      const response = await fetch(`${API_BASE}/email-logs/pdf/${logId}`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      // Open PDF in a new tab without forcing download
      window.open(url, '_blank');
      // Clean up the blob URL after a delay to allow the browser to load it
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Error viewing PDF:', err);
      alert('Failed to open PDF: ' + err.message);
    }
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/email-logs/check-status`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check status');
      }
      
      const data = await response.json();
      // Refresh the logs to show updated statuses
      await fetchLogs();
      alert(data.message || `Checked ${data.checked} emails, updated ${data.updated} statuses`);
    } catch (err) {
      console.error('Error checking status:', err);
      setError(err.message);
      const errorMsg = err.message.includes('Email Activity') || err.message.includes('authorization required') || err.message.includes('Failed to fetch')
        ? 'SendGrid Messages API requires Email Activity add-on (paid feature). This is expected. Use "Mark Delivered" button for local testing, or configure webhook for production automatic updates.'
        : err.message;
      alert('Status check: ' + errorMsg);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleManualStatusUpdate = async (logId, newStatus) => {
    if (!window.confirm(`Mark this email as ${newStatus}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/email-logs/${logId}/status`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }
      
      // Refresh the logs to show updated status
      await fetchLogs();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status: ' + err.message);
    }
  };

  if (loading) {
    return <div className="loading">Loading email logs...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="email-logs">
      <div className="email-logs-header">
        <h2>Email Logs</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleCheckStatus} className="refresh-btn" disabled={checkingStatus}>
            {checkingStatus ? 'Checking...' : 'Check SendGrid Status'}
          </button>
          <button onClick={fetchLogs} className="refresh-btn">Refresh</button>
        </div>
      </div>

      <div className="email-logs-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Recipient:</label>
          <input
            type="text"
            placeholder="Filter by email..."
            value={filters.recipient}
            onChange={(e) => setFilters({ ...filters, recipient: e.target.value })}
          />
        </div>
        <div className="filter-group">
          <label>Invoice Number:</label>
          <input
            type="text"
            placeholder="Filter by invoice..."
            value={filters.invoiceNumber}
            onChange={(e) => setFilters({ ...filters, invoiceNumber: e.target.value })}
          />
        </div>
        {(filters.status || filters.recipient || filters.invoiceNumber) && (
          <button
            onClick={() => setFilters({ status: '', recipient: '', invoiceNumber: '' })}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="email-logs-stats">
        <div className="stat">
          <span className="stat-label">Total:</span>
          <span className="stat-value">{logs.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Delivered:</span>
          <span className="stat-value" style={{ color: '#4CAF50' }}>
            {logs.filter(l => l.status === 'delivered').length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Failed:</span>
          <span className="stat-value" style={{ color: '#F44336' }}>
            {logs.filter(l => l.status === 'failed').length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending:</span>
          <span className="stat-value" style={{ color: '#FF9800' }}>
            {logs.filter(l => l.status === 'pending' || l.status === 'sent').length}
          </span>
        </div>
      </div>

      <div className="email-logs-table-container">
        <table className="email-logs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Invoice #</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Sent At</th>
              <th>Updated At</th>
              <th>Error</th>
              <th>PDF</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="10" className="no-logs">No email logs found</td>
              </tr>
            ) : (
              filteredLogs.map(log => {
                const invoiceNum = getInvoiceNumber(log);
                return (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{invoiceNum}</td>
                    <td>{log.recipient_email}</td>
                    <td className="subject-cell">{log.subject || '-'}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(log.status) }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{formatDate(log.sent_at)}</td>
                    <td>{formatDate(log.updated_at)}</td>
                    <td className="error-cell">
                      {log.error_message ? (
                        <span title={log.error_message} className="error-message">
                          {log.error_message.length > 50 
                            ? log.error_message.substring(0, 50) + '...' 
                            : log.error_message}
                        </span>
                      ) : '-'}
                    </td>
                  <td>
                    {log.pdf_file_path ? (
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handleViewPdf(log.id);
                        }}
                        className="pdf-link"
                      >
                        View PDF
                      </a>
                    ) : '-'}
                  </td>
                  <td>
                    {log.status === 'sent' || log.status === 'pending' ? (
                      <button
                        onClick={() => handleManualStatusUpdate(log.id, 'delivered')}
                        className="status-update-btn"
                        title="Mark as delivered (for local testing)"
                      >
                        Mark Delivered
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmailLogs;

