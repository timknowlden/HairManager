import { useState, useEffect, useRef } from 'react';
import { FaCamera, FaCheck, FaCrop, FaCut, FaUpload, FaUndo } from 'react-icons/fa';
import './MobileReceiptUpload.css';
import { API_BASE } from '../config.js';

function MobileReceiptUpload() {
  const [token, setToken] = useState(null);
  const [stage, setStage] = useState('capture'); // capture | edit | uploading | done
  const [errorMsg, setErrorMsg] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });
  const [isPdf, setIsPdf] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  // Edit mode: 'crop' or 'split'
  const [mode, setMode] = useState('crop');
  // Crop box in image coordinates (pixels of natural image)
  const [crop, setCrop] = useState(null); // { x, y, w, h }
  // Split lines (y positions in natural image coords)
  const [splits, setSplits] = useState([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);

  const imgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setErrorMsg('No upload token provided. Please scan the QR code from the Expenses page.');
    }
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('File must be under 8MB');
      return;
    }
    setErrorMsg('');

    if (file.type === 'application/pdf') {
      // PDF: skip the editor, upload directly
      const reader = new FileReader();
      reader.onload = () => {
        setIsPdf(true);
        setPdfDataUrl(reader.result);
        setStage('edit'); // Show preview + Upload button
      };
      reader.readAsDataURL(file);
      return;
    }

    // Image: load into editor
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      const img = new Image();
      img.onload = () => {
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        setImageDataUrl(url);
        setIsPdf(false);
        // Default crop to full image
        setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
        setSplits([]);
        // Auto-suggest split mode for very tall images
        const ratio = img.naturalHeight / img.naturalWidth;
        setMode(ratio > 2.2 ? 'split' : 'crop');
        setStage('edit');
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  // Convert touch/pointer event to image coordinates
  const eventToImageY = (e) => {
    if (!imgRef.current || !imageDims.h) return 0;
    const rect = imgRef.current.getBoundingClientRect();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const localY = clientY - rect.top;
    const ratio = imageDims.h / rect.height;
    return Math.max(0, Math.min(imageDims.h, localY * ratio));
  };

  const eventToImageCoords = (e) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const xRatio = imageDims.w / rect.width;
    const yRatio = imageDims.h / rect.height;
    return {
      x: Math.max(0, Math.min(imageDims.w, (clientX - rect.left) * xRatio)),
      y: Math.max(0, Math.min(imageDims.h, (clientY - rect.top) * yRatio)),
    };
  };

  // Crop drag state
  const [cropDrag, setCropDrag] = useState(null); // { handle, startCrop }

  const startCropDrag = (handle) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCropDrag({ handle, startCrop: { ...crop } });
  };

  useEffect(() => {
    if (!cropDrag) return;
    const move = (e) => {
      const { x, y } = eventToImageCoords(e);
      setCrop(prev => {
        const next = { ...prev };
        const min = 20; // min size in image pixels
        if (cropDrag.handle.includes('l')) {
          const newX = Math.min(x, prev.x + prev.w - min);
          next.w = prev.w + (prev.x - newX);
          next.x = newX;
        }
        if (cropDrag.handle.includes('r')) {
          next.w = Math.max(min, x - prev.x);
        }
        if (cropDrag.handle.includes('t')) {
          const newY = Math.min(y, prev.y + prev.h - min);
          next.h = prev.h + (prev.y - newY);
          next.y = newY;
        }
        if (cropDrag.handle.includes('b')) {
          next.h = Math.max(min, y - prev.y);
        }
        return next;
      });
    };
    const end = () => setCropDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [cropDrag, imageDims]);

  // Add split line at click position
  const handleSplitTap = (e) => {
    if (mode !== 'split') return;
    const y = eventToImageY(e);
    // Avoid duplicates within 20px in image coords
    if (splits.some(s => Math.abs(s - y) < 20)) return;
    setSplits([...splits, y].sort((a, b) => a - b));
  };

  const removeSplit = (index) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  // Render image to canvas with given crop region, return data URL
  const renderRegion = (sx, sy, sw, sh) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas to blob failed'));
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = imageDataUrl;
    });
  };

  // Compute the final pieces to upload (crop applied, then split if any)
  const computePieces = async () => {
    if (isPdf) return [pdfDataUrl];
    if (!imageDataUrl || !crop) return [];

    const sx = Math.round(crop.x);
    const sy = Math.round(crop.y);
    const sw = Math.round(crop.w);
    const sh = Math.round(crop.h);

    if (splits.length === 0) {
      const piece = await renderRegion(sx, sy, sw, sh);
      return [piece];
    }

    // Splits are y values in image coords. Filter to those inside the crop.
    const insideSplits = splits
      .filter(s => s > crop.y && s < crop.y + crop.h)
      .sort((a, b) => a - b);

    const ranges = [];
    let prevY = crop.y;
    for (const s of insideSplits) {
      ranges.push({ y: prevY, h: s - prevY });
      prevY = s;
    }
    ranges.push({ y: prevY, h: crop.y + crop.h - prevY });

    const pieces = [];
    for (const r of ranges) {
      const piece = await renderRegion(sx, Math.round(r.y), sw, Math.round(r.h));
      pieces.push(piece);
    }
    return pieces;
  };

  const handleUpload = async () => {
    if (!token) return;
    setErrorMsg('');
    setStage('uploading');
    try {
      const pieces = await computePieces();
      if (pieces.length === 0) {
        throw new Error('Nothing to upload');
      }
      setTotalToUpload(pieces.length);
      setUploadedCount(0);
      for (let i = 0; i < pieces.length; i++) {
        const res = await fetch(`${API_BASE}/expenses/mobile-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, image: pieces[i] }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }
        setUploadedCount(i + 1);
      }
      setStage('done');
    } catch (err) {
      setErrorMsg(err.message);
      setStage('edit');
    }
  };

  const reset = () => {
    setStage('capture');
    setImageDataUrl(null);
    setPdfDataUrl(null);
    setIsPdf(false);
    setCrop(null);
    setSplits([]);
    setErrorMsg('');
    setUploadedCount(0);
    setTotalToUpload(0);
  };

  // Helpers to convert image coords to display rect coords (for overlay)
  const displayRect = imgRef.current?.getBoundingClientRect();
  const dw = displayRect?.width || 0;
  const dh = displayRect?.height || 0;
  const xScale = dw / imageDims.w;
  const yScale = dh / imageDims.h;

  if (stage === 'done') {
    return (
      <div className="mobile-upload-page">
        <div className="mobile-upload-card success-card">
          <FaCheck className="success-icon" />
          <h2>Receipt{totalToUpload > 1 ? 's' : ''} Uploaded</h2>
          <p>
            {totalToUpload > 1
              ? `${totalToUpload} sections sent to the desktop. They'll appear separately.`
              : 'Your receipt has been sent to the desktop.'}
          </p>
          <button onClick={reset} className="mobile-upload-btn">Upload Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-upload-page">
      <div className="mobile-upload-card">
        <h2>Upload Receipt</h2>

        {!token && errorMsg && <div className="mobile-error">{errorMsg}</div>}

        {token && stage === 'capture' && (
          <>
            <p>Take a photo or choose an existing image to upload as an expense receipt.</p>
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
            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {token && stage === 'edit' && isPdf && (
          <>
            <div className="mobile-pdf-badge">PDF ready to upload</div>
            <div className="mobile-preview-actions">
              <button onClick={handleUpload} className="mobile-upload-btn">
                <FaUpload /> Upload PDF
              </button>
              <button onClick={reset} className="mobile-retake-btn">Retake</button>
            </div>
            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {token && stage === 'edit' && !isPdf && imageDataUrl && (
          <>
            <div className="editor-mode-tabs">
              <button
                className={`editor-tab ${mode === 'crop' ? 'active' : ''}`}
                onClick={() => setMode('crop')}
              >
                <FaCrop /> Crop
              </button>
              <button
                className={`editor-tab ${mode === 'split' ? 'active' : ''}`}
                onClick={() => setMode('split')}
              >
                <FaCut /> Split
              </button>
            </div>

            <div className="editor-hint">
              {mode === 'crop'
                ? 'Drag the corners to crop the receipt.'
                : `Tap on the image to add a split line (${splits.length} added). Each section uploads as a separate receipt.`}
            </div>

            <div className="editor-canvas" ref={containerRef}>
              <img
                ref={imgRef}
                src={imageDataUrl}
                alt="Receipt"
                className="editor-image"
                onClick={mode === 'split' ? handleSplitTap : undefined}
                onTouchStart={mode === 'split' ? handleSplitTap : undefined}
                draggable={false}
              />
              {/* Crop overlay */}
              {mode === 'crop' && crop && imageDims.w > 0 && (
                <>
                  <div className="crop-mask crop-mask-top" style={{ height: `${crop.y * yScale}px` }} />
                  <div className="crop-mask crop-mask-bottom" style={{ top: `${(crop.y + crop.h) * yScale}px`, height: `${(imageDims.h - crop.y - crop.h) * yScale}px` }} />
                  <div className="crop-mask crop-mask-left" style={{ top: `${crop.y * yScale}px`, height: `${crop.h * yScale}px`, width: `${crop.x * xScale}px` }} />
                  <div className="crop-mask crop-mask-right" style={{ top: `${crop.y * yScale}px`, height: `${crop.h * yScale}px`, left: `${(crop.x + crop.w) * xScale}px`, width: `${(imageDims.w - crop.x - crop.w) * xScale}px` }} />
                  <div
                    className="crop-box"
                    style={{
                      left: `${crop.x * xScale}px`,
                      top: `${crop.y * yScale}px`,
                      width: `${crop.w * xScale}px`,
                      height: `${crop.h * yScale}px`,
                    }}
                  >
                    <div className="crop-handle tl" onMouseDown={startCropDrag('tl')} onTouchStart={startCropDrag('tl')} />
                    <div className="crop-handle tr" onMouseDown={startCropDrag('tr')} onTouchStart={startCropDrag('tr')} />
                    <div className="crop-handle bl" onMouseDown={startCropDrag('bl')} onTouchStart={startCropDrag('bl')} />
                    <div className="crop-handle br" onMouseDown={startCropDrag('br')} onTouchStart={startCropDrag('br')} />
                  </div>
                </>
              )}
              {/* Split lines */}
              {mode === 'split' && splits.map((s, i) => (
                <div
                  key={i}
                  className="split-line"
                  style={{ top: `${s * yScale}px` }}
                  onClick={(e) => { e.stopPropagation(); removeSplit(i); }}
                >
                  <span className="split-label">Tap to remove</span>
                </div>
              ))}
            </div>

            <div className="editor-actions">
              {mode === 'split' && splits.length > 0 && (
                <button className="mobile-retake-btn" onClick={() => setSplits([])}>
                  <FaUndo /> Clear splits
                </button>
              )}
              {mode === 'crop' && (
                <button className="mobile-retake-btn" onClick={() => setCrop({ x: 0, y: 0, w: imageDims.w, h: imageDims.h })}>
                  <FaUndo /> Reset crop
                </button>
              )}
              <button onClick={handleUpload} className="mobile-upload-btn">
                <FaUpload /> Upload {splits.length > 0 ? `(${splits.length + 1} pieces)` : ''}
              </button>
              <button onClick={reset} className="mobile-retake-btn">Retake</button>
            </div>

            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {token && stage === 'uploading' && (
          <div className="mobile-uploading">
            <div className="mobile-uploading-spinner" />
            <p>
              {totalToUpload > 1
                ? `Uploading ${uploadedCount + 1} of ${totalToUpload}…`
                : 'Uploading…'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MobileReceiptUpload;
