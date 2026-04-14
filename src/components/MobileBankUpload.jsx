import { useState, useEffect } from 'react';
import { FaUpload, FaCheck, FaTimes } from 'react-icons/fa';
import { API_BASE } from '../config.js';
import './MobileReceiptUpload.css'; // Reuse existing mobile upload styles

function MobileBankUpload() {
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState('ready'); // ready, uploading, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setStatus('error');
      setErrorMsg('No upload token provided. Please scan the QR code from the Bank Reconciliation page.');
    }
  }, []);

  const handleFile = async (file) => {
    if (!file || !token) return;

    if (!file.name.endsWith('.csv')) {
      setErrorMsg('Please select a CSV file');
      setStatus('error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File must be under 10MB');
      setStatus('error');
      return;
    }

    setFilename(file.name);
    setStatus('uploading');
    setErrorMsg('');

    try {
      const text = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
      });

      const response = await fetch(`${API_BASE}/bank-reconciliation/mobile-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, csvData: text, filename: file.name })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  const reset = () => {
    setStatus('ready');
    setFilename('');
    setErrorMsg('');
  };

  if (status === 'success') {
    return (
      <div className="mobile-upload-page">
        <div className="mobile-upload-card success-card">
          <FaCheck className="success-icon" />
          <h2>Statement Uploaded</h2>
          <p>Your bank statement has been sent. Go back to your desktop to review and match transactions.</p>
          <button onClick={reset} className="mobile-upload-btn">Upload Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-upload-page">
      <div className="mobile-upload-card">
        <h2>Upload Bank Statement</h2>
        <p>Select a CSV export from your banking app to upload for reconciliation.</p>

        {status === 'error' && !token && (
          <div className="mobile-error">{errorMsg}</div>
        )}

        {token && (
          <>
            {status !== 'uploading' ? (
              <div className="mobile-capture-area">
                <label className="mobile-capture-btn">
                  <FaUpload />
                  <span>Choose CSV File</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                  />
                </label>
              </div>
            ) : (
              <div className="mobile-preview">
                <div className="mobile-pdf-badge">Uploading {filename}...</div>
              </div>
            )}

            {status === 'error' && errorMsg && (
              <div className="mobile-error">{errorMsg}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MobileBankUpload;
