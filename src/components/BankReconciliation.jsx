import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { QRCodeSVG } from 'qrcode.react';
import { FaUpload, FaSearch, FaCheckCircle, FaTimesCircle, FaArrowLeft, FaUniversity, FaQrcode, FaMobileAlt } from 'react-icons/fa';
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

  const confidenceBadge = (confidence) => {
    if (confidence === 'high') return <span className="confidence-badge high">High</span>;
    if (confidence === 'medium') return <span className="confidence-badge medium">Medium</span>;
    if (confidence === 'low') return <span className="confidence-badge low">Low</span>;
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
          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <FaUpload className="drop-icon" />
            <p>Drag and drop a bank statement CSV here</p>
            <p className="drop-hint">or</p>
            <label className="file-select-btn">
              Choose File
              <input
                type="file"
                accept=".csv"
                onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}
                hidden
              />
            </label>
            <p className="drop-formats">Supports: Barclays, Lloyds, NatWest, HSBC, Monzo, Starling, Mettle</p>
          </div>

          <div className="mobile-upload-section">
            <div className="mobile-upload-divider">
              <span>or upload from your phone</span>
            </div>
            {showQR && mobileToken ? (
              <div className="mobile-qr-section">
                <QRCodeSVG value={`${window.location.origin}/upload-bank-statement?token=${mobileToken}`} size={160} />
                <p className="qr-hint">Scan with your phone to upload a CSV from your banking app</p>
                <div className="qr-link-actions">
                  <button className="qr-action-btn" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/upload-bank-statement?token=${mobileToken}`);
                  }}>Copy link</button>
                  <button className="qr-action-btn" onClick={() => {
                    const url = `${window.location.origin}/upload-bank-statement?token=${mobileToken}`;
                    window.location.href = `mailto:?subject=Upload Bank Statement&body=Use this link to upload your bank statement:%0A%0A${encodeURIComponent(url)}`;
                  }}>Email link</button>
                </div>
                {pendingMobile.length > 0 && (
                  <div className="pending-mobile-uploads">
                    <h4><FaCheckCircle className="icon-matched" /> Statement received from phone</h4>
                    {pendingMobile.map(upload => (
                      <div key={upload.id} className="pending-upload-row">
                        <span>{upload.filename}</span>
                        <button className="btn-primary" onClick={() => processMobileUpload(upload)}>
                          Process
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button className="mobile-qr-btn" onClick={generateMobileToken}>
                <FaMobileAlt /> Generate QR Code for Mobile Upload
              </button>
            )}
          </div>

          {loading && <div className="bank-recon-loading">Parsing statement...</div>}
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
                        {txn.matched_appointments ? (
                          txn.matched_appointments.map(a => (
                            <div key={a.id} className="match-detail">
                              #{a.id} {a.client_name} — {a.service} ({formatCurrency(a.price)})
                            </div>
                          ))
                        ) : txn.matched_appointment ? (
                          <div className="match-detail">
                            #{txn.matched_appointment.id} {txn.matched_appointment.client_name} — {txn.matched_appointment.service} ({formatCurrency(txn.matched_appointment.price)})
                          </div>
                        ) : '-'}
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
                  </tr>
                </thead>
                <tbody>
                  {unmatchedTxns.map(txn => (
                    <tr key={txn.id} className="unmatched-row">
                      <td>{new Date(txn.transaction_date).toLocaleDateString('en-GB')}</td>
                      <td className="desc-cell">{txn.description}</td>
                      <td className="amount-cell">{formatCurrency(txn.amount)}</td>
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
    </div>
  );
}

export default BankReconciliation;
