import { useState, useEffect, useRef, useMemo } from 'react';
import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useAuth } from '../contexts/AuthContext';
import './Invoice.css';

import { API_BASE } from '../config.js';

function Invoice({ appointments: propsAppointments, onBack }) {
  const { getAuthHeaders } = useAuth();
  const [profileSettings, setProfileSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [locationDetails, setLocationDetails] = useState({ name: '', address: '', email: '', emails: [] });
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const invoiceRef = useRef(null);

  useEffect(() => {
    // Get invoice data from props or localStorage
    const appointments = propsAppointments || 
      JSON.parse(localStorage.getItem('invoiceAppointments') || '[]');
    
    if (appointments.length === 0) {
      if (onBack) onBack();
      return;
    }

    // Get visit date from first appointment (all appointments should have the same date)
    const visitDate = appointments[0]?.date 
      ? new Date(appointments[0].date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });

    setInvoiceData({
      appointments,
      invoiceNumber: appointments[0]?.id || '',
      invoiceDate: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      visitDate: visitDate
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

  // Split appointments into pages (12 per page for A4, leaving room for sub-total)
  const APPOINTMENTS_PER_PAGE = 12;
  const appointmentPages = useMemo(() => {
    if (!invoiceData?.appointments) return [];
    const pages = [];
    const appointments = invoiceData.appointments;
    for (let i = 0; i < appointments.length; i += APPOINTMENTS_PER_PAGE) {
      pages.push(appointments.slice(i, i + APPOINTMENTS_PER_PAGE));
    }
    return pages;
  }, [invoiceData?.appointments]);

  const handleExportPDF = async () => {
    if (!invoiceRef.current || !invoiceData || !profileSettings) return;

    const element = invoiceRef.current;
    const businessName = profileSettings.business_name || profileSettings.name || 'HairManager';
    const locationName = locationDetails.name || 'Location';
    const filename = `Invoice_${invoiceData.invoiceNumber}_${businessName.replace(/\s+/g, '_')}_${locationName.replace(/\s+/g, '_')}.pdf`;

    // Get all invoice pages (or use the element itself if it's the invoice page)
    let pages = element.querySelectorAll('.invoice-page');
    
    // If no pages found inside, check if element itself is the invoice page
    if (pages.length === 0 && element.classList.contains('invoice-page')) {
      pages = [element];
    } else if (pages.length === 0) {
      alert('No invoice pages found');
      return;
    }

    try {
      // Create new PDF using jsPDF
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true
      });

      // Process each page and add to PDF
      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i];
        
        // Add a new page for each invoice page (except the first)
        if (i > 0) {
          pdf.addPage();
        }
        
        // Small delay to ensure page is fully rendered and CSS is applied
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Convert page to canvas
        // Add options to handle CSS parsing errors
        // Suppress browser extension errors (autofill/password managers) that interfere with html2canvas
        const suppressExtensionErrors = () => {
          const unhandledRejectionHandler = (event) => {
            const error = event.reason;
            const errorMessage = error?.message || error?.stack || error?.toString() || '';
            const errorString = String(errorMessage);
            if (
              errorString.includes('bootstrap-autofill-overlay') ||
              (errorString.includes('insertBefore') && errorString.includes('NotFoundError')) ||
              (errorString.includes('Failed to execute') && errorString.includes('insertBefore')) ||
              (errorString.includes('bootstrap-autofill') && errorString.includes('insertBefore'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              return false; // Suppress the error
            }
          };
          
          const errorHandler = (event) => {
            const error = event.error || event;
            const errorMessage = error?.message || error?.stack || error?.toString() || '';
            const errorString = String(errorMessage);
            if (
              errorString.includes('bootstrap-autofill-overlay') ||
              (errorString.includes('insertBefore') && errorString.includes('NotFoundError')) ||
              (errorString.includes('Failed to execute') && errorString.includes('insertBefore')) ||
              (errorString.includes('bootstrap-autofill') && errorString.includes('insertBefore'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              return true; // Suppress the error
            }
          };
          
          window.addEventListener('unhandledrejection', unhandledRejectionHandler);
          window.addEventListener('error', errorHandler, true);
          
          return () => {
            window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
            window.removeEventListener('error', errorHandler, true);
          };
        };
        
        const cleanup = suppressExtensionErrors();
        let canvas;
        try {
          canvas = await html2canvas(pageElement, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            width: pageElement.offsetWidth,
            height: pageElement.offsetHeight,
            foreignObjectRendering: false, // Can help with CSS parsing issues
            onclone: (clonedDoc) => {
              // Fix any CSS issues in the cloned document
              try {
                // Remove any problematic CSS that might cause parsing errors
                const allElements = clonedDoc.querySelectorAll('*');
                allElements.forEach(el => {
                  try {
                    // Fix any invalid or incomplete CSS values
                    const style = el.style;
                    if (style) {
                      // Ensure background color is valid
                      if (style.backgroundColor === '' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                        style.backgroundColor = '#ffffff';
                      }
                      // Remove any CSS variables that might cause issues
                      const bgImage = style.backgroundImage;
                      if (bgImage && bgImage.includes('var(')) {
                        style.backgroundImage = 'none';
                      }
                    }
                  } catch (e) {
                    // Ignore errors when accessing styles
                  }
                });
              } catch (e) {
                console.warn('Error in onclone callback:', e);
            }
          }
        });
        } catch (html2canvasError) {
          // Clean up error suppression even on error
          cleanup();
          // Check if this is a browser extension error (common with autofill/password managers)
          const isExtensionError = html2canvasError.message && (
            html2canvasError.message.includes('insertBefore') ||
            html2canvasError.message.includes('bootstrap-autofill') ||
            html2canvasError.message.includes('NotFoundError')
          );
          
          if (isExtensionError) {
            // Browser extension errors are usually harmless - html2canvas often still works
            console.warn('Browser extension interference detected (this is usually harmless):', html2canvasError.message);
            // Try to continue anyway - sometimes html2canvas still succeeds despite the error
            try {
              // Wait a bit and retry
              await new Promise(resolve => setTimeout(resolve, 200));
              canvas = await html2canvas(pageElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                width: pageElement.offsetWidth,
                height: pageElement.offsetHeight,
                foreignObjectRendering: false
              });
              cleanup();
            } catch (retryError) {
              // If retry also fails, try with simpler options
              console.log('Retrying html2canvas with simpler options...');
              try {
                canvas = await html2canvas(pageElement, {
                  scale: 1.5,
                  useCORS: true,
                  logging: false,
                  backgroundColor: '#ffffff',
                  allowTaint: true,
                  ignoreElements: (element) => {
                    // Ignore elements with problematic CSS
                    return false;
                  }
                });
                cleanup();
              } catch (finalError) {
                cleanup();
                console.error('html2canvas retry also failed:', finalError);
                throw new Error(`Failed to generate PDF page ${i + 1}: ${html2canvasError.message}. Please try again or contact support.`);
              }
            }
          } else {
            // Real error - log and retry
            console.error('html2canvas error:', html2canvasError);
            console.log('Retrying html2canvas with simpler options...');
            try {
              canvas = await html2canvas(pageElement, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                ignoreElements: (element) => {
                  // Ignore elements with problematic CSS
                  return false;
                }
              });
              cleanup();
            } catch (retryError) {
              cleanup();
              console.error('html2canvas retry also failed:', retryError);
              throw new Error(`Failed to generate PDF page ${i + 1}: ${html2canvasError.message}. Please try again or contact support.`);
            }
          }
        }

        // Calculate dimensions for A4
        const imgWidth = 210; // A4 width in mm
        const aspectRatio = canvas.width / canvas.height;
        let finalWidth = imgWidth;
        let finalHeight = imgWidth / aspectRatio;
        
        // Ensure image fits on one page
        const maxPageHeight = 296.5;
        if (finalHeight > maxPageHeight) {
          const scale = maxPageHeight / finalHeight;
          finalHeight = maxPageHeight;
          finalWidth = imgWidth * scale;
        }
        
        // Set page and Y position
        const targetPage = i + 1;
        pdf.setPage(targetPage);
        
        if (pdf.internal && pdf.internal.y !== undefined) {
          pdf.internal.y = 0;
        }
        
        // Add image to PDF
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, finalWidth, finalHeight, undefined, 'FAST');
        
        // Set Y position to bottom of image
        if (pdf.internal && pdf.internal.y !== undefined) {
          pdf.internal.y = finalHeight;
        }
      }

      // Save the PDF
      pdf.save(filename);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF');
      alert('Error exporting PDF: ' + error.message);
    }
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

    if (!invoiceData || !profileSettings) {
      alert('Invoice data not ready');
      return;
    }

    // Build subject same as email invoice function
    const businessName = profileSettings.business_name || profileSettings.name || 'HairManager';
    const subject = `Invoice ${invoiceData.invoiceNumber} from ${businessName}`;

    // Create mailto link with subject only (no body - user will compose their own message)
    const encodedSubject = encodeURIComponent(subject);
    const mailtoLink = `mailto:${emails.join(',')}?subject=${encodedSubject}`;
    window.location.href = mailtoLink;
  };

  const handleEmailInvoice = async () => {
    console.log('=== EMAIL INVOICE FUNCTION CALLED ===');
    console.log('Button clicked - useCustomEmail:', useCustomEmail);
    console.log('Button clicked - customEmail:', customEmail);
    
    // Get all emails - use custom email if enabled, otherwise use location emails
    let allEmails = [];
    
    console.log('=== EMAIL INVOICE DEBUG ===');
    console.log('useCustomEmail:', useCustomEmail);
    console.log('customEmail:', customEmail);
    console.log('customEmail.trim():', customEmail.trim());
    console.log('locationDetails.email:', locationDetails.email);
    console.log('locationDetails.emails:', locationDetails.emails);
    
    // Determine which emails to use
    if (useCustomEmail) {
      // Custom email mode - must have a value
      if (!customEmail || !customEmail.trim()) {
        alert('Please enter a custom email address');
        console.error('Custom email enabled but no email provided');
        return;
      }
      
      // Use custom email
      console.log('Using custom email:', customEmail);
      allEmails = customEmail
        .split(/[;,]/)
        .map(e => e.trim())
        .filter(e => e && e.length > 0);
      console.log('Parsed custom emails:', allEmails);
      
      if (allEmails.length === 0) {
        alert('Please enter a valid custom email address');
        console.error('Custom email provided but parsing resulted in empty array');
        return;
      }
      
      // Validate email format (basic validation)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = allEmails.filter(email => !emailRegex.test(email));
      if (invalidEmails.length > 0) {
        alert(`Invalid email address(es): ${invalidEmails.join(', ')}\nPlease enter a valid email address.`);
        console.error('Invalid email addresses:', invalidEmails);
        return;
      }
    } else {
      // Use location emails
      console.log('Using location emails');
      allEmails = locationDetails.emails.length > 0 
        ? locationDetails.emails 
        : (locationDetails.email ? [locationDetails.email] : []);
      
      // Flatten and split any emails that contain semicolons or commas
      allEmails = allEmails
        .flatMap(email => {
          if (typeof email === 'string') {
            // Split by semicolon or comma, then trim and filter
            return email
              .split(/[;,]/)
              .map(e => e.trim())
              .filter(e => e && e.length > 0);
          }
          return [email];
        })
        .filter((email, index, self) => self.indexOf(email) === index); // Remove duplicates
      console.log('Parsed location emails:', allEmails);
    }
    
    console.log('Final allEmails to send to:', allEmails);
    console.log('=== END EMAIL INVOICE DEBUG ===');
    
    if (allEmails.length === 0) {
      alert(useCustomEmail 
        ? 'Please enter a custom email address' 
        : 'No email address found for this location');
      return;
    }

    if (!invoiceRef.current || !invoiceData || !profileSettings) {
      alert('Invoice data not ready');
      return;
    }

    try {
      // Generate PDF first (using same multi-page method as Export PDF)
      const element = invoiceRef.current;
      const businessName = profileSettings.business_name || profileSettings.name || 'HairManager';
      const locationName = locationDetails.name || 'Location';
      const filename = `Invoice_${invoiceData.invoiceNumber}_${businessName.replace(/\s+/g, '_')}_${locationName.replace(/\s+/g, '_')}.pdf`;

      // Get all invoice pages (or use the element itself if it's the invoice page)
      let pages = element.querySelectorAll('.invoice-page');
      
      // If no pages found inside, check if element itself is the invoice page
      if (pages.length === 0 && element.classList.contains('invoice-page')) {
        pages = [element];
      } else if (pages.length === 0) {
        alert('No invoice pages found');
        return;
      }

      // Create new PDF using jsPDF
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true
      });

      // Process each page and add to PDF
      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i];
        
        // Add a new page for each invoice page (except the first)
        if (i > 0) {
          pdf.addPage();
        }
        
        // Small delay to ensure page is fully rendered and CSS is applied
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Convert page to canvas
        // Add options to handle CSS parsing errors
        // Suppress browser extension errors (autofill/password managers) that interfere with html2canvas
        const suppressExtensionErrors = () => {
          const unhandledRejectionHandler = (event) => {
            const error = event.reason;
            const errorMessage = error?.message || error?.stack || error?.toString() || '';
            const errorString = String(errorMessage);
            if (
              errorString.includes('bootstrap-autofill-overlay') ||
              (errorString.includes('insertBefore') && errorString.includes('NotFoundError')) ||
              (errorString.includes('Failed to execute') && errorString.includes('insertBefore')) ||
              (errorString.includes('bootstrap-autofill') && errorString.includes('insertBefore'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              return false; // Suppress the error
            }
          };
          
          const errorHandler = (event) => {
            const error = event.error || event;
            const errorMessage = error?.message || error?.stack || error?.toString() || '';
            const errorString = String(errorMessage);
            if (
              errorString.includes('bootstrap-autofill-overlay') ||
              (errorString.includes('insertBefore') && errorString.includes('NotFoundError')) ||
              (errorString.includes('Failed to execute') && errorString.includes('insertBefore')) ||
              (errorString.includes('bootstrap-autofill') && errorString.includes('insertBefore'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              return true; // Suppress the error
            }
          };
          
          window.addEventListener('unhandledrejection', unhandledRejectionHandler);
          window.addEventListener('error', errorHandler, true);
          
          return () => {
            window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
            window.removeEventListener('error', errorHandler, true);
          };
        };
        
        const cleanup = suppressExtensionErrors();
        let canvas;
        try {
          canvas = await html2canvas(pageElement, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            width: pageElement.offsetWidth,
            height: pageElement.offsetHeight,
            foreignObjectRendering: false, // Can help with CSS parsing issues
            onclone: (clonedDoc) => {
              // Fix any CSS issues in the cloned document
              try {
                // Remove any problematic CSS that might cause parsing errors
                const allElements = clonedDoc.querySelectorAll('*');
                allElements.forEach(el => {
                  try {
                    // Fix any invalid or incomplete CSS values
                    const style = el.style;
                    if (style) {
                      // Ensure background color is valid
                      if (style.backgroundColor === '' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                        style.backgroundColor = '#ffffff';
                      }
                      // Remove any CSS variables that might cause issues
                      const bgImage = style.backgroundImage;
                      if (bgImage && bgImage.includes('var(')) {
                        style.backgroundImage = 'none';
                      }
                    }
                  } catch (e) {
                    // Ignore errors when accessing styles
                  }
                });
              } catch (e) {
                console.warn('Error in onclone callback:', e);
            }
          }
        });
        } catch (html2canvasError) {
          // Clean up error suppression even on error
          cleanup();
          // Check if this is a browser extension error (common with autofill/password managers)
          const isExtensionError = html2canvasError.message && (
            html2canvasError.message.includes('insertBefore') ||
            html2canvasError.message.includes('bootstrap-autofill') ||
            html2canvasError.message.includes('NotFoundError')
          );
          
          if (isExtensionError) {
            // Browser extension errors are usually harmless - html2canvas often still works
            console.warn('Browser extension interference detected (this is usually harmless):', html2canvasError.message);
            // Try to continue anyway - sometimes html2canvas still succeeds despite the error
            try {
              // Wait a bit and retry
              await new Promise(resolve => setTimeout(resolve, 200));
              canvas = await html2canvas(pageElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                width: pageElement.offsetWidth,
                height: pageElement.offsetHeight,
                foreignObjectRendering: false
              });
              cleanup();
            } catch (retryError) {
              // If retry also fails, try with simpler options
              console.log('Retrying html2canvas with simpler options...');
              try {
                canvas = await html2canvas(pageElement, {
                  scale: 1.5,
                  useCORS: true,
                  logging: false,
                  backgroundColor: '#ffffff',
                  allowTaint: true,
                  ignoreElements: (element) => {
                    // Ignore elements with problematic CSS
                    return false;
                  }
                });
                cleanup();
              } catch (finalError) {
                cleanup();
                console.error('html2canvas retry also failed:', finalError);
                throw new Error(`Failed to generate PDF page ${i + 1}: ${html2canvasError.message}. Please try again or contact support.`);
              }
            }
          } else {
            // Real error - log and retry
            console.error('html2canvas error:', html2canvasError);
            console.log('Retrying html2canvas with simpler options...');
            try {
              canvas = await html2canvas(pageElement, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                ignoreElements: (element) => {
                  // Ignore elements with problematic CSS
                  return false;
                }
              });
              cleanup();
            } catch (retryError) {
              cleanup();
              console.error('html2canvas retry also failed:', retryError);
              throw new Error(`Failed to generate PDF page ${i + 1}: ${html2canvasError.message}. Please try again or contact support.`);
            }
          }
        }

        // Calculate dimensions for A4
        const imgWidth = 210; // A4 width in mm
        const aspectRatio = canvas.width / canvas.height;
        let finalWidth = imgWidth;
        let finalHeight = imgWidth / aspectRatio;
        
        // Ensure image fits on one page
        const maxPageHeight = 296.5;
        if (finalHeight > maxPageHeight) {
          const scale = maxPageHeight / finalHeight;
          finalHeight = maxPageHeight;
          finalWidth = imgWidth * scale;
        }
        
        // Set page and Y position
        const targetPage = i + 1;
        pdf.setPage(targetPage);
        
        if (pdf.internal && pdf.internal.y !== undefined) {
          pdf.internal.y = 0;
        }
        
        // Add image to PDF
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, finalWidth, finalHeight, undefined, 'FAST');
        
        // Set Y position to bottom of image
        if (pdf.internal && pdf.internal.y !== undefined) {
          pdf.internal.y = finalHeight;
        }
      }

      // Generate PDF as blob
      const pdfBlob = pdf.output('blob');

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];

        // Build email body with default content and signature
        let emailBody = profileSettings.default_email_content || `Please find attached invoice ${invoiceData.invoiceNumber} for services provided.`;
        
        // DEBUG: Log the original email body to see what Tiptap stored
        console.log('=== EMAIL BODY REPLACEMENT DEBUG ===');
        console.log('Original emailBody (first 1000 chars):', emailBody.substring(0, 1000));
        console.log('EmailBody includes {invoiceNumber}:', emailBody.includes('{invoiceNumber}'));
        console.log('EmailBody includes {InvoiceNumber}:', emailBody.includes('{InvoiceNumber}'));
        console.log('EmailBody includes {visitDate}:', emailBody.includes('{visitDate}'));
        console.log('EmailBody includes {VisitDate}:', emailBody.includes('{VisitDate}'));
        console.log('EmailBody includes {businessName}:', emailBody.includes('{businessName}'));
        console.log('EmailBody includes {BusinessName}:', emailBody.includes('{BusinessName}'));
        console.log('EmailBody includes HTML entities:', emailBody.includes('&#123;') || emailBody.includes('&#125;'));
        
        // Replace {invoiceNumber} and {InvoiceNumber} placeholders if present (works for both HTML and plain text)
        // Tiptap stores content as HTML, so handle various encodings and HTML tag structures
        const invoiceNum = String(invoiceData.invoiceNumber || '');
        const visitDate = invoiceData.visitDate || '';
        const businessNameValue = businessName || '';
        
        // Replace {businessName} first (simpler, less HTML encoding issues)
        if (businessNameValue) {
          emailBody = emailBody.replace(/\{businessName\}/gi, businessNameValue);
          emailBody = emailBody.replace(/\{BusinessName\}/gi, businessNameValue);
          emailBody = emailBody.replace(/&#123;businessName&#125;/gi, businessNameValue);
          emailBody = emailBody.replace(/&#123;BusinessName&#125;/gi, businessNameValue);
          emailBody = emailBody.replace(/&amp;#123;businessName&amp;#125;/gi, businessNameValue);
          emailBody = emailBody.replace(/&amp;#123;BusinessName&amp;#125;/gi, businessNameValue);
          emailBody = emailBody.replace(/<span[^>]*>\s*\{businessName\}\s*<\/span>/gi, businessNameValue);
          emailBody = emailBody.replace(/<span[^>]*>\s*\{BusinessName\}\s*<\/span>/gi, businessNameValue);
          emailBody = emailBody.replace(/\{<span[^>]*>\s*businessName\s*<\/span>\}/gi, businessNameValue);
          emailBody = emailBody.replace(/\{<span[^>]*>\s*BusinessName\s*<\/span>\}/gi, businessNameValue);
          emailBody = emailBody.split('{businessName}').join(businessNameValue);
          emailBody = emailBody.split('{BusinessName}').join(businessNameValue);
          emailBody = emailBody.split('&#123;businessName&#125;').join(businessNameValue);
          emailBody = emailBody.split('&#123;BusinessName&#125;').join(businessNameValue);
        }
        
        // Replace {visitDate} (simpler, less HTML encoding issues)
        if (visitDate) {
          // Pattern 1: Most common - plain text within HTML tags: <p>Visit on {visitDate}</p>
          emailBody = emailBody.replace(/\{visitDate\}/gi, visitDate);
          emailBody = emailBody.replace(/\{VisitDate\}/gi, visitDate);
          
          // Pattern 2: HTML entity encoded braces
          emailBody = emailBody.replace(/&#123;visitDate&#125;/gi, visitDate);
          emailBody = emailBody.replace(/&#123;VisitDate&#125;/gi, visitDate);
          
          // Pattern 3: Double-encoded HTML entities
          emailBody = emailBody.replace(/&amp;#123;visitDate&amp;#125;/gi, visitDate);
          emailBody = emailBody.replace(/&amp;#123;VisitDate&amp;#125;/gi, visitDate);
          
          // Pattern 4: Handle spans wrapping the placeholder: <span>{visitDate}</span>
          emailBody = emailBody.replace(/<span[^>]*>\s*\{visitDate\}\s*<\/span>/gi, visitDate);
          emailBody = emailBody.replace(/<span[^>]*>\s*\{VisitDate\}\s*<\/span>/gi, visitDate);
          
          // Pattern 4b: Handle braces OUTSIDE span with placeholder text INSIDE: {<span>visitDate</span>}
          emailBody = emailBody.replace(/\{<span[^>]*>\s*visitDate\s*<\/span>\}/gi, visitDate);
          emailBody = emailBody.replace(/\{<span[^>]*>\s*VisitDate\s*<\/span>\}/gi, visitDate);
          
          // Final fallback using split/join
          emailBody = emailBody.split('{visitDate}').join(visitDate);
          emailBody = emailBody.split('{VisitDate}').join(visitDate);
          emailBody = emailBody.split('&#123;visitDate&#125;').join(visitDate);
          emailBody = emailBody.split('&#123;VisitDate&#125;').join(visitDate);
        }
        
        if (!invoiceNum) {
          console.error('Invoice number is missing!', invoiceData);
          alert('Warning: Invoice number is missing. The {invoiceNumber} placeholder will not be replaced.');
        } else {
          console.log('Replacing with invoice number:', invoiceNum);
          
          // Store original for debugging
          const originalEmailBody = emailBody;
          
          // Strategy: First decode any HTML entities, then replace, then re-encode if needed
          // But actually, let's try a simpler approach: replace in the raw HTML string
          
          // Pattern 1: Most common - plain text within HTML tags: <p>Hello {invoiceNumber}</p>
          emailBody = emailBody.replace(/\{invoiceNumber\}/gi, invoiceNum);
          emailBody = emailBody.replace(/\{InvoiceNumber\}/gi, invoiceNum);
          
          // Pattern 2: HTML entity encoded braces: { = &#123; and } = &#125;
          emailBody = emailBody.replace(/&#123;invoiceNumber&#125;/gi, invoiceNum);
          emailBody = emailBody.replace(/&#123;InvoiceNumber&#125;/gi, invoiceNum);
          
          // Pattern 3: Double-encoded HTML entities
          emailBody = emailBody.replace(/&amp;#123;invoiceNumber&amp;#125;/gi, invoiceNum);
          emailBody = emailBody.replace(/&amp;#123;InvoiceNumber&amp;#125;/gi, invoiceNum);
          
          // Pattern 4: Handle spans wrapping the placeholder: <span>{invoiceNumber}</span>
          emailBody = emailBody.replace(/<span[^>]*>\s*\{invoiceNumber\}\s*<\/span>/gi, invoiceNum);
          emailBody = emailBody.replace(/<span[^>]*>\s*\{InvoiceNumber\}\s*<\/span>/gi, invoiceNum);
          
          // Pattern 4b: Handle braces OUTSIDE span with placeholder text INSIDE: {<span>invoiceNumber</span>}
          // This is the actual pattern Tiptap creates: {<span style="color: ...">invoiceNumber</span>}
          emailBody = emailBody.replace(/\{<span[^>]*>\s*invoiceNumber\s*<\/span>\}/gi, invoiceNum);
          emailBody = emailBody.replace(/\{<span[^>]*>\s*InvoiceNumber\s*<\/span>\}/gi, invoiceNum);
          
          // Pattern 5: Handle case where placeholder might be split across HTML tags
          emailBody = emailBody.replace(/(<[^>]*>)?\{invoiceNumber\}(<\/[^>]*>)?/gi, (match, openTag, closeTag) => {
            return (openTag || '') + invoiceNum + (closeTag || '');
          });
          emailBody = emailBody.replace(/(<[^>]*>)?\{InvoiceNumber\}(<\/[^>]*>)?/gi, (match, openTag, closeTag) => {
            return (openTag || '') + invoiceNum + (closeTag || '');
          });
          
          // Pattern 6: Handle nested spans with color styling (Tiptap often does this)
          emailBody = emailBody.replace(/<span[^>]*color[^>]*>\s*\{invoiceNumber\}\s*<\/span>/gi, invoiceNum);
          emailBody = emailBody.replace(/<span[^>]*color[^>]*>\s*\{InvoiceNumber\}\s*<\/span>/gi, invoiceNum);
          
          // Pattern 7: Handle if Tiptap wrapped each character in spans (unlikely but possible)
          // This would be like: <span>{</span><span>i</span><span>n</span>... etc
          // We'll handle this by removing all spans around the placeholder first
          emailBody = emailBody.replace(/<span[^>]*>\{<\/span><span[^>]*>invoiceNumber<\/span><span[^>]*>\}<\/span>/gi, invoiceNum);
          emailBody = emailBody.replace(/<span[^>]*>\{<\/span><span[^>]*>InvoiceNumber<\/span><span[^>]*>\}<\/span>/gi, invoiceNum);
          
          // Final aggressive fallback - replace any remaining occurrences using split/join
          // Check for various patterns including the split span pattern
          const hasPlaceholder = emailBody.includes('{invoiceNumber}') || 
                                 emailBody.includes('{InvoiceNumber}') ||
                                 emailBody.includes('{<span') && emailBody.includes('invoiceNumber</span>}') ||
                                 emailBody.includes('{<span') && emailBody.includes('InvoiceNumber</span>}');
          
          if (hasPlaceholder) {
            console.warn('Invoice number replacement may have failed, trying aggressive replacement');
            console.log('Email body before final replacement (first 500 chars):', emailBody.substring(0, 500));
            
            // Use split/join as final fallback - this should catch everything
            emailBody = emailBody.split('{invoiceNumber}').join(invoiceNum);
            emailBody = emailBody.split('{InvoiceNumber}').join(invoiceNum);
            emailBody = emailBody.split('&#123;invoiceNumber&#125;').join(invoiceNum);
            emailBody = emailBody.split('&#123;InvoiceNumber&#125;').join(invoiceNum);
            emailBody = emailBody.split('&amp;#123;invoiceNumber&amp;#125;').join(invoiceNum);
            emailBody = emailBody.split('&amp;#123;InvoiceNumber&amp;#125;').join(invoiceNum);
            
            // Handle the split span pattern: {<span...>invoiceNumber</span>}
            // Use a more aggressive regex replacement for this pattern
            emailBody = emailBody.replace(/\{<span[^>]*>invoiceNumber<\/span>\}/gi, invoiceNum);
            emailBody = emailBody.replace(/\{<span[^>]*>InvoiceNumber<\/span>\}/gi, invoiceNum);
          }
          
          // Verify replacement worked
          console.log('Email body after replacement (first 500 chars):', emailBody.substring(0, 500));
          if (emailBody.includes('{invoiceNumber}') || emailBody.includes('{InvoiceNumber}')) {
            console.error('❌ Invoice number replacement STILL FAILED after all attempts!');
            console.error('Original email content:', originalEmailBody);
            console.error('Email body after replacement:', emailBody);
            console.error('This is a critical error - the placeholder was not replaced!');
          } else {
            console.log('✅ Invoice number replacement successful:', invoiceNum);
          }
          console.log('=== END EMAIL BODY REPLACEMENT DEBUG ===');
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

        // Send to backend - send to all emails
        console.log('=== SENDING EMAIL REQUEST ===');
        console.log('Sending to emails:', allEmails);
        console.log('Invoice number:', invoiceData.invoiceNumber);
        console.log('Using custom email:', useCustomEmail);
        
        const response = await fetch(`${API_BASE}/invoice/send-email`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: allEmails, // Send array of all emails
            invoiceNumber: invoiceData.invoiceNumber, // Include invoice number
            subject: (() => {
              // Get subject from profile settings or use default
              let subject = profileSettings?.email_subject || `Invoice ${invoiceData.invoiceNumber} from ${businessName}`;
              
              // Replace variables in subject
              const invoiceNum = String(invoiceData.invoiceNumber || '');
              const visitDate = invoiceData.visitDate || '';
              const businessNameValue = businessName || '';
              
              subject = subject.replace(/\{invoiceNumber\}/gi, invoiceNum);
              subject = subject.replace(/\{InvoiceNumber\}/gi, invoiceNum);
              subject = subject.replace(/\{visitDate\}/gi, visitDate);
              subject = subject.replace(/\{VisitDate\}/gi, visitDate);
              subject = subject.replace(/\{businessName\}/gi, businessNameValue);
              subject = subject.replace(/\{BusinessName\}/gi, businessNameValue);
              
              return subject;
            })(),
            body: emailBody,
            pdfData: base64data,
            pdfFilename: filename
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Email sent successfully:', result);
          alert(`Invoice email sent successfully to: ${allEmails.join(', ')}`);
        } else {
          const error = await response.json();
          console.error('Email send failed:', error);
          let errorMsg = `Failed to send email: ${error.error || 'Unknown error'}`;
          
          // Add suggestions if provided
          if (error.suggestions && error.suggestions.length > 0) {
            errorMsg += '\n\n' + error.suggestions.join('\n');
          }
          
          // Add details if available
          if (error.details && error.details !== error.error) {
            errorMsg += `\n\nDetails: ${error.details}`;
          }
          
          // Add email addresses that were attempted
          errorMsg += `\n\nAttempted to send to: ${allEmails.join(', ')}`;
          if (useCustomEmail) {
            errorMsg += '\n(Custom email mode)';
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
  const businessName = profileSettings.business_name || profileSettings.name || 'HairManager';

  return (
    <div className="invoice-container">
      <div className="invoice-actions">
        <div className="invoice-actions-row">
          <div className="invoice-actions-left">
            {profileSettings?.email_relay_api_key && (profileSettings?.email_relay_from_email || profileSettings?.email) && (
              <button 
                onClick={handleEmailInvoice}
                className="invoice-email-btn"
                disabled={useCustomEmail && !customEmail.trim()}
              >
                <i className="fas fa-paper-plane"></i>
                <span>Send</span>
              </button>
            )}
            {(locationDetails.email || locationDetails.emails.length > 0) && (
              <button 
                onClick={handleOpenEmailApp}
                className="invoice-email-app-btn"
                title="Open email app with location email(s)"
              >
                <i className="fas fa-envelope"></i>
                <span>App</span>
              </button>
            )}
            <div className="invoice-actions-divider"></div>
            {profileSettings?.email_relay_api_key && (profileSettings?.email_relay_from_email || profileSettings?.email) && (
              <div className="invoice-custom-wrapper">
                {useCustomEmail ? (
                  <div className="invoice-email-input-wrapper">
                    <input
                      type="text"
                      inputMode="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="@email.com"
                      className="invoice-email-input"
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                      data-form-type="other"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      name="custom-email-input"
                      id="custom-email-input"
                    />
                  <button
                    type="button"
                    className="invoice-email-close"
                    onClick={() => {
                      setUseCustomEmail(false);
                      setCustomEmail('');
                    }}
                    title="Close custom email"
                  >
                    <i className="fas fa-check"></i>
                  </button>
                  </div>
                ) : (
                  <label className="invoice-custom-checkbox">
                    <input
                      type="checkbox"
                      checked={useCustomEmail}
                      onChange={(e) => {
                        setUseCustomEmail(e.target.checked);
                      }}
                    />
                    <span>Custom email</span>
                  </label>
                )}
              </div>
            )}
          </div>
          <div className="invoice-actions-right">
            <button onClick={handlePrint} className="invoice-print-btn">
              <i className="fas fa-print"></i>
              <span>Print</span>
            </button>
            <button onClick={handleExportPDF} className="invoice-pdf-btn">
              <i className="fas fa-file-pdf"></i>
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>
      <div ref={invoiceRef}>
        {appointmentPages.map((pageAppointments, pageIndex) => {
          const isLastPage = pageIndex === appointmentPages.length - 1;
          const totalPages = appointmentPages.length;
          const pageNumber = pageIndex + 1;
          
          // Calculate sub-total for this page
          const pageSubTotal = pageAppointments.reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
          
          return (
            <div key={pageIndex} className="invoice-page" style={{ marginBottom: pageIndex < totalPages - 1 ? '40px' : '0' }}>
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
                  <div className="invoice-page-number" style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Page {pageNumber} of {totalPages}
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
            {pageAppointments.map((apt, index) => (
              <tr key={apt.id || index}>
                <td className="service-description-col">
                  {apt.client_name} - {apt.service}
                </td>
                <td className="service-date-col">{formatDate(apt.date)}</td>
                <td className="service-amount-col">{formatCurrency(apt.price || 0)}</td>
              </tr>
            ))}
            <tr className="invoice-subtotal-row" style={{ fontWeight: 'bold' }}>
              <td colSpan="2" className="subtotal-label">{isLastPage ? 'Total' : 'Page Sub-Total'}</td>
              <td className="subtotal-amount">{formatCurrency(pageSubTotal)}</td>
            </tr>
            {isLastPage && total !== pageSubTotal && (
              <tr className="invoice-total-row">
                <td colSpan="2" className="total-label">Grand Total</td>
                <td className="total-amount">{formatCurrency(total)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {isLastPage && (
          <div className="invoice-footer">
            <div className="payment-instructions">
              <div>Make all checks payable to {businessName}</div>
              <div>Payment is due within 30 days.</div>
              <div className="bacs-details">
                BACS: {profileSettings.bank_account_name || 'HairManager'} – 
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
        )}
      </div>
          );
        })}
      </div>
    </div>
  );
}

export default Invoice;

