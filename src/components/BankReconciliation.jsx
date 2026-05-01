import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { QRCodeSVG } from 'qrcode.react';
import { FaUpload, FaSearch, FaCheckCircle, FaTimesCircle, FaArrowLeft, FaUniversity, FaQrcode, FaMobileAlt, FaFilePdf } from 'react-icons/fa';
import './BankReconciliation.css';

function BankReconciliation({ onBack }) {
  const { getAuthHeaders } = useAuth();
  const [step, setStep] = useState('upload'); // upload, mapping, review, done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [mobileToken, setMobileToken] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [pendingMobile, setPendingMobile] = useState([]);

  // Upload state
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadId, setUploadId] = useState(null);

  // Mapping state (when auto-detect fails)
  const [headers, setHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({ dateCol: 0, descriptionCol: 1, amountCol: 2 });
  const [supportedFormats, setSupportedFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [filename, setFilename] = useState(null);

  // Review state
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [applyResult, setApplyResult] = useState(null);

  // Manual match state
  const [manualMatchTxn, setManualMatchTxn] = useState(null); // transaction being manually matched
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [unpaidSearch, setUnpaidSearch] = useState('');

  const readFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsText(file);
    });
  };

  const generateMobileToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/bank-reconciliation/upload-token`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setMobileToken(data.token);
        setShowQR(true);
      }
    } catch (err) {
      setError('Failed to generate mobile upload link');
    }
  };

  // Poll for mobile uploads when QR is showing
  useEffect(() => {
    if (!showQR) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/bank-reconciliation/pending-mobile`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setPendingMobile(data);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [showQR, getAuthHeaders]);

  const processMobileUpload = async (upload) => {
    setLoading(true);
    setShowQR(false);
    try {
      const res = await fetch(`${API_BASE}/bank-reconciliation/process-mobile/${upload.id}`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsMapping) {
          setHeaders(data.headers || []);
          setSupportedFormats(data.supportedFormats || []);
          setCsvData(upload.csvData);
          setFilename(upload.filename);
          setUploadId(upload.id);
          setStep('mapping');
        } else {
          setError(data.error || 'Processing failed');
        }
        return;
      }
      setUploadResult(data);
      setUploadId(data.uploadId);
      await runMatching(data.uploadId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Upload a PDF/image remittance advice and AI-scan it for individual payments
  const handleRemittanceUpload = useCallback(async (file) => {
    setError(null);
    setLoading(true);
    try {
      // CSV remittances skip AI scanning — just upload as a regular CSV
      // (the matching engine looks at reference + amount the same way).
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      if (isCsv) {
        const text = await file.text();
        const res = await fetch(`${API_BASE}/bank-reconciliation/upload`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvData: text, filename: file.name })
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.needsMapping) {
            setHeaders(data.headers || []);
            setSupportedFormats(data.supportedFormats || []);
            setCsvData(text);
            setFilename(file.name);
            setStep('mapping');
          } else {
            setError(data.error || 'CSV upload failed');
          }
          return;
        }
        setUploadResult(data);
        setUploadId(data.uploadId);
        await runMatching(data.uploadId);
        return;
      }

      // PDF / image: use AI scan
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${API_BASE}/bank-reconciliation/scan-remittance`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: dataUrl, filename: file.name })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Remittance scan failed');
        return;
      }
      setUploadResult(data);
      setUploadId(data.uploadId);
      await runMatching(data.uploadId);
    } catch (err) {
      setError('Error scanning remittance: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const handleUpload = useCallback(async (file) => {
    setError(null);
    setLoading(true);
    try {
      const text = await readFile(file);
      setCsvData(text);
      setFilename(file.name);

      const res = await fetch(`${API_BASE}/bank-reconciliation/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: text, filename: file.name })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needsMapping) {
          setHeaders(data.headers || []);
          setSupportedFormats(data.supportedFormats || []);
          setStep('mapping');
        } else {
          setError(data.error || 'Upload failed');
        }
        return;
      }

      setUploadResult(data);
      setUploadId(data.uploadId);
      // Auto-run matching
      await runMatching(data.uploadId);
    } catch (err) {
      setError('Error reading file: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const handleMappingSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const body = { csvData, filename };
      if (selectedFormat) {
        body.formatOverride = selectedFormat;
      } else {
        body.columnMapping = {
          dateCol: parseInt(columnMapping.dateCol),
          descriptionCol: parseInt(columnMapping.descriptionCol),
          amountCol: parseInt(columnMapping.amountCol),
        };
        body.formatOverride = '_custom';
      }

      const res = await fetch(`${API_BASE}/bank-reconciliation/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      setUploadResult(data);
      setUploadId(data.uploadId);
      await runMatching(data.uploadId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runMatching = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bank-reconciliation/${id}/match`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Matching failed');
        return;
      }

      setTransactions(data.transactions || []);
      // Pre-select high confidence matches
      const preSelected = new Set();
      (data.transactions || []).forEach(txn => {
        if (txn.match_confidence === 'high' && txn.match_status === 'matched') {
          preSelected.add(txn.id);
        }
      });
      setSelected(preSelected);
      setStep('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    const matches = transactions
      .filter(txn => selected.has(txn.id) && txn.match_status === 'matched')
      .map(txn => {
        let appointmentIds;
        if (txn.matched_invoice_group) {
          try {
            const group = JSON.parse(txn.matched_invoice_group);
            appointmentIds = group.appointmentIds;
          } catch { appointmentIds = [txn.matched_appointment_id]; }
        } else {
          appointmentIds = [txn.matched_appointment_id];
        }
        return { transactionId: txn.id, appointmentIds };
      });

    if (matches.length === 0) {
      setError('No matches selected');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bank-reconciliation/${uploadId}/apply`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches })
      });
      const data = await res.json();
      if (res.ok) {
        setApplyResult(data);
        setStep('done');
      } else {
        setError(data.error || 'Apply failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllMatched = () => {
    const all = new Set();
    transactions.forEach(txn => {
      if (txn.match_status === 'matched') all.add(txn.id);
    });
    setSelected(all);
  };

  const openManualMatch = async (txn) => {
    setManualMatchTxn(txn);
    setUnpaidSearch('');
    if (unpaidInvoices.length === 0) {
      try {
        const res = await fetch(`${API_BASE}/bank-reconciliation/unpaid-invoices`, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok) setUnpaidInvoices(data);
      } catch (err) {
        setError('Failed to load unpaid invoices');
      }
    }
  };

  const applyManualMatch = async (invoice) => {
    if (!manualMatchTxn) return;
    try {
      const res = await fetch(`${API_BASE}/bank-reconciliation/transaction/${manualMatchTxn.id}/manual-match`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentIds: invoice.appointmentIds })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Manual match failed');
        return;
      }
      // Refresh transactions for this upload
      const txnRes = await fetch(`${API_BASE}/bank-reconciliation/${uploadId}/transactions`, {
        headers: getAuthHeaders()
      });
      if (txnRes.ok) {
        const txns = await txnRes.json();
        setTransactions(txns);
        // Auto-select the newly matched one
        setSelected(prev => new Set([...prev, manualMatchTxn.id]));
      }
      setManualMatchTxn(null);
    } catch (err) {
      setError('Error applying match: ' + err.message);
    }
  };

  const confidenceBadge = (confidence) => {
    if (confidence === 'high') return <span className="confidence-badge high">High</span>;
    if (confidence === 'medium') return <span className="confidence-badge medium">Medium</span>;
    if (confidence === 'low') return <span className="confidence-badge low">Low</span>;
    if (confidence === 'manual') return <span className="confidence-badge manual">Manual</span>;
    return <span className="confidence-badge none">No match</span>;
  };

  const formatCurrency = (amount) => `£${(amount || 0).toFixed(2)}`;

  // Drag and drop handlers
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleUpload(file);
    else setError('Please upload a CSV file');
  };

  const matchedTxns = transactions.filter(t => t.match_status === 'matched');
  const unmatchedTxns = transactions.filter(t => t.match_status === 'unmatched');
  const selectedTotal = transactions.filter(t => selected.has(t.id)).reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="bank-reconciliation">
      <div className="bank-recon-header">
        <button className="btn-back" onClick={onBack}><FaArrowLeft /> Back to Financial</button>
        <h2><FaUniversity /> Bank Reconciliation</h2>
      </div>

      {error && (
        <div className="bank-recon-error">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bank-recon-upload">
          <p className="upload-intro">Choose how you want to import payment information.</p>

          <div className="upload-cards">
            {/* CSV upload card */}
            <div
              className={`upload-card ${dragging ? 'dragging' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="upload-card-icon"><FaUpload /></div>
              <h3>Bank statement CSV</h3>
              <p>Export from your online banking and drop it here.</p>
              <label className="file-select-btn">
                Choose CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}
                  hidden
                />
              </label>
              <p className="drop-formats">Barclays · Lloyds · NatWest · HSBC · Monzo · Starling · Mettle</p>
            </div>

            {/* Mobile QR card */}
            <div className="upload-card">
              <div className="upload-card-icon"><FaMobileAlt /></div>
              <h3>Upload from phone</h3>
              <p>Scan a QR code to upload from your mobile banking app.</p>
              {showQR && mobileToken ? (
                <div className="mobile-qr-section">
                  <QRCodeSVG value={`${window.location.origin}/upload-bank-statement?token=${mobileToken}`} size={140} />
                  <div className="qr-link-actions">
                    <button className="qr-action-btn" onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/upload-bank-statement?token=${mobileToken}`);
                    }}>Copy link</button>
                    <button className="qr-action-btn" onClick={() => {
                      const url = `${window.location.origin}/upload-bank-statement?token=${mobileToken}`;
                      window.location.href = `mailto:?subject=Upload Bank Statement&body=${encodeURIComponent(url)}`;
                    }}>Email link</button>
                  </div>
                  {pendingMobile.length > 0 && (
                    <div className="pending-mobile-uploads">
                      <h4><FaCheckCircle className="icon-matched" /> Received from phone</h4>
                      {pendingMobile.map(upload => (
                        <div key={upload.id} className="pending-upload-row">
                          <span>{upload.filename}</span>
                          <button className="btn-primary" onClick={() => processMobileUpload(upload)}>Process</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button className="file-select-btn" onClick={generateMobileToken}>
                  Generate QR
                </button>
              )}
            </div>

            {/* Remittance scan card */}
            <div className="upload-card">
              <div className="upload-card-icon"><FaFilePdf /></div>
              <h3>Remittance advice</h3>
              <p>Upload a PDF, image, or CSV of a payment remittance. PDFs/images are AI-scanned; CSVs are parsed directly.</p>
              <label className="file-select-btn">
                Upload PDF / image / CSV
                <input
                  type="file"
                  accept=".pdf,.csv,image/*"
                  onChange={e => e.target.files[0] && handleRemittanceUpload(e.target.files[0])}
                  hidden
                />
              </label>
            </div>
          </div>

          {loading && <div className="bank-recon-loading">Processing...</div>}
        </div>
      )}

      {/* Step 2: Column Mapping (when auto-detect fails) */}
      {step === 'mapping' && (
        <div className="bank-recon-mapping">
          <h3>Column Mapping</h3>
          <p>We couldn't auto-detect your bank format. Please select your bank or map the columns manually.</p>

          {supportedFormats.length > 0 && (
            <div className="format-select">
              <label>Select your bank:</label>
              <select value={selectedFormat || ''} onChange={e => setSelectedFormat(e.target.value || null)}>
                <option value="">-- Manual mapping --</option>
                {supportedFormats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {!selectedFormat && (
            <div className="column-mappers">
              <p className="mapping-headers">Detected columns: {headers.map((h, i) => <span key={i} className="header-tag">{i}: {h}</span>)}</p>
              <div className="mapper-row">
                <label>Date column:</label>
                <select value={columnMapping.dateCol} onChange={e => setColumnMapping(p => ({ ...p, dateCol: e.target.value }))}>
                  {headers.map((h, i) => <option key={i} value={i}>{i}: {h}</option>)}
                </select>
              </div>
              <div className="mapper-row">
                <label>Description column:</label>
                <select value={columnMapping.descriptionCol} onChange={e => setColumnMapping(p => ({ ...p, descriptionCol: e.target.value }))}>
                  {headers.map((h, i) => <option key={i} value={i}>{i}: {h}</option>)}
                </select>
              </div>
              <div className="mapper-row">
                <label>Amount column:</label>
                <select value={columnMapping.amountCol} onChange={e => setColumnMapping(p => ({ ...p, amountCol: e.target.value }))}>
                  {headers.map((h, i) => <option key={i} value={i}>{i}: {h}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="mapping-actions">
            <button className="btn-primary" onClick={handleMappingSubmit} disabled={loading}>
              {loading ? 'Processing...' : 'Continue'}
            </button>
            <button className="btn-secondary" onClick={() => { setStep('upload'); setError(null); }}>Back</button>
          </div>
        </div>
      )}

      {/* Step 3: Review Matches */}
      {step === 'review' && (
        <div className="bank-recon-review">
          <div className="review-summary">
            <div className="summary-stat">
              <strong>{transactions.length}</strong> credit transactions
            </div>
            <div className="summary-stat matched">
              <strong>{matchedTxns.length}</strong> matched
            </div>
            <div className="summary-stat unmatched">
              <strong>{unmatchedTxns.length}</strong> unmatched
            </div>
            <div className="summary-stat selected">
              <strong>{selected.size}</strong> selected ({formatCurrency(selectedTotal)})
            </div>
          </div>

          <div className="review-actions">
            <button className="btn-select-all" onClick={selectAllMatched}>Select All Matched</button>
            <button className="btn-primary" onClick={handleApply} disabled={loading || selected.size === 0}>
              {loading ? 'Applying...' : `Apply ${selected.size} Match${selected.size !== 1 ? 'es' : ''}`}
            </button>
          </div>

          {matchedTxns.length > 0 && (
            <>
              <h3><FaCheckCircle className="icon-matched" /> Matched Transactions</h3>
              <table className="bank-recon-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Confidence</th>
                    <th>Matched To</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedTxns.map(txn => (
                    <tr key={txn.id} className={selected.has(txn.id) ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(txn.id)}
                          onChange={() => toggleSelect(txn.id)}
                        />
                      </td>
                      <td>{new Date(txn.transaction_date).toLocaleDateString('en-GB')}</td>
                      <td className="desc-cell">{txn.description}</td>
                      <td className="amount-cell">{formatCurrency(txn.amount)}</td>
                      <td>{confidenceBadge(txn.match_confidence)}</td>
                      <td className="match-cell">
                        {(() => {
                          const apts = txn.matched_appointments || (txn.matched_appointment ? [txn.matched_appointment] : []);
                          if (apts.length === 0) return '-';
                          const total = apts.reduce((sum, a) => sum + (a.price || 0), 0);
                          const totalMatches = Math.abs(total - txn.amount) < 0.01;
                          return (
                            <div className="match-list">
                              <div className={`match-summary ${totalMatches ? 'amount-ok' : 'amount-mismatch'}`}>
                                {apts.length} appointment{apts.length !== 1 ? 's' : ''} · {new Date(apts[0].date).toLocaleDateString('en-GB')} · {formatCurrency(total)}
                                {totalMatches && <FaCheckCircle className="match-amount-icon" title="Amount matches" />}
                              </div>
                              {apts.map(a => (
                                <div key={a.id} className="match-detail-row">
                                  <span className="match-detail-id">#{a.id}</span>
                                  <span className="match-detail-name">{a.client_name}</span>
                                  <span className="match-detail-service">{a.service}</span>
                                  <span className="match-detail-price">{formatCurrency(a.price)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {unmatchedTxns.length > 0 && (
            <>
              <h3><FaTimesCircle className="icon-unmatched" /> Unmatched Transactions</h3>
              <table className="bank-recon-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th style={{ width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedTxns.map(txn => (
                    <tr key={txn.id} className="unmatched-row">
                      <td>{new Date(txn.transaction_date).toLocaleDateString('en-GB')}</td>
                      <td className="desc-cell">{txn.description}</td>
                      <td className="amount-cell">{formatCurrency(txn.amount)}</td>
                      <td>
                        <button className="btn-select-all" onClick={() => openManualMatch(txn)}>
                          <FaSearch /> Match
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <div className="bank-recon-done">
          <div className="done-icon"><FaCheckCircle /></div>
          <h3>Reconciliation Complete</h3>
          <p>{applyResult?.applied || 0} payment{applyResult?.applied !== 1 ? 's' : ''} matched and marked as paid.</p>
          <div className="done-actions">
            <button className="btn-primary" onClick={() => { setStep('upload'); setUploadResult(null); setTransactions([]); setSelected(new Set()); setApplyResult(null); }}>
              Upload Another Statement
            </button>
            <button className="btn-secondary" onClick={onBack}>Back to Financial</button>
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      {manualMatchTxn && (
        <div className="manual-match-overlay" onClick={() => setManualMatchTxn(null)}>
          <div className="manual-match-modal" onClick={e => e.stopPropagation()}>
            <div className="manual-match-header">
              <h3>Match transaction to invoice</h3>
              <button className="manual-match-close" onClick={() => setManualMatchTxn(null)}>&times;</button>
            </div>
            <div className="manual-match-txn-info">
              <strong>{formatCurrency(manualMatchTxn.amount)}</strong> on {new Date(manualMatchTxn.transaction_date).toLocaleDateString('en-GB')}
              <div className="manual-match-desc">{manualMatchTxn.description}</div>
            </div>
            <input
              type="text"
              placeholder="Search by client name, location, date or amount..."
              value={unpaidSearch}
              onChange={e => setUnpaidSearch(e.target.value)}
              className="manual-match-search"
              autoFocus
            />
            <div className="manual-match-list">
              {(() => {
                const txnAmount = manualMatchTxn.amount;
                const search = unpaidSearch.toLowerCase().trim();
                const filtered = unpaidInvoices.filter(inv => {
                  if (!search) return true;
                  const haystack = [
                    inv.location,
                    inv.date,
                    String(inv.total),
                    String(inv.invoiceNumber),
                    ...(inv.clientNames || [])
                  ].join(' ').toLowerCase();
                  return haystack.includes(search);
                });
                // Sort: closest amount match first
                filtered.sort((a, b) => Math.abs(a.total - txnAmount) - Math.abs(b.total - txnAmount));

                if (filtered.length === 0) {
                  return <div className="manual-match-empty">No unpaid invoices match.</div>;
                }
                return filtered.slice(0, 50).map(inv => {
                  const exactMatch = Math.abs(inv.total - txnAmount) <= 0.01;
                  return (
                    <div key={`${inv.date}|${inv.location}`} className={`manual-match-row ${exactMatch ? 'exact-match' : ''}`}>
                      <div className="manual-match-row-main">
                        <div className="manual-match-row-title">
                          #{inv.invoiceNumber} — {inv.clientNames.slice(0, 3).join(', ')}{inv.clientNames.length > 3 ? '…' : ''}
                        </div>
                        <div className="manual-match-row-meta">
                          {new Date(inv.date).toLocaleDateString('en-GB')} · {inv.location} · {inv.appointmentCount} appt{inv.appointmentCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="manual-match-row-amount">
                        {formatCurrency(inv.total)}
                        {exactMatch && <span className="exact-tag">exact</span>}
                      </div>
                      <button className="btn-primary" onClick={() => applyManualMatch(inv)}>Select</button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BankReconciliation;
