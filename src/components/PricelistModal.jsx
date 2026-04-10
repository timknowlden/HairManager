import { useState, useEffect, useMemo } from 'react';
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
  }, [isOpen]);

  // Initialise selection and categories when services change
  useEffect(() => {
    if (services.length > 0 && Object.keys(selected).length === 0) {
      const sel = {};
      const cats = {};
      services.forEach(s => {
        sel[s.id] = true;
        // Auto-detect children services
        if (/child/i.test(s.service_name)) {
          cats[s.id] = 'Children';
        } else {
          cats[s.id] = s.type || 'Hair';
        }
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

  const applyPrice = (price) => {
    const result = price + (parseFloat(priceOffset) || 0);
    return Math.max(0, result);
  };

  // --- PDF Generation ---
  const generatePDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = 210;
    const pageH = 297;
    const marginL = 20;
    const marginR = 20;
    const contentW = pageW - marginL - marginR;
    const mainColW = contentW * 0.6;
    const sideColX = marginL + mainColW + 10;
    const sideColW = contentW - mainColW - 10;
    const sym = profile?.currency === 'USD' ? '$' : profile?.currency === 'EUR' ? '\u20AC' : '\u00A3';

    const businessName = profile?.business_name || 'Pricelist';
    const description = profile?.business_service_description || '';

    let y = 30;

    // --- Business name ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(51, 51, 51);
    // Split business name into words for two-tone styling
    const nameParts = businessName.toUpperCase().split(' ');
    if (nameParts.length >= 2) {
      // First part in dark, rest in accent colour
      doc.setTextColor(51, 51, 51);
      doc.text(nameParts[0], marginL, y);
      const firstWidth = doc.getTextWidth(nameParts[0] + ' ');
      doc.setTextColor(76, 175, 147); // teal accent
      doc.text(nameParts.slice(1).join(' '), marginL + firstWidth, y);
    } else {
      doc.text(businessName.toUpperCase(), marginL, y);
    }
    y += 12;

    // --- Description ---
    if (description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(description, marginL, y);
      y += 10;
    }

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(marginL, y, marginL + mainColW, y);
    y += 8;

    // --- Service categories ---
    const renderCategory = (catName, catServices) => {
      if (!catServices || catServices.length === 0) return;

      // Check if we need a new page
      const estimatedHeight = 12 + catServices.length * 8;
      if (y + estimatedHeight > pageH - 30) {
        doc.addPage();
        y = 25;
      }

      // Category header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(76, 175, 147);
      doc.text(catName.toUpperCase(), marginL, y);
      y += 2;
      doc.setDrawColor(76, 175, 147);
      doc.setLineWidth(0.8);
      doc.line(marginL, y, marginL + 30, y);
      y += 7;

      // Service rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      catServices.forEach(s => {
        if (y > pageH - 25) {
          doc.addPage();
          y = 25;
        }
        doc.setTextColor(51, 51, 51);
        doc.text(s.service_name, marginL + 2, y);
        const priceStr = `${sym}${applyPrice(s.price).toFixed(2)}`;
        doc.setTextColor(100, 100, 100);
        doc.text(priceStr, marginL + mainColW - 5, y, { align: 'right' });
        y += 7.5;
      });
      y += 5;
    };

    CATEGORIES.forEach(cat => renderCategory(cat, grouped[cat]));

    // --- Sidebar badges ---
    let sideY = 45;
    const badges = [
      'FULLY QUALIFIED',
      'MOBILE SERVICE',
      'FULLY INSURED',
      'FRIENDLY SERVICE',
      'YEARS OF EXPERIENCE',
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    badges.forEach(badge => {
      doc.setTextColor(51, 51, 51);
      const lines = doc.splitTextToSize(badge, sideColW);
      lines.forEach(line => {
        doc.text(line, sideColX, sideY);
        sideY += 6;
      });
      sideY += 8;
    });

    // Booking section
    sideY += 5;
    doc.setFontSize(12);
    doc.setTextColor(76, 175, 147);
    doc.text('BOOKING', sideColX, sideY);
    sideY += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (profile?.website) {
      doc.text(profile.website.toUpperCase(), sideColX, sideY);
      sideY += 6;
    }

    // Contact section
    sideY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(76, 175, 147);
    doc.text('GET IN TOUCH', sideColX, sideY);
    sideY += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (profile?.phone) {
      doc.text(profile.phone, sideColX, sideY);
      sideY += 6;
    }
    if (profile?.email) {
      doc.text(profile.email, sideColX, sideY);
      sideY += 6;
    }

    // Price offset note
    const offset = parseFloat(priceOffset) || 0;
    if (offset !== 0) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`* Prices include ${offset > 0 ? '+' : ''}${sym}${offset.toFixed(2)} adjustment`, marginL, pageH - 15);
    }

    return doc;
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

        // Build email body with optional signature
        let body = emailMessage || `Please find our latest pricelist attached.`;
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
    <div className="pricelist-overlay" onClick={onClose}>
      <div className="pricelist-modal" onClick={e => e.stopPropagation()}>
        <h3>
          Generate Pricelist
          <button onClick={onClose}>&times;</button>
        </h3>

        {/* Select all */}
        <div className="pricelist-select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} id="pl-select-all" />
          <label htmlFor="pl-select-all">
            {allSelected ? 'Deselect All' : 'Select All'} ({selectedCount}/{services.length})
          </label>
        </div>

        {/* Service list grouped by DB type */}
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
                  <span className="pricelist-service-price">
                    {(profile?.currency === 'USD' ? '$' : profile?.currency === 'EUR' ? '\u20AC' : '\u00A3')}{applyPrice(s.price).toFixed(2)}
                  </span>
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

        {/* Also show uncategorised services */}
        {services.filter(s => !CATEGORIES.includes(categories[s.id])).length > 0 && (
          <div className="pricelist-category">
            <h4>Other</h4>
            {services.filter(s => !CATEGORIES.includes(categories[s.id])).map(s => (
              <div key={s.id} className="pricelist-service-row">
                <input
                  type="checkbox"
                  checked={!!selected[s.id]}
                  onChange={() => setSelected(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                />
                <span className="pricelist-service-name">{s.service_name}</span>
                <span className="pricelist-service-price">
                  {'\u00A3'}{applyPrice(s.price).toFixed(2)}
                </span>
                <select
                  className="pricelist-service-category"
                  value={categories[s.id] || 'Hair'}
                  onChange={e => setCategories(prev => ({ ...prev, [s.id]: e.target.value }))}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

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

        {/* Email section (toggle) */}
        {showEmail && (
          <div className="pricelist-email-section">
            <label>To:</label>
            <input
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              placeholder="email@example.com (separate multiple with commas)"
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

        {/* Actions */}
        <div className="pricelist-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="btn-download"
            onClick={handleDownload}
            disabled={generating || selectedCount === 0}
          >
            {generating ? 'Generating...' : 'Download PDF'}
          </button>
          {!showEmail ? (
            <button
              className="btn-email"
              onClick={() => setShowEmail(true)}
              disabled={selectedCount === 0}
            >
              Email Pricelist
            </button>
          ) : (
            <button
              className="btn-email"
              onClick={handleSendEmail}
              disabled={generating || selectedCount === 0}
            >
              {generating ? 'Sending...' : 'Send Email'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PricelistModal;
