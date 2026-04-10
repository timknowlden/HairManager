import { useState, useEffect, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import './PricelistModal.css';

const CATEGORIES = ['Hair', 'Children', 'Nails'];

function PricelistModal({ isOpen, onClose, services }) {
  const { getAuthHeaders } = useAuth();
  const [profile, setProfile] = useState(null);
  const [selected, setSelected] = useState({});
  const [categories, setCategories] = useState({});
  const [priceOffset, setPriceOffset] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [generating, setGenerating] = useState(false);

  // Fetch profile when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch(`${API_BASE}/profile`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => {
          setProfile(data);
          setEmailSubject(`Pricelist from ${data.business_name || 'us'}`);
        })
        .catch(() => {});
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isOpen]);

  // Initialise selection and categories when services change
  useEffect(() => {
    if (services.length > 0 && Object.keys(selected).length === 0) {
      const sel = {};
      const cats = {};
      services.forEach(s => {
        sel[s.id] = true;
        cats[s.id] = /child/i.test(s.service_name) ? 'Children' : (s.type || 'Hair');
      });
      setSelected(sel);
      setCategories(cats);
    }
  }, [services]);

  // Group selected services by category
  const grouped = useMemo(() => {
    const groups = { Hair: [], Children: [], Nails: [] };
    services.forEach(s => {
      if (!selected[s.id]) return;
      const cat = categories[s.id] || s.type || 'Hair';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [services, selected, categories]);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = selectedCount === services.length;

  const toggleAll = () => {
    const val = !allSelected;
    const sel = {};
    services.forEach(s => { sel[s.id] = val; });
    setSelected(sel);
  };

  const applyPrice = (price) => Math.max(0, price + (parseFloat(priceOffset) || 0));

  const sym = profile?.currency === 'USD' ? '$' : profile?.currency === 'EUR' ? '\u20AC' : '\u00A3';

  // --- PDF Generation (matches Kate's Cuts template) ---
  const generatePDF = useCallback(() => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageH = 297;
    const marginL = 18;
    const sideColX = 140; // where the right column starts
    const teal = [76, 175, 147]; // accent colour from template
    const dark = [51, 51, 51];
    const pSym = profile?.currency === 'USD' ? '$' : profile?.currency === 'EUR' ? '\u20AC' : '\u00A3';
    const businessName = profile?.business_name || 'Pricelist';

    let y = 35;

    // ── BUSINESS NAME (huge, stacked, two-tone like the template) ──
    // Split business name into two lines for stacked display.
    // Handles: "Kate's Cuts", "KatesCuts", "KatesCut", "HairByJane", single words
    let topLine, bottomLine;
    const spaceWords = businessName.trim().split(/\s+/);
    if (spaceWords.length >= 2) {
      // Has spaces: e.g. "Kate's Cuts" → "KATE'S" / "CUTS"
      topLine = spaceWords.slice(0, -1).join(' ').toUpperCase();
      bottomLine = spaceWords[spaceWords.length - 1].toUpperCase();
    } else {
      // Single word — split on camelCase boundary: "KatesCuts" → "Kates" / "Cuts"
      const camelParts = businessName.split(/(?=[A-Z])/).filter(Boolean);
      if (camelParts.length >= 2) {
        topLine = camelParts.slice(0, -1).join('').toUpperCase();
        bottomLine = camelParts[camelParts.length - 1].toUpperCase();
        // Add apostrophe if top line looks like a possessive (ends in S)
        if (topLine.endsWith('S') && !topLine.endsWith("'S")) {
          topLine = topLine.slice(0, -1) + "'S";
        }
      } else {
        topLine = businessName.toUpperCase();
        bottomLine = null;
      }
    }

    doc.setFont('helvetica', 'bold');

    if (bottomLine) {
      doc.setFontSize(72);
      doc.setTextColor(...dark);
      doc.text(topLine, marginL, y);
      y += 22;

      doc.setFontSize(72);
      doc.setTextColor(...teal);
      doc.text(bottomLine, marginL, y);
      y += 28;
    } else {
      doc.setFontSize(72);
      doc.setTextColor(...dark);
      doc.text(topLine, marginL, y);
      y += 28;
    }

    // ── SERVICE CATEGORIES ──
    const renderCategory = (catName, catServices) => {
      if (!catServices || catServices.length === 0) return;
      if (y + 12 + catServices.length * 7 > pageH - 15) { doc.addPage(); y = 25; }

      // Category header — small bold teal
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...teal);
      doc.text(catName.toUpperCase(), marginL, y);
      y += 6;

      // Service rows — large bold name with small teal price
      catServices.forEach(s => {
        if (y > pageH - 15) { doc.addPage(); y = 25; }

        // Service name in large bold dark
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...dark);
        doc.text(s.service_name, marginL, y);

        // Price in smaller teal, positioned right after the name
        const nameW = doc.getTextWidth(s.service_name);
        const price = applyPrice(s.price);
        const priceStr = `${pSym}${Number.isInteger(price) ? price : price.toFixed(2)}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...teal);
        doc.text(priceStr, marginL + nameW + 2, y);

        y += 7;
      });
      y += 5;
    };

    CATEGORIES.forEach(cat => renderCategory(cat, grouped[cat]));

    // ── RIGHT COLUMN: FEATURE BADGES ──
    let sideY = 38;
    const badges = [
      'FULLY\nQUALIFIED\nHAIR STYLIST\nAND NAIL\nTECHNICIAN',
      'MOBILE\nSERVICE',
      'FULLY\nINSURED',
      'FRIENDLY\nSERVICE',
      'YEARS OF\nEXPERIENCE',
    ];

    doc.setFont('helvetica', 'bold');
    badges.forEach(badge => {
      const lines = badge.split('\n');
      doc.setFontSize(18);
      doc.setTextColor(...dark);
      lines.forEach(line => {
        doc.text(line, sideColX, sideY);
        sideY += 8;
      });
      sideY += 10;
    });

    // ── BOOKING ──
    sideY += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...dark);
    doc.text('BOOKING', sideColX, sideY);
    sideY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...teal);
    const website = profile?.website || 'KATESCUTS.CO.UK';
    doc.text(website.toUpperCase(), sideColX, sideY);
    sideY += 14;

    // ── GET IN TOUCH ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...teal);
    doc.text('GET IN', sideColX, sideY);
    sideY += 8;
    doc.text('TOUCH', sideColX, sideY);
    sideY += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    if (profile?.phone) { doc.text(profile.phone, sideColX, sideY); sideY += 6; }
    if (profile?.email) { doc.text(profile.email, sideColX, sideY); sideY += 6; }

    // Price offset note
    const offset = parseFloat(priceOffset) || 0;
    if (offset !== 0) {
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`* Prices include ${offset > 0 ? '+' : ''}${pSym}${offset.toFixed(2)} adjustment`, marginL, pageH - 12);
    }

    return doc;
  }, [grouped, profile, priceOffset]);

  // Preview
  const handlePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const doc = generatePDF();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
  };

  const handleDownload = () => {
    setGenerating(true);
    try {
      const doc = generatePDF();
      const name = profile?.business_name?.replace(/\s+/g, '_') || 'Pricelist';
      doc.save(`${name}_Pricelist.pdf`);
    } catch (err) {
      alert('Error generating PDF: ' + err.message);
    }
    setGenerating(false);
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) { alert('Please enter a recipient email'); return; }
    setGenerating(true);
    try {
      const doc = generatePDF();
      const blob = doc.output('blob');
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        const name = profile?.business_name?.replace(/\s+/g, '_') || 'Pricelist';
        let body = emailMessage || 'Please find our latest pricelist attached.';
        if (profile?.signature_on_invoice !== 0 && profile?.signature_on_invoice !== false
            && profile?.email_signature && profile.email_signature.trim()) {
          body += '<br><br>' + profile.email_signature.trim();
        }
        try {
          const response = await fetch(`${API_BASE}/invoice/send-email`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: emailTo.split(/[;,]/).map(e => e.trim()).filter(Boolean),
              subject: emailSubject || `Pricelist from ${profile?.business_name || 'us'}`,
              body,
              pdfData: base64data,
              pdfFilename: `${name}_Pricelist.pdf`,
              invoiceNumber: `PL-${new Date().toISOString().slice(0, 10)}`
            })
          });
          if (response.ok) {
            alert(`Pricelist sent to ${emailTo}`);
            setShowEmail(false);
          } else {
            const err = await response.json();
            alert('Failed to send: ' + (err.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Error sending email: ' + err.message);
        }
        setGenerating(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      alert('Error generating PDF: ' + err.message);
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pricelist-page">
      {/* Header bar */}
      <div className="pricelist-header">
        <h2>Pricelist Generator</h2>
        <div className="pricelist-header-actions">
          <button className="btn-back" onClick={onClose}>&larr; Back to Services</button>
          <button className="btn-preview" onClick={handlePreview} disabled={selectedCount === 0}>
            Preview
          </button>
          <button className="btn-download" onClick={handleDownload} disabled={generating || selectedCount === 0}>
            {generating ? 'Generating...' : 'Download PDF'}
          </button>
          {!showEmail ? (
            <button className="btn-email" onClick={() => setShowEmail(true)} disabled={selectedCount === 0}>
              Email Pricelist
            </button>
          ) : (
            <button className="btn-email" onClick={handleSendEmail} disabled={generating || selectedCount === 0}>
              {generating ? 'Sending...' : 'Send Email'}
            </button>
          )}
        </div>
      </div>

      <div className="pricelist-body">
        {/* Left panel: service selection */}
        <div className="pricelist-panel">
          <div className="pricelist-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} id="pl-select-all" />
            <label htmlFor="pl-select-all">
              {allSelected ? 'Deselect All' : 'Select All'} ({selectedCount}/{services.length})
            </label>
          </div>

          {CATEGORIES.map(cat => {
            const catServices = services.filter(s => categories[s.id] === cat);
            if (catServices.length === 0) return null;
            return (
              <div key={cat} className="pricelist-category">
                <h4>{cat}</h4>
                {catServices.map(s => (
                  <div key={s.id} className="pricelist-service-row">
                    <input
                      type="checkbox"
                      checked={!!selected[s.id]}
                      onChange={() => setSelected(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                    />
                    <span className="pricelist-service-name">{s.service_name}</span>
                    <span className="pricelist-service-price">{sym}{applyPrice(s.price).toFixed(2)}</span>
                    <select
                      className="pricelist-service-category"
                      value={categories[s.id] || s.type}
                      onChange={e => setCategories(prev => ({ ...prev, [s.id]: e.target.value }))}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Options */}
          <div className="pricelist-options">
            <h4>Options</h4>
            <div className="pricelist-option-row">
              <label>Price offset:</label>
              <input
                type="number"
                step="0.50"
                value={priceOffset}
                onChange={e => setPriceOffset(e.target.value)}
                placeholder="0"
              />
              <span className="hint">e.g. 2 or -1.50</span>
            </div>
          </div>

          {/* Email fields */}
          {showEmail && (
            <div className="pricelist-email-section">
              <label>To:</label>
              <input
                type="email"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="email@example.com (commas for multiple)"
              />
              <label>Subject:</label>
              <input
                type="text"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
              />
              <label>Message:</label>
              <textarea
                value={emailMessage}
                onChange={e => setEmailMessage(e.target.value)}
                placeholder="Please find our latest pricelist attached."
              />
            </div>
          )}
        </div>

        {/* Right panel: preview */}
        <div className="pricelist-preview">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Pricelist Preview"
              width="595"
              height="842"
            />
          ) : (
            <div className="pricelist-preview-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Select services and click <strong>Preview</strong> to see your pricelist
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PricelistModal;
