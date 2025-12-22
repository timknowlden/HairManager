import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './EmailLogs.css';
import { API_BASE } from '../config.js';

function EmailLogs() {
  const { getAuthHeaders } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    recipient: '',
    invoiceNumber: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [webhookEvents, setWebhookEvents] = useState({});

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

  // Sort logs
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (sortConfig.key === 'id') {
      return sortConfig.direction === 'desc' ? bValue - aValue : aValue - bValue;
    }
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

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

  const toggleExpand = async (logId) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
      // Fetch webhook events if not already loaded
      if (!webhookEvents[logId]) {
        try {
          const response = await fetch(`${API_BASE}/email-logs/${logId}/webhook-events`, {
            headers: getAuthHeaders()
          });
          if (response.ok) {
            const events = await response.json();
            setWebhookEvents(prev => ({ ...prev, [logId]: events }));
          }
        } catch (err) {
          console.error('Error fetching webhook events:', err);
        }
      }
    }
    setExpandedLogs(newExpanded);
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
              <th 
                className="sortable-header"
                onClick={() => handleSort('id')}
                style={{ cursor: 'pointer' }}
              >
                ID {sortConfig.key === 'id' && (sortConfig.direction === 'desc' ? '↓' : '↑')}
              </th>
              <th className="invoice-col">Invoice #</th>
              <th className="recipient-col">Recipient</th>
              <th className="subject-col">Subject</th>
              <th>Status</th>
              <th>Sent At</th>
              <th>Updated At</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.length === 0 ? (
              <tr>
                <td colSpan="8" className="no-logs">No email logs found</td>
              </tr>
            ) : (
              sortedLogs.map(log => {
                const invoiceNum = getInvoiceNumber(log);
                const isExpanded = expandedLogs.has(log.id);
                const events = webhookEvents[log.id] || [];
                return (
                  <>
                    <tr key={log.id} className={isExpanded ? 'expanded-row' : ''}>
                      <td>
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="expand-btn"
                          title={isExpanded ? 'Collapse' : 'Expand to view webhook events'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        {log.id}
                      </td>
                      <td className="invoice-cell">{invoiceNum}</td>
                      <td className="recipient-cell">{log.recipient_email}</td>
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
                    </tr>
                    {isExpanded && (
                      <tr key={`${log.id}-expanded`} className="expanded-details-row">
                        <td colSpan="9" className="expanded-details-cell">
                          <div className="webhook-details">
                            <h4>Webhook Events ({events.length})</h4>
                            {events.length === 0 ? (
                              <p>No webhook events received yet.</p>
                            ) : (
                              <div className="webhook-events-list">
                                {events.map((event, idx) => (
                                  <div key={event.id || idx} className="webhook-event">
                                    <div className="webhook-event-header">
                                      <span className="webhook-event-type">{event.event_type}</span>
                                      <span className="webhook-event-time">
                                        {formatDate(event.processed_at)}
                                      </span>
                                    </div>
                                    <details className="webhook-event-details">
                                      <summary>View Raw JSON</summary>
                                      <pre className="webhook-json">
                                        {JSON.stringify(JSON.parse(event.raw_event_data), null, 2)}
                                      </pre>
                                    </details>
                                  </div>
                                ))}
                              </div>
                            )}
                            {log.webhook_event_data && (
                              <div className="latest-webhook-data">
                                <h4>Latest Webhook Event Data (from email_logs table)</h4>
                                <details>
                                  <summary>View Latest Event JSON</summary>
                                  <pre className="webhook-json">
                                    {JSON.stringify(JSON.parse(log.webhook_event_data), null, 2)}
                                  </pre>
                                </details>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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

