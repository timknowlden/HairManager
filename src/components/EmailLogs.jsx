import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './EmailLogs.css';
import { API_BASE } from '../config.js';
import { useNavigate } from 'react-router-dom';
import { FaWrench, FaTrash, FaSync, FaRedoAlt, FaTimes } from 'react-icons/fa';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

function EmailLogs() {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    recipient: '',
    invoiceNumber: '',
    payment: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [webhookEvents, setWebhookEvents] = useState({});
  const [adminMode, setAdminMode] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState({});
  const [resendModal, setResendModal] = useState(null); // { invoice_number, recipient }
  const [resendMessage, setResendMessage] = useState('');
  const [resendSubject, setResendSubject] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [reminderTemplate, setReminderTemplate] = useState('');
  const [selectedLogs, setSelectedLogs] = useState(new Set());

  useEffect(() => {
    fetchLogs();
    fetchInvoiceStatus();
    fetchReminderTemplate();
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
      // Clear webhook events cache so they reload when expanded
      setWebhookEvents({});
      // Clear expanded logs so they need to be re-expanded
      setExpandedLogs(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchReminderTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE}/profile`, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        if (data.reminder_email_template) {
          setReminderTemplate(data.reminder_email_template);
        }
      }
    } catch (err) {
      console.error('Error fetching reminder template:', err);
    }
  };

  const fetchInvoiceStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/email-logs/invoice-status`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setInvoiceStatus(data);
      }
    } catch (err) {
      console.error('Error fetching invoice status:', err);
    }
  };

  const handleResendUnpaid = async (htmlBody) => {
    if (!resendModal) return;
    setResendLoading(true);
    try {
      const response = await fetch(`${API_BASE}/email-logs/resend-unpaid`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_number: resendModal.invoice_number,
          to: resendModal.recipient,
          subject: resendSubject,
          body: htmlBody || resendMessage || undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResendModal(null);
      setResendMessage('');
      setResendSubject('');
      fetchLogs();
      fetchInvoiceStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setResendLoading(false);
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

  const isPricelist = (invoiceNum) => String(invoiceNum).startsWith('PL-');

  const filteredLogs = logs.filter(log => {
    if (filters.status && log.status !== filters.status) return false;
    if (filters.recipient && !log.recipient_email.toLowerCase().includes(filters.recipient.toLowerCase())) return false;
    const invoiceNum = getInvoiceNumber(log);
    if (filters.invoiceNumber && !invoiceNum.includes(filters.invoiceNumber)) return false;
    if (filters.payment) {
      if (isPricelist(invoiceNum)) return false; // pricelists have no payment status
      const status = invoiceStatus[invoiceNum];
      if (filters.payment === 'paid' && (!status || !status.paid)) return false;
      if (filters.payment === 'unpaid' && (!status || status.paid)) return false;
    }
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

  // Group logs by invoice number
  const groupedInvoices = useMemo(() => {
    const groups = {};
    sortedLogs.forEach(log => {
      const invoiceNum = getInvoiceNumber(log);
      if (!groups[invoiceNum]) {
        groups[invoiceNum] = { invoiceNum, logs: [], latestLog: log };
      }
      groups[invoiceNum].logs.push(log);
      // Track the latest log by sent_at
      if (log.sent_at > groups[invoiceNum].latestLog.sent_at) {
        groups[invoiceNum].latestLog = log;
      }
    });
    // Sort groups by latest sent_at descending
    return Object.values(groups).sort((a, b) => {
      const aDate = a.latestLog.sent_at || '';
      const bDate = b.latestLog.sent_at || '';
      return bDate.localeCompare(aDate);
    });
  }, [sortedLogs, invoiceStatus]);

  const [expandedInvoices, setExpandedInvoices] = useState(new Set());

  const toggleInvoiceExpand = (invoiceNum) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(invoiceNum)) next.delete(invoiceNum);
      else next.add(invoiceNum);
      return next;
    });
  };

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

  const toggleAdminMode = () => {
    setAdminMode(!adminMode);
    setSelectedLogs(new Set()); // Clear selections when toggling admin mode
  };

  const handleSelectLog = (logId) => {
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(logId)) {
      newSelected.delete(logId);
    } else {
      newSelected.add(logId);
    }
    setSelectedLogs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLogs.size === sortedLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(sortedLogs.map(log => log.id)));
    }
  };

  const handleDeleteLog = async (logId) => {
    if (!confirm('Are you sure you want to delete this email log?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/email-logs/${logId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete email log');
      }

      // Remove from local state
      setLogs(prevLogs => prevLogs.filter(log => log.id !== logId));
      setSelectedLogs(prev => {
        const newSet = new Set(prev);
        newSet.delete(logId);
        return newSet;
      });
    } catch (err) {
      console.error('Error deleting email log:', err);
      alert('Failed to delete email log: ' + err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLogs.size === 0) {
      alert('Please select at least one email log to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedLogs.size} email log(s)?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedLogs).map(logId =>
        fetch(`${API_BASE}/email-logs/${logId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        })
      );

      const results = await Promise.all(deletePromises);
      const failed = results.filter(r => !r.ok);

      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} email log(s)`);
      }

      // Remove from local state
      setLogs(prevLogs => prevLogs.filter(log => !selectedLogs.has(log.id)));
      setSelectedLogs(new Set());
    } catch (err) {
      console.error('Error deleting email logs:', err);
      alert('Failed to delete email logs: ' + err.message);
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
        <div className="header-actions">
          <button
            onClick={toggleAdminMode}
            className={`admin-btn ${adminMode ? 'active' : ''}`}
            title="Toggle admin mode"
          >
            <FaWrench /> {adminMode ? 'Exit Admin' : 'Admin'}
          </button>
          {adminMode && selectedLogs.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="delete-btn"
              title={`Delete ${selectedLogs.size} selected log(s)`}
            >
              <FaTrash /> Delete Selected ({selectedLogs.size})
            </button>
          )}
          <button onClick={fetchLogs} className="refresh-btn" title="Refresh">
            <FaSync />
          </button>
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
          <label>Reference:</label>
          <input
            type="text"
            placeholder="Filter by reference..."
            value={filters.invoiceNumber}
            onChange={(e) => setFilters({ ...filters, invoiceNumber: e.target.value })}
          />
        </div>
        <div className="filter-group">
          <label>Payment:</label>
          <select
            value={filters.payment}
            onChange={(e) => setFilters({ ...filters, payment: e.target.value })}
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        {(filters.status || filters.recipient || filters.invoiceNumber || filters.payment) && (
          <button
            onClick={() => setFilters({ status: '', recipient: '', invoiceNumber: '', payment: '' })}
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
              <th style={{ width: '40px' }}></th>
              <th className="invoice-col">Reference</th>
              <th className="recipient-col">Last Recipient</th>
              <th className="subject-col">Subject</th>
              <th>Status</th>
              <th>Last Sent</th>
              <th>Last Updated</th>
              <th>Emails</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {groupedInvoices.length === 0 ? (
              <tr>
                <td colSpan="9" className="no-logs">No email logs found</td>
              </tr>
            ) : (
              groupedInvoices.map(group => {
                const { invoiceNum, logs: groupLogs, latestLog } = group;
                const isGroupExpanded = expandedInvoices.has(invoiceNum);
                const status = invoiceStatus[invoiceNum];
                const bestStatus = groupLogs.reduce((best, l) => {
                  const rank = { 'pending': 0, 'sent': 1, 'delivered': 2, 'opened': 3, 'failed': -1 };
                  return (rank[l.status] || 0) > (rank[best] || 0) ? l.status : best;
                }, groupLogs[0]?.status || 'sent');

                const openReminder = () => {
                  // Collect all unique recipients
                  const recipients = [...new Set(groupLogs.filter(l => !l.is_followup).map(l => l.recipient_email))];
                  setResendModal({ invoice_number: invoiceNum, recipient: recipients.join(', ') });
                  setResendSubject(`Payment Reminder - Invoice ${invoiceNum}`);
                  const tpl = reminderTemplate || `<p>This is a friendly reminder that Invoice {invoiceNumber} has {unpaidCount} outstanding appointment${status?.unpaidCount !== 1 ? 's' : ''} totalling {unpaidTotal}.</p><p>A breakdown of the outstanding items is included below.</p><p>Please arrange payment at your earliest convenience.</p><p>Thank you.</p>`;
                  setResendMessage(tpl.replace(/\{invoiceNumber\}/g, invoiceNum).replace(/\{unpaidCount\}/g, status?.unpaidCount || 0).replace(/\{unpaidTotal\}/g, `£${status?.unpaidTotal?.toFixed(2) || '0.00'}`).replace(/\{location\}/g, status?.location || '').replace(/\{date\}/g, status?.date || ''));
                };

                return (
                  <React.Fragment key={invoiceNum}>
                    {/* Group summary row */}
                    <tr className={`group-row ${isGroupExpanded ? 'group-expanded' : ''}`} onClick={() => toggleInvoiceExpand(invoiceNum)}>
                      <td className="expand-cell">
                        <button className="expand-btn">{isGroupExpanded ? '▼' : '▶'}</button>
                      </td>
                      <td>
                        {isPricelist(invoiceNum) ? (
                          <span className="pricelist-ref">{invoiceNum}</span>
                        ) : (
                          <a href="#" className="invoice-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/appointments?id=${invoiceNum}`); }}>
                            {invoiceNum}
                          </a>
                        )}
                      </td>
                      <td className="recipient-cell">{latestLog.recipient_email}</td>
                      <td className="subject-cell">{latestLog.subject || '-'}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: getStatusColor(bestStatus) }}>{bestStatus}</span>
                      </td>
                      <td>{formatDate(latestLog.sent_at)}</td>
                      <td>{formatDate(latestLog.updated_at)}</td>
                      <td><span className="email-count-badge">{groupLogs.length}</span></td>
                      <td className="payment-cell">
                        {isPricelist(invoiceNum) ? (
                          <span className="na-text">N/A</span>
                        ) : !status ? '-' : status.paid ? (
                          <span className="paid-badge">Paid</span>
                        ) : (
                          <span className="unpaid-badge clickable" title="Click to send reminder to all" onClick={(e) => { e.stopPropagation(); openReminder(); }}>
                            {status.unpaidCount} unpaid · £{status.unpaidTotal?.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded: individual email rows */}
                    {isGroupExpanded && groupLogs.map(log => {
                      const isLogExpanded = expandedLogs.has(log.id);
                      const events = webhookEvents[log.id] || [];
                      return (
                        <React.Fragment key={log.id}>
                          <tr className={`child-row ${isLogExpanded ? 'expanded-row' : ''} ${selectedLogs.has(log.id) ? 'selected' : ''}`}>
                            <td>
                              {adminMode && (
                                <input
                                  type="checkbox"
                                  checked={selectedLogs.has(log.id)}
                                  onChange={() => handleSelectLog(log.id)}
                                  title="Select for bulk delete"
                                />
                              )}
                            </td>
                            <td className="child-id">
                              <button onClick={() => toggleExpand(log.id)} className="expand-btn" title="View webhook events">
                                {isLogExpanded ? '▼' : '▶'}
                              </button>
                              #{log.id}
                              {log.is_followup ? <span className="followup-badge" title="Payment reminder">R</span> : null}
                              {adminMode && (
                                <button
                                  className="delete-row-btn"
                                  title="Delete this log"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                                >
                                  <FaTrash />
                                </button>
                              )}
                            </td>
                            <td className="recipient-cell">{log.recipient_email}</td>
                            <td className="subject-cell">{log.subject || '-'}</td>
                            <td>
                              <span className="status-badge" style={{ backgroundColor: getStatusColor(log.status) }}>{log.status}</span>
                            </td>
                            <td>{formatDate(log.sent_at)}</td>
                            <td>{formatDate(log.updated_at)}</td>
                            <td>
                              {log.pdf_file_path ? (
                                <a href="#" onClick={(e) => { e.preventDefault(); handleViewPdf(log.id); }} className="pdf-link">PDF</a>
                              ) : '-'}
                            </td>
                            <td>
                              {isPricelist(invoiceNum) ? (
                                <span className="na-text">N/A</span>
                              ) : !status?.paid && !log.is_followup ? (
                                <span className="remind-badge" title="Send reminder to this recipient" onClick={() => {
                                  setResendModal({ invoice_number: invoiceNum, recipient: log.recipient_email });
                                  setResendSubject(`Payment Reminder - Invoice ${invoiceNum}`);
                                  const tpl = reminderTemplate || `<p>This is a friendly reminder that Invoice {invoiceNumber} has {unpaidCount} outstanding appointments totalling {unpaidTotal}.</p><p>A breakdown of the outstanding items is included below.</p><p>Please arrange payment at your earliest convenience.</p><p>Thank you.</p>`;
                                  setResendMessage(tpl.replace(/\{invoiceNumber\}/g, invoiceNum).replace(/\{unpaidCount\}/g, status?.unpaidCount || 0).replace(/\{unpaidTotal\}/g, `£${status?.unpaidTotal?.toFixed(2) || '0.00'}`).replace(/\{location\}/g, status?.location || '').replace(/\{date\}/g, status?.date || ''));
                                }}>
                                  <FaRedoAlt /> Remind
                                </span>
                              ) : null}
                            </td>
                          </tr>
                          {isLogExpanded && (
                            <tr className="expanded-details-row">
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
                                            <span className="webhook-event-time">{formatDate(event.processed_at)}</span>
                                          </div>
                                          <details className="webhook-event-details">
                                            <summary>View Raw JSON</summary>
                                            <pre className="webhook-json">{JSON.stringify(JSON.parse(event.raw_event_data), null, 2)}</pre>
                                          </details>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {resendModal && (
        <ReminderModal
          resendModal={resendModal}
          setResendModal={setResendModal}
          resendSubject={resendSubject}
          setResendSubject={setResendSubject}
          initialMessage={resendMessage}
          onSend={(htmlBody) => {
            setResendMessage(htmlBody);
            handleResendUnpaid(htmlBody);
          }}
          resendLoading={resendLoading}
          invoiceStatus={invoiceStatus}
        />
      )}
    </div>
  );
}

function ReminderModal({ resendModal, setResendModal, resendSubject, setResendSubject, initialMessage, onSend, resendLoading, invoiceStatus }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: initialMessage || '',
  });

  const status = invoiceStatus[resendModal.invoice_number];

  return (
    <div className="resend-modal-overlay" onClick={() => setResendModal(null)}>
      <div className="resend-modal" onClick={e => e.stopPropagation()}>
        <div className="resend-modal-header">
          <h3>Send Payment Reminder</h3>
          <button className="resend-modal-close" onClick={() => setResendModal(null)}><FaTimes /></button>
        </div>
        <div className="resend-modal-body">
          <div className="resend-field">
            <label>To</label>
            <input
              type="text"
              value={resendModal.recipient}
              onChange={(e) => setResendModal(prev => ({ ...prev, recipient: e.target.value }))}
            />
          </div>
          <div className="resend-field">
            <label>Subject</label>
            <input
              type="text"
              value={resendSubject}
              onChange={(e) => setResendSubject(e.target.value)}
            />
          </div>
          <div className="resend-field">
            <label>Message</label>
            {editor && (
              <div className="resend-editor-wrapper">
                <div className="resend-editor-toolbar">
                  <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive('bold') ? 'active' : ''}><strong>B</strong></button>
                  <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive('italic') ? 'active' : ''}><em>I</em></button>
                  <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive('bulletList') ? 'active' : ''}>•</button>
                </div>
                <EditorContent editor={editor} />
              </div>
            )}
            <p className="resend-field-help">The unpaid items table is appended automatically below your message.</p>
          </div>
          {status && (
            <div className="resend-summary">
              <strong>Invoice {resendModal.invoice_number}</strong> — {status.unpaidCount} unpaid appointment{status.unpaidCount !== 1 ? 's' : ''}, £{status.unpaidTotal?.toFixed(2)} outstanding
            </div>
          )}
        </div>
        <div className="resend-modal-footer">
          <button
            onClick={() => onSend(editor?.getHTML() || '')}
            disabled={resendLoading}
            className="resend-send-btn"
          >
            {resendLoading ? 'Sending...' : 'Send Reminder'}
          </button>
          <button onClick={() => setResendModal(null)} className="resend-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default EmailLogs;

