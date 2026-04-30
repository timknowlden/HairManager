import { useState, useEffect, useRef } from 'react';
import {
  FaCamera, FaCheck, FaCrop, FaCut, FaUpload, FaUndo, FaPlus,
  FaTrash, FaArrowUp, FaArrowDown, FaSyncAlt, FaPencilAlt
} from 'react-icons/fa';
import './MobileReceiptUpload.css';
import { API_BASE } from '../config.js';

function MobileReceiptUpload() {
  const [token, setToken] = useState(null);
  const [stage, setStage] = useState('capture'); // capture | preview | edit | uploading | done
  const [errorMsg, setErrorMsg] = useState('');

  // PDF (bypass photo flow)
  const [isPdf, setIsPdf] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);

  // Photo collection — every photo the user has captured. The preview view
  // shows them stacked. From here they can add more, edit each, or upload.
  const [photos, setPhotos] = useState([]); // [{ dataUrl, w, h }]

  // Index of the photo currently being edited (rotate/crop/split). null when not editing.
  const [editingIndex, setEditingIndex] = useState(null);

  // Edit-stage state (when editing a single photo)
  const [editMode, setEditMode] = useState('crop'); // crop | split
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState(null);
  const [splits, setSplits] = useState([]);

  // Upload progress
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);

  const imgRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
    else setErrorMsg('No upload token provided. Please scan the QR code from the Expenses page.');
  }, []);

  // Read a file → { dataUrl, w, h }
  const readImageFile = (file) => new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('File must be under 8MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      const img = new Image();
      img.onload = () => resolve({ dataUrl: url, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = url;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

  // Add a photo to the collection
  const addPhoto = async (file) => {
    if (!file) return;
    setErrorMsg('');

    if (file.type === 'application/pdf') {
      if (file.size > 8 * 1024 * 1024) {
        setErrorMsg('File must be under 8MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setIsPdf(true);
        setPdfDataUrl(reader.result);
        setPhotos([]); // PDF mode is exclusive
        setStage('preview');
      };
      reader.readAsDataURL(file);
      return;
    }

    try {
      const photo = await readImageFile(file);
      setPhotos(prev => [...prev, photo]);
      setIsPdf(false);
      setPdfDataUrl(null);
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Remove / reorder
  const removePhoto = (index) => {
    setPhotos(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
  };

  const movePhoto = (index, direction) => {
    setPhotos(prev => {
      const next = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  // Rotate a photo 90° clockwise (in place)
  const rotatePhoto = async (index) => {
    const p = photos[index];
    if (!p) return;
    const rotated = await rotateImage(p.dataUrl, p.w, p.h);
    setPhotos(prev => prev.map((ph, i) => (i === index ? rotated : ph)));
  };

  const rotateImage = (dataUrl, w, h) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = h;
      canvas.height = w;
      const ctx = canvas.getContext('2d');
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Rotate failed'));
        const r = new FileReader();
        r.onload = () => resolve({ dataUrl: r.result, w: h, h: w });
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.9);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });

  // Open the editor (crop/split) for a specific photo
  const startEditingPhoto = (index) => {
    const p = photos[index];
    if (!p) return;
    setEditingIndex(index);
    setImageDataUrl(p.dataUrl);
    setImageDims({ w: p.w, h: p.h });
    setCrop({ x: 0, y: 0, w: p.w, h: p.h });
    setSplits([]);
    const ratio = p.h / p.w;
    setEditMode(ratio > 2.2 ? 'split' : 'crop');
    setStage('edit');
  };

  // Save changes from the editor back to the photo (or split into multiple photos)
  const saveEditor = async () => {
    if (editingIndex == null) return;
    const sx = Math.round(crop.x);
    const sy = Math.round(crop.y);
    const sw = Math.round(crop.w);
    const sh = Math.round(crop.h);

    try {
      if (splits.length === 0) {
        // Crop only — replace this photo
        const cropped = await renderRegionFromUrl(imageDataUrl, sx, sy, sw, sh);
        setPhotos(prev => prev.map((p, i) => (i === editingIndex ? cropped : p)));
      } else {
        // Crop + split — replace this photo with N photos
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
          const piece = await renderRegionFromUrl(imageDataUrl, sx, Math.round(r.y), sw, Math.round(r.h));
          pieces.push(piece);
        }

        // Replace the editing photo with the pieces
        setPhotos(prev => {
          const next = [...prev];
          next.splice(editingIndex, 1, ...pieces);
          return next;
        });
      }

      // Return to preview
      setEditingIndex(null);
      setImageDataUrl(null);
      setSplits([]);
      setCrop(null);
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const cancelEditor = () => {
    setEditingIndex(null);
    setImageDataUrl(null);
    setCrop(null);
    setSplits([]);
    setErrorMsg('');
    setStage('preview');
  };

  // Render a sub-region of an image as a new photo object
  const renderRegionFromUrl = (sourceUrl, sx, sy, sw, sh) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Crop failed'));
        const r = new FileReader();
        r.onload = () => resolve({ dataUrl: r.result, w: sw, h: sh });
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = sourceUrl;
  });

  // Stitch multiple photos vertically into one
  const stitchPhotos = async (photoList) => {
    if (photoList.length === 1) return photoList[0].dataUrl;
    const imgs = await Promise.all(photoList.map(p => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = p.dataUrl;
    })));
    const canvasW = Math.max(...imgs.map(i => i.naturalWidth));
    const scaledHeights = imgs.map(i => Math.round(i.naturalHeight * (canvasW / i.naturalWidth)));
    const canvasH = scaledHeights.reduce((s, h) => s + h, 0);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasW, canvasH);
    let y = 0;
    for (let i = 0; i < imgs.length; i++) {
      ctx.drawImage(imgs[i], 0, y, canvasW, scaledHeights[i]);
      y += scaledHeights[i];
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Stitch failed'));
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    });
  };

  // ── Editor: crop drag handlers ──
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

  const [cropDrag, setCropDrag] = useState(null);

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
        const min = 20;
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

  const handleSplitTap = (e) => {
    if (editMode !== 'split') return;
    const y = eventToImageY(e);
    if (splits.some(s => Math.abs(s - y) < 20)) return;
    setSplits([...splits, y].sort((a, b) => a - b));
  };

  const removeSplit = (index) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  // Upload all photos. Multi-photo → stitch into one. PDF → upload directly.
  const handleUpload = async () => {
    if (!token) return;
    setErrorMsg('');
    setStage('uploading');

    try {
      if (isPdf && pdfDataUrl) {
        setTotalToUpload(1);
        setUploadedCount(0);
        const res = await fetch(`${API_BASE}/expenses/mobile-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, image: pdfDataUrl }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }
        setUploadedCount(1);
        setStage('done');
        return;
      }

      if (photos.length === 0) {
        throw new Error('No photos to upload');
      }

      // Multi-photo: stitch into a single receipt image
      const finalDataUrl = await stitchPhotos(photos);
      setTotalToUpload(1);
      setUploadedCount(0);
      const res = await fetch(`${API_BASE}/expenses/mobile-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, image: finalDataUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      setUploadedCount(1);
      setStage('done');
    } catch (err) {
      setErrorMsg(err.message);
      setStage('preview');
    }
  };

  const reset = () => {
    setStage('capture');
    setPhotos([]);
    setIsPdf(false);
    setPdfDataUrl(null);
    setEditingIndex(null);
    setImageDataUrl(null);
    setCrop(null);
    setSplits([]);
    setErrorMsg('');
    setUploadedCount(0);
    setTotalToUpload(0);
  };

  // Editor display geometry
  const displayRect = imgRef.current?.getBoundingClientRect();
  const dw = displayRect?.width || 0;
  const dh = displayRect?.height || 0;
  const xScale = imageDims.w ? dw / imageDims.w : 0;
  const yScale = imageDims.h ? dh / imageDims.h : 0;

  if (stage === 'done') {
    return (
      <div className="mobile-upload-page">
        <div className="mobile-upload-card success-card">
          <FaCheck className="success-icon" />
          <h2>Receipt Uploaded</h2>
          <p>Your receipt has been sent to the desktop.</p>
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

        {/* CAPTURE — first entry point */}
        {token && stage === 'capture' && (
          <>
            <p>Take a photo or choose an existing image.</p>
            <div className="mobile-capture-area">
              <label className="mobile-capture-btn">
                <FaCamera />
                <span>Take Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => addPhoto(e.target.files[0])}
                />
              </label>
              <label className="mobile-browse-btn">
                Choose from gallery
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => addPhoto(e.target.files[0])}
                />
              </label>
            </div>
            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {/* PREVIEW — after first photo, with Add / Edit / Upload */}
        {token && stage === 'preview' && (
          <>
            {isPdf ? (
              <>
                <div className="mobile-pdf-badge">PDF ready to upload</div>
                <div className="mobile-preview-actions">
                  <button onClick={handleUpload} className="mobile-upload-btn">
                    <FaUpload /> Upload PDF
                  </button>
                  <button onClick={reset} className="mobile-retake-btn">Retake</button>
                </div>
              </>
            ) : (
              <>
                <p className="preview-hint">
                  {photos.length === 1 ? 'Preview your photo, then upload or add another.' : `${photos.length} photos — they'll be stitched into one receipt.`}
                </p>

                <div className="photo-list">
                  {photos.map((photo, i) => (
                    <div key={i} className="photo-item">
                      <img src={photo.dataUrl} alt={`Photo ${i + 1}`} className="photo-preview-img" />
                      <div className="photo-controls">
                        <span className="photo-num">{i + 1}</span>
                        <div className="photo-control-buttons">
                          {photos.length > 1 && (
                            <>
                              <button
                                type="button"
                                className="photo-icon-btn"
                                disabled={i === 0}
                                onClick={() => movePhoto(i, 'up')}
                                title="Move up"
                              >
                                <FaArrowUp />
                              </button>
                              <button
                                type="button"
                                className="photo-icon-btn"
                                disabled={i === photos.length - 1}
                                onClick={() => movePhoto(i, 'down')}
                                title="Move down"
                              >
                                <FaArrowDown />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="photo-icon-btn"
                            onClick={() => rotatePhoto(i)}
                            title="Rotate 90°"
                          >
                            <FaSyncAlt />
                          </button>
                          <button
                            type="button"
                            className="photo-icon-btn"
                            onClick={() => startEditingPhoto(i)}
                            title="Crop / split"
                          >
                            <FaCrop />
                          </button>
                          <button
                            type="button"
                            className="photo-icon-btn danger"
                            onClick={() => removePhoto(i)}
                            title="Remove"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mobile-capture-area" style={{ marginTop: 16 }}>
                  <label className="mobile-browse-btn">
                    <FaPlus style={{ marginRight: 6 }} /> Add another photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => addPhoto(e.target.files[0])}
                    />
                  </label>
                </div>

                <div className="mobile-preview-actions" style={{ marginTop: 16 }}>
                  <button
                    onClick={handleUpload}
                    className="mobile-upload-btn"
                    disabled={photos.length === 0}
                  >
                    <FaUpload /> Upload {photos.length > 1 ? `(stitched from ${photos.length})` : ''}
                  </button>
                  <button onClick={reset} className="mobile-retake-btn">Start over</button>
                </div>
              </>
            )}

            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {/* EDIT — crop / split a single photo */}
        {token && stage === 'edit' && imageDataUrl && (
          <>
            <div className="editor-mode-tabs">
              <button
                className={`editor-tab ${editMode === 'crop' ? 'active' : ''}`}
                onClick={() => setEditMode('crop')}
              >
                <FaCrop /> Crop
              </button>
              <button
                className={`editor-tab ${editMode === 'split' ? 'active' : ''}`}
                onClick={() => setEditMode('split')}
              >
                <FaCut /> Split
              </button>
            </div>

            <div className="editor-hint">
              {editMode === 'crop'
                ? 'Drag the corners to crop the photo.'
                : `Tap on the image to add a split line (${splits.length} added). Splitting creates separate photos in the preview.`}
            </div>

            <div className="editor-canvas">
              <img
                ref={imgRef}
                src={imageDataUrl}
                alt="Editing"
                className="editor-image"
                onClick={editMode === 'split' ? handleSplitTap : undefined}
                onTouchStart={editMode === 'split' ? handleSplitTap : undefined}
                draggable={false}
              />
              {editMode === 'crop' && crop && imageDims.w > 0 && (
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
              {editMode === 'split' && splits.map((s, i) => (
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
              {editMode === 'split' && splits.length > 0 && (
                <button className="mobile-retake-btn" onClick={() => setSplits([])}>
                  <FaUndo /> Clear splits
                </button>
              )}
              {editMode === 'crop' && (
                <button className="mobile-retake-btn" onClick={() => setCrop({ x: 0, y: 0, w: imageDims.w, h: imageDims.h })}>
                  <FaUndo /> Reset crop
                </button>
              )}
              <button onClick={saveEditor} className="mobile-upload-btn">
                <FaCheck /> Done
              </button>
              <button onClick={cancelEditor} className="mobile-retake-btn">Cancel</button>
            </div>

            {errorMsg && <div className="mobile-error">{errorMsg}</div>}
          </>
        )}

        {token && stage === 'uploading' && (
          <div className="mobile-uploading">
            <div className="mobile-uploading-spinner" />
            <p>Uploading…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MobileReceiptUpload;
