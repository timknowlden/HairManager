import { useState, useEffect, useRef } from 'react';
import {
  FaCamera, FaCheck, FaCrop, FaCut, FaUpload, FaUndo, FaPlus,
  FaTrash, FaArrowUp, FaArrowDown, FaSyncAlt, FaPencilAlt
} from 'react-icons/fa';
import './MobileReceiptUpload.css';
import { API_BASE } from '../config.js';

function MobileReceiptUpload() {
  const [token, setToken] = useState(null);
  const [stage, setStage] = useState('capture'); // capture | preview | edit | ghostCamera | uploading | done
  const [errorMsg, setErrorMsg] = useState('');

  // Ghost camera state — when continuing a multi-photo capture
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);
  // Pre-rendered ghost: bottom 25% of the previous photo, cropped to match
  // the camera viewport's 3:4 aspect so it represents the actual overlap region
  const [ghostImageUrl, setGhostImageUrl] = useState(null);

  // PDF (bypass photo flow)
  const [isPdf, setIsPdf] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);

  // Photo collection — every photo the user has captured. The preview view
  // shows them stacked. From here they can add more, edit each, or upload.
  // overlap: how many image-space pixels this photo overlaps the previous one
  // (0 for the first photo; default 0 for newly added). Negative is not allowed.
  // rotation: fractional degrees (-5 to +5) for skew fine-tuning.
  const [photos, setPhotos] = useState([]); // [{ dataUrl, w, h, overlap, rotation }]
  // Live preview of stitched result (data URL) and stitched canvas dims
  const [stitchedPreview, setStitchedPreview] = useState(null);
  const [stitchedDims, setStitchedDims] = useState({ w: 0, h: 0, slices: [] });

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
      // Default the new photo's overlap to ~25% of its height so the seam
      // starts in a useful position to drag (rather than touching the top edge).
      setPhotos(prev => {
        const defaultOverlap = prev.length === 0 ? 0 : Math.round(photo.h * 0.25);
        return [...prev, { ...photo, overlap: defaultOverlap, rotation: 0 }];
      });
      setIsPdf(false);
      setPdfDataUrl(null);
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Adjust the overlap (in image-space pixels) for a photo
  const setPhotoOverlap = (index, overlap) => {
    setPhotos(prev => prev.map((p, i) => {
      if (i !== index) return p;
      // Clamp to 0..(photo height - 20)
      const clamped = Math.max(0, Math.min(p.h - 20, Math.round(overlap)));
      return { ...p, overlap: clamped };
    }));
  };

  // Adjust the fine rotation (degrees) for a photo
  const setPhotoRotation = (index, rotation) => {
    setPhotos(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const clamped = Math.max(-5, Math.min(5, rotation));
      return { ...p, rotation: clamped };
    }));
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

  // Stitch multiple photos vertically into one, honouring per-photo overlap
  // and fine rotation. Returns { dataUrl, w, h, slices } — slices contains
  // each photo's starting Y position in the canvas (used for drag-to-align).
  const stitchPhotos = async (photoList) => {
    if (photoList.length === 1) {
      return { dataUrl: photoList[0].dataUrl, w: photoList[0].w, h: photoList[0].h, slices: [{ y: 0, h: photoList[0].h }] };
    }
    const imgs = await Promise.all(photoList.map(p => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = p.dataUrl;
    })));
    const canvasW = Math.max(...imgs.map(i => i.naturalWidth));

    // Compute scaled height contribution for each photo, accounting for overlap
    const slices = imgs.map((img, i) => {
      const scale = canvasW / img.naturalWidth;
      const overlap = i === 0 ? 0 : (photoList[i].overlap || 0);
      const sourceHeight = Math.max(20, img.naturalHeight - overlap);
      return {
        img,
        rotation: photoList[i].rotation || 0,
        scaledW: canvasW,
        scaledH: Math.round(sourceHeight * scale),
        sourceY: overlap,
        sourceHeight,
      };
    });
    const canvasH = slices.reduce((s, x) => s + x.scaledH, 0);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasW, canvasH);

    let y = 0;
    const slicePositions = [];
    for (const s of slices) {
      slicePositions.push({ y, h: s.scaledH });
      if (Math.abs(s.rotation) > 0.01) {
        // Rotate around the slice's centre
        ctx.save();
        const cx = canvasW / 2;
        const cy = y + s.scaledH / 2;
        ctx.translate(cx, cy);
        ctx.rotate((s.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
        ctx.drawImage(
          s.img,
          0, s.sourceY, s.img.naturalWidth, s.sourceHeight,
          0, y, canvasW, s.scaledH
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          s.img,
          0, s.sourceY, s.img.naturalWidth, s.sourceHeight,
          0, y, canvasW, s.scaledH
        );
      }
      y += s.scaledH;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Stitch failed'));
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    });
    return { dataUrl, w: canvasW, h: canvasH, slices: slicePositions };
  };

  // Live stitched preview — recompute when photos / overlaps / rotations change
  useEffect(() => {
    if (stage !== 'preview' || isPdf || photos.length < 2) {
      setStitchedPreview(null);
      setStitchedDims({ w: 0, h: 0, slices: [] });
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const result = await stitchPhotos(photos);
        if (!cancelled) {
          setStitchedPreview(result.dataUrl);
          setStitchedDims({ w: result.w, h: result.h, slices: result.slices });
        }
      } catch (err) {
        if (!cancelled) setStitchedPreview(null);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, stage, isPdf]);

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
      const stitched = await stitchPhotos(photos);
      const finalDataUrl = stitched.dataUrl;
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

  // Pre-render the ghost overlay: bottom 25% of the previous photo, cropped to
  // a 3:4 aspect ratio so it matches the camera viewport. The visible region
  // in the camera = the area the new photo's top 25% will overlap.
  const buildGhostOverlay = (lastPhoto) => new Promise((resolve, reject) => {
    if (!lastPhoto) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const overlapH = Math.round(img.naturalHeight * 0.25); // bottom 25%
      const sourceY = img.naturalHeight - overlapH;
      const visibleAspect = 3 / 4; // matches camera viewport
      // The ghost should occupy the top 25% of the camera (3:4 viewport).
      // Camera viewport: aspect 3:4. Top 25% region: aspect 3 / (4 * 0.25) = 3/1 = 3:1
      const ghostBoxAspect = 3 / 1; // width / height for the visible overlay area
      // Source crop: from the bottom 25% of the previous photo, we need a
      // strip of aspect 3:1 (matching where it'll appear in the camera).
      const sourceAspect = img.naturalWidth / overlapH;
      let cropX, cropY, cropW, cropH;
      if (sourceAspect > ghostBoxAspect) {
        // Source is wider than target box — crop sides
        cropH = overlapH;
        cropW = Math.round(overlapH * ghostBoxAspect);
        cropX = Math.round((img.naturalWidth - cropW) / 2);
        cropY = sourceY;
      } else {
        // Source is narrower — crop top of the source slice
        cropW = img.naturalWidth;
        cropH = Math.round(img.naturalWidth / ghostBoxAspect);
        cropX = 0;
        cropY = sourceY + (overlapH - cropH); // align to bottom
      }
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Ghost build failed'));
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.9);
    };
    img.onerror = reject;
    img.src = lastPhoto.dataUrl;
  });

  // Start the ghost camera with rear camera. Cleans up any existing stream first.
  const startGhostCamera = async () => {
    setErrorMsg('');
    try {
      // Pre-render the ghost from the previous photo
      const lastPhoto = photos[photos.length - 1];
      const ghostUrl = await buildGhostOverlay(lastPhoto);
      setGhostImageUrl(ghostUrl);

      // Stop any existing stream
      if (stream) stream.getTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      setStream(newStream);
      setStage('ghostCamera');
    } catch (err) {
      setErrorMsg('Could not access camera: ' + err.message);
    }
  };

  // Bind the stream to the video element when both are ready
  useEffect(() => {
    if (stage === 'ghostCamera' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stage, stream]);

  // Stop camera when leaving ghost stage or unmounting
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture a frame from the video stream, cropping to match what the user sees
  // (the container has aspect-ratio 3/4 and the video uses object-fit:cover, so
  // parts of the camera frame are hidden — capture must reflect that).
  const captureGhostPhoto = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    try {
      const fullW = video.videoWidth;
      const fullH = video.videoHeight;

      // Visible aspect = 3/4 (matches CSS .ghost-camera aspect-ratio: 3/4)
      const visibleAspect = 3 / 4; // width / height
      const cameraAspect = fullW / fullH;

      // object-fit: cover centres the video and crops the overflow
      let sx, sy, sw, sh;
      if (cameraAspect > visibleAspect) {
        // Camera is wider than viewport: crop sides
        sh = fullH;
        sw = Math.round(fullH * visibleAspect);
        sx = Math.round((fullW - sw) / 2);
        sy = 0;
      } else {
        // Camera is taller than viewport: crop top/bottom
        sw = fullW;
        sh = Math.round(fullW / visibleAspect);
        sx = 0;
        sy = Math.round((fullH - sh) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Capture failed'));
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(blob);
        }, 'image/jpeg', 0.9);
      });
      // Add to photos with default overlap = 25% of new photo's height,
      // matching the ghost overlay's clip region. If the user aligned the
      // overlay correctly, the stitch is already accurate with no dragging.
      setPhotos(prev => {
        const defaultOverlap = prev.length === 0 ? 0 : Math.round(sh * 0.25);
        return [...prev, { dataUrl, w: sw, h: sh, overlap: defaultOverlap, rotation: 0 }];
      });
      stopCamera();
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const reset = () => {
    stopCamera();
    setStage('capture');
    setPhotos([]);
    setIsPdf(false);
    setPdfDataUrl(null);
    setEditingIndex(null);
    setImageDataUrl(null);
    setCrop(null);
    setSplits([]);
    setGhostImageUrl(null);
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
                      {/* Fine rotation slider — for skew correction */}
                      <div className="photo-rotation-row">
                        <label>Skew:</label>
                        <input
                          type="range"
                          min="-5"
                          max="5"
                          step="0.1"
                          value={photo.rotation || 0}
                          onChange={(e) => setPhotoRotation(i, parseFloat(e.target.value))}
                        />
                        <span className="photo-rotation-value">
                          {(photo.rotation || 0).toFixed(1)}°
                        </span>
                        {Math.abs(photo.rotation || 0) > 0.05 && (
                          <button
                            type="button"
                            className="photo-icon-btn small"
                            onClick={() => setPhotoRotation(i, 0)}
                            title="Reset skew"
                          >
                            <FaUndo />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Interactive stitched preview — drag photo seams to align */}
                {photos.length > 1 && stitchedPreview && (
                  <div className="stitched-preview-section">
                    <div className="stitched-preview-header">
                      Stitched preview — drag the seam handles to align overlapping content
                    </div>
                    <StitchedPreview
                      previewUrl={stitchedPreview}
                      photos={photos}
                      stitchedDims={stitchedDims}
                      onOverlapChange={setPhotoOverlap}
                    />
                  </div>
                )}

                <div className="mobile-capture-area" style={{ marginTop: 16 }}>
                  <button type="button" className="mobile-capture-btn" onClick={startGhostCamera}>
                    <FaCamera />
                    <span>Add another (with ghost overlay)</span>
                  </button>
                  <label className="mobile-browse-btn">
                    <FaPlus style={{ marginRight: 6 }} /> Or pick from gallery
                    <input
                      type="file"
                      accept="image/*"
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

        {token && stage === 'ghostCamera' && (
          <>
            <p className="preview-hint">
              Line up your shot so the ghost area at the top matches the previous photo. When aligned, the photos will stitch together automatically.
            </p>
            <div className="ghost-camera">
              <video ref={videoRef} className="ghost-video" playsInline muted />
              {ghostImageUrl && (
                <div className="ghost-overlay-wrap" style={{ opacity: ghostOpacity }}>
                  <img src={ghostImageUrl} alt="Previous bottom" className="ghost-overlay-img" />
                </div>
              )}
            </div>
              <div className="ghost-camera-controls">
                <label className="ghost-opacity-control">
                  Ghost opacity
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={ghostOpacity}
                    onChange={(e) => setGhostOpacity(parseFloat(e.target.value))}
                  />
                </label>
              </div>
              <div className="mobile-preview-actions">
                <button onClick={captureGhostPhoto} className="mobile-upload-btn">
                  <FaCamera /> Capture
                </button>
                <button onClick={() => { stopCamera(); setStage('preview'); }} className="mobile-retake-btn">
                  Cancel
                </button>
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

// Interactive stitched preview — drag seam handles between photos to set
// the overlap on each photo. The seam's position in the canvas tells us
// where photo i+1 starts; dragging it changes photo[i+1].overlap.
function StitchedPreview({ previewUrl, photos, stitchedDims, onOverlapChange }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { photoIndex, startClientY, startOverlap }

  // Compute the on-screen Y of each seam (between photo i-1 and i, for i>=1)
  const seams = [];
  if (stitchedDims.slices && stitchedDims.slices.length > 1) {
    for (let i = 1; i < stitchedDims.slices.length; i++) {
      seams.push({ photoIndex: i, canvasY: stitchedDims.slices[i].y });
    }
  }

  const startDrag = (photoIndex) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDrag({
      photoIndex,
      startClientY: clientY,
      startOverlap: photos[photoIndex].overlap || 0,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaScreen = clientY - drag.startClientY;
      // Convert screen delta to image-space delta for that photo
      const img = imgRef.current;
      const canvasH = stitchedDims.h;
      if (!img || !canvasH) return;
      const screenH = img.getBoundingClientRect().height;
      const photoH = photos[drag.photoIndex].h;
      const photoScale = photos[drag.photoIndex].w
        ? stitchedDims.w / photos[drag.photoIndex].w
        : 1;
      // Screen delta → canvas delta → photo image-space delta
      const canvasDelta = (deltaScreen / screenH) * canvasH;
      const imgDelta = canvasDelta / photoScale;
      // Dragging UP (negative deltaScreen) increases overlap (photo moves up)
      const newOverlap = drag.startOverlap - imgDelta;
      onOverlapChange(drag.photoIndex, newOverlap);
    };
    const end = () => setDrag(null);
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
  }, [drag, stitchedDims, photos, onOverlapChange]);

  // Convert canvas Y to display-rect Y
  const displayRect = imgRef.current?.getBoundingClientRect();
  const yScale = stitchedDims.h && displayRect ? displayRect.height / stitchedDims.h : 0;

  return (
    <div className="stitch-canvas" ref={containerRef}>
      <img
        ref={imgRef}
        src={previewUrl}
        alt="Stitched preview"
        className="stitched-preview-img"
        draggable={false}
      />
      {seams.map((s) => (
        <div
          key={s.photoIndex}
          className="seam-handle"
          style={{ top: `${s.canvasY * yScale}px` }}
          onMouseDown={startDrag(s.photoIndex)}
          onTouchStart={startDrag(s.photoIndex)}
        >
          <div className="seam-handle-line" />
          <div className="seam-handle-grip">
            <FaArrowUp /><FaArrowDown />
          </div>
        </div>
      ))}
    </div>
  );
}

export default MobileReceiptUpload;
