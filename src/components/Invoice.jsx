import { useState, useEffect, useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { useAuth } from '../contexts/AuthContext';
import './Invoice.css';

const API_BASE = 'http://localhost:3001/api';

function Invoice({ appointments: propsAppointments, onBack }) {
  const { getAuthHeaders } = useAuth();
  const [profileSettings, setProfileSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [locationDetails, setLocationDetails] = useState({ name: '', address: '', email: '', emails: [] });
  const invoiceRef = useRef(null);

  useEffect(() => {
    // Get invoice data from props or localStorage
    const appointments = propsAppointments || 
      JSON.parse(localStorage.getItem('invoiceAppointments') || '[]');
    
    if (appointments.length === 0) {
      if (onBack) onBack();
      return;
    }

    setInvoiceData({
      appointments,
      invoiceNumber: appointments[0]?.id || '',
      invoiceDate: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    });

    fetchProfileSettings();
    fetchLocationDetails(appointments[0]?.location);
  }, [propsAppointments, onBack]);

  const fetchProfileSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/profile`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setProfileSettings(data);
      }
    } catch (err) {
      console.error('Error fetching profile settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatSortCode = (sortCode) => {
    if (!sortCode) return '';
    const cleaned = sortCode.replace(/\D/g, '');
    if (cleaned.length === 6) {
      return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)}`;
    }
    return sortCode;
  };

  const calculateTotal = () => {
    if (!invoiceData) return 0;
    return invoiceData.appointments.reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
  };

  const fetchLocationDetails = async (locationName) => {
    if (!locationName) {
      setLocationDetails({ name: '', address: '', email: '', emails: [] });
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/locations`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const locations = await response.json();
        const location = locations.find(loc => loc.location_name === locationName);
        if (location) {
          const addressParts = [
            location.address,
            location.city_town,
            location.post_code
          ].filter(Boolean);
          
          // Handle email arrays
          const emails = Array.isArray(location.email_address) 
            ? location.email_address 
            : (location.email_address ? [location.email_address] : []);
          const firstEmail = emails.length > 0 ? emails[0] : '';
          
          setLocationDetails({
            name: location.location_name,
            address: addressParts.join(', '),
            email: firstEmail, // Keep for backward compatibility
            emails: emails
          });
        } else {
          setLocationDetails({
            name: locationName,
            address: locationName,
            email: '',
            emails: []
          });
        }
      }
    } catch (err) {
      console.error('Error fetching location details:', err);
      setLocationDetails({
        name: locationName,
        address: locationName,
        email: '',
        emails: []
      });
    }
  };

  const formatCurrency = (amount) => {
    const currency = profileSettings?.currency || 'GBP';
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
    return `${symbol} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleExportPDF = () => {
    if (!invoiceRef.current || !invoiceData || !profileSettings) return;

    const element = invoiceRef.current;
    const businessName = profileSettings.business_name || profileSettings.name || 'Kates_Cuts';
    const locationName = locationDetails.name || 'Location';
    const filename = `Invoice_${invoiceData.invoiceNumber}_${businessName.replace(/\s+/g, '_')}_${locationName.replace(/\s+/g, '_')}.pdf`;

    // Temporarily apply print-like constraints to the element
    const originalStyles = {
      width: element.style.width,
      height: element.style.height,
      maxHeight: element.style.maxHeight,
      padding: element.style.padding,
      margin: element.style.margin,
      position: element.style.position
    };

    // Set exact dimensions for PDF capture
    element.style.width = '210mm';
    element.style.height = '257mm';
    element.style.maxHeight = '257mm';
    element.style.padding = '20mm';
    element.style.margin = '0';
    element.style.position = 'relative';
    element.style.overflow = 'hidden';

    const opt = {
      margin: [0, 0, 0, 0],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794, // 210mm at 96 DPI ≈ 794px
        height: 970, // 257mm at 96 DPI ≈ 970px
        windowWidth: 794,
        windowHeight: 970
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait',
        compress: true
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      // Restore original styles
      element.style.width = originalStyles.width;
      element.style.height = originalStyles.height;
      element.style.maxHeight = originalStyles.maxHeight;
      element.style.padding = originalStyles.padding;
      element.style.margin = originalStyles.margin;
      element.style.position = originalStyles.position;
      element.style.overflow = '';
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenEmailApp = () => {
    const emails = locationDetails.emails.length > 0 
      ? locationDetails.emails 
      : (locationDetails.email ? [locationDetails.email] : []);
    
    if (emails.length === 0) {
      alert('No email address found for this location');
      return;
    }

    // Create mailto link with all emails
    const mailtoLink = `mailto:${emails.join(',')}`;
    window.location.href = mailtoLink;
  };

  const handleEmailInvoice = async () => {
    const emailToUse = locationDetails.emails.length > 0 
      ? locationDetails.emails[0] 
      : locationDetails.email;
    
    if (!emailToUse) {
      alert('No email address found for this location');
      return;
    }

    if (!invoiceRef.current || !invoiceData || !profileSettings) {
      alert('Invoice data not ready');
      return;
    }

    try {
      // Generate PDF first
      const element = invoiceRef.current;
      const businessName = profileSettings.business_name || profileSettings.name || 'Kates_Cuts';
      const locationName = locationDetails.name || 'Location';
      const filename = `Invoice_${invoiceData.invoiceNumber}_${businessName.replace(/\s+/g, '_')}_${locationName.replace(/\s+/g, '_')}.pdf`;

      // Apply temporary styles for PDF generation
      const originalStyles = {
        width: element.style.width,
        height: element.style.height,
        maxHeight: element.style.maxHeight,
        padding: element.style.padding,
        margin: element.style.margin,
        position: element.style.position
      };

      element.style.width = '210mm';
      element.style.height = '257mm';
      element.style.maxHeight = '257mm';
      element.style.padding = '20mm';
      element.style.margin = '0';
      element.style.position = 'relative';
      element.style.overflow = 'hidden';

      const opt = {
        margin: [0, 0, 0, 0],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 794,
          height: 970,
          windowWidth: 794,
          windowHeight: 970
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // Generate PDF as blob
      const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');

      // Restore original styles
      element.style.width = originalStyles.width;
      element.style.height = originalStyles.height;
      element.style.maxHeight = originalStyles.maxHeight;
      element.style.padding = originalStyles.padding;
      element.style.margin = originalStyles.margin;
      element.style.position = originalStyles.position;
      element.style.overflow = '';

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];

        // Build email body with default content and signature
        let emailBody = profileSettings.default_email_content || `Please find attached invoice ${invoiceData.invoiceNumber} for services provided.`;
        
        // Replace {invoiceNumber} placeholder if present (works for both HTML and plain text)
        // Tiptap stores content as HTML, so handle various encodings and HTML tag structures
        const invoiceNum = String(invoiceData.invoiceNumber || '');
        
        if (!invoiceNum) {
          console.error('Invoice number is missing!', invoiceData);
          alert('Warning: Invoice number is missing. The {invoiceNumber} placeholder will not be replaced.');
        }
        
        // Store original for debugging
        const originalEmailBody = emailBody;
        
        // Try multiple replacement patterns to handle different encodings
        // 1. Plain text version (most common) - use global flag to replace all instances
        emailBody = emailBody.replace(/{invoiceNumber}/g, invoiceNum);
        
        // 2. HTML entity encoded braces: { = &#123; and } = &#125;
        emailBody = emailBody.replace(/&#123;invoiceNumber&#125;/g, invoiceNum);
        
        // 3. Double-encoded HTML entities
        emailBody = emailBody.replace(/&amp;#123;invoiceNumber&amp;#125;/g, invoiceNum);
        
        // 4. Escaped regex version (just in case)
        emailBody = emailBody.replace(/\{invoiceNumber\}/g, invoiceNum);
        
        // 5. Handle case where placeholder might be split or in different HTML structures
        // Replace even if it's inside HTML tags like <p>{invoiceNumber}</p> or <strong>{invoiceNumber}</strong>
        emailBody = emailBody.replace(/(<[^>]*>)?\{invoiceNumber\}(<\/[^>]*>)?/gi, (match, openTag, closeTag) => {
          return (openTag || '') + invoiceNum + (closeTag || '');
        });
        
        // Debug: Log if replacement didn't work
        if (emailBody.includes('{invoiceNumber}')) {
          console.error('Invoice number replacement failed!');
          console.error('Invoice number value:', invoiceNum);
          console.error('Original email content:', originalEmailBody);
          console.error('Email body after replacement:', emailBody);
          // Try one more time with a more aggressive approach - replace any occurrence
          emailBody = emailBody.split('{invoiceNumber}').join(invoiceNum);
        }
        
        // Append signature if configured
        if (profileSettings.email_signature && profileSettings.email_signature.trim()) {
          // If email body is HTML (contains HTML tags), append signature as HTML
          // Otherwise append as plain text with line breaks
          const isHtml = emailBody.includes('<') && emailBody.includes('>');
          if (isHtml) {
            emailBody += '<br><br>' + profileSettings.email_signature.trim();
          } else {
            emailBody += '\n\n' + profileSettings.email_signature.trim();
          }
        }

        // Send to backend
        const response = await fetch(`${API_BASE}/invoice/send-email`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailToUse,
            subject: `Invoice ${invoiceData.invoiceNumber} from ${businessName}`,
            body: emailBody,
            pdfData: base64data,
            pdfFilename: filename
          })
        });

        if (response.ok) {
          alert('Invoice email sent successfully!');
        } else {
          const error = await response.json();
          let errorMsg = `Failed to send email: ${error.error || 'Unknown error'}`;
          
          // Add suggestions if provided
          if (error.suggestions && error.suggestions.length > 0) {
            errorMsg += '\n\n' + error.suggestions.join('\n');
          }
          
          // Add details if available
          if (error.details && error.details !== error.error) {
            errorMsg += `\n\nDetails: ${error.details}`;
          }
          
          alert(errorMsg);
        }
      };
      reader.readAsDataURL(pdfBlob);
    } catch (error) {
      console.error('Error sending invoice email:', error);
      alert(`Error sending email: ${error.message}`);
    }
  };

  if (loading || !invoiceData || !profileSettings) {
    return <div className="invoice-loading">Loading invoice...</div>;
  }

  const total = calculateTotal();
  const businessName = profileSettings.business_name || profileSettings.name || 'Kates Cuts';

  return (
    <div className="invoice-container">
      <div className="invoice-actions">
        {onBack && (
          <button onClick={onBack} className="invoice-back-btn">
            <span>←</span>
            <span>Back to Appointments</span>
          </button>
        )}
        {(locationDetails.email || locationDetails.emails.length > 0) && (
          <>
            <button 
              onClick={handleEmailInvoice}
              className="invoice-email-btn"
            >
              <span>📧</span>
              <span>Email Invoice</span>
            </button>
            <button 
              onClick={handleOpenEmailApp}
              className="invoice-email-app-btn"
              title="Open email app with location email(s)"
            >
              <span>📬</span>
              <span>Open Email App</span>
            </button>
          </>
        )}
        <button onClick={handlePrint} className="invoice-print-btn">
          <span>🖨️</span>
          <span>Print</span>
        </button>
        <button onClick={handleExportPDF} className="invoice-pdf-btn">
          <span>📄</span>
          <span>Export to PDF</span>
        </button>
      </div>
      <div className="invoice-page" ref={invoiceRef}>
        <div className="invoice-header">
          <div className="invoice-company-info">
            <div className="company-name">{businessName}</div>
            <div className="company-service">
              {profileSettings.business_service_description || 'Mobile Hairdresser and Nail Technician'}
            </div>
            <div className="company-address">
              {profileSettings.home_address || ''}
              {profileSettings.home_address && profileSettings.home_postcode ? ', ' : ''}
              {profileSettings.home_postcode || ''}
            </div>
            <div className="company-phone">{profileSettings.phone || ''}</div>
            <div className="company-contact">
              {profileSettings.email || ''} {profileSettings.email && profileSettings.website ? '|' : ''} {profileSettings.website ? `www.${profileSettings.website.replace(/^https?:\/\//, '').replace(/^www\./, '')}` : ''}
            </div>
          </div>
          <div className="invoice-details">
            <div className="invoice-title">INVOICE</div>
            <div className="invoice-number-row">
              <span className="invoice-label">INVOICE NUMBER</span>
              <span className="invoice-value">{invoiceData.invoiceNumber}</span>
            </div>
            <div className="invoice-date-row">
              <span className="invoice-label">INVOICE DATE</span>
              <span className="invoice-value">{invoiceData.invoiceDate}</span>
            </div>
          </div>
        </div>

        <div className="invoice-client-section">
          <div className="invoice-to-section">
            <div className="section-label">TO</div>
            <div className="client-name">{locationDetails.name}</div>
            <div className="client-address">{locationDetails.address}</div>
          </div>
          <div className="invoice-for-section">
            <div className="section-label">FOR</div>
            <div className="service-type">Hairdressing or Nail Services</div>
          </div>
        </div>

        <table className="invoice-services-table">
          <thead>
            <tr>
              <th className="service-description-col">Service Description</th>
              <th className="service-date-col">Date of Service</th>
              <th className="service-amount-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoiceData.appointments.map((apt, index) => (
              <tr key={apt.id || index}>
                <td className="service-description-col">
                  {apt.client_name} - {apt.service}
                </td>
                <td className="service-date-col">{formatDate(apt.date)}</td>
                <td className="service-amount-col">{formatCurrency(apt.price || 0)}</td>
              </tr>
            ))}
            <tr className="invoice-total-row">
              <td colSpan="2" className="total-label">Total</td>
              <td className="total-amount">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-footer">
          <div className="payment-instructions">
            <div>Make all checks payable to {businessName}</div>
            <div>Payment is due within 30 days.</div>
            <div className="bacs-details">
              BACS: {profileSettings.bank_account_name || 'Katescuts'} - Mettle – 
              account number: {profileSettings.account_number || ''} – 
              sort code: {formatSortCode(profileSettings.sort_code || '')}
            </div>
            <div>Please use Invoice Number or Client Name as Reference</div>
            <div className="contact-info">
              If you have any questions concerning this invoice, contact<br />
              {profileSettings.name || 'Katie Knowlden'} | {profileSettings.phone || ''} | {profileSettings.email || ''}
            </div>
            <div className="thank-you">Thank you for your business!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Invoice;

