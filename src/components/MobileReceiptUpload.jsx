import { useState, useEffect } from 'react';
import { FaCamera, FaCheck, FaTimes } from 'react-icons/fa';
import './MobileReceiptUpload.css';
import { API_BASE } from '../config.js';

function MobileReceiptUpload() {
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState('ready'); // ready, uploading, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setStatus('error');
      setErrorMsg('No upload token provided. Please scan the QR code from the Expenses page.');
    }
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File must be under 5MB');
      setStatus('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview || !token) return;
    setStatus('uploading');
    setErrorMsg('');

    try {
      const response = await fetch(`${API_BASE}/expenses/mobile-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, image: preview })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      setStatus('success');
      setPreview(null);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  const reset = () => {
    setStatus('ready');
    setPreview(null);
    setErrorMsg('');
  };

  if (status === 'success') {
    return (
      <div className="mobile-upload-page">
        <div className="mobile-upload-card success-card">
          <FaCheck className="success-icon" />
          <h2>Receipt Uploaded</h2>
          <p>Your receipt has been sent to the desktop. You can close this page or upload another.</p>
          <button onClick={reset} className="mobile-upload-btn">Upload Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-upload-page">
      <div className="mobile-upload-card">
        <h2>Upload Receipt</h2>
        <p>Take a photo or choose an existing image to upload as an expense receipt.</p>

        {status === 'error' && !token && (
          <div className="mobile-error">{errorMsg}</div>
        )}

        {token && (
          <>
            {!preview ? (
              <div className="mobile-capture-area">
                <label className="mobile-capture-btn">
                  <FaCamera />
                  <span>Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                </label>
                <label className="mobile-browse-btn">
                  Choose from gallery
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                </label>
              </div>
            ) : (
              <div className="mobile-preview">
                {preview.startsWith('data:image') ? (
                  <img src={preview} alt="Receipt preview" />
                ) : (
                  <div className="mobile-pdf-badge">PDF ready to upload</div>
                )}
                <div className="mobile-preview-actions">
                  <button onClick={handleUpload} disabled={status === 'uploading'} className="mobile-upload-btn">
                    {status === 'uploading' ? 'Uploading...' : 'Upload Receipt'}
                  </button>
                  <button onClick={reset} className="mobile-retake-btn">Retake</button>
                </div>
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

export default MobileReceiptUpload;
