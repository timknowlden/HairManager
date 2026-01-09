import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/invoice/send-email
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, body, pdfData, pdfFilename, invoiceNumber } = req.body;

    // Handle both single email string and array of emails
    // Also handle semicolon or comma-separated emails
    let toEmails = [];
    if (Array.isArray(to)) {
      // Flatten array and split any strings that contain semicolons or commas
      toEmails = to
        .flatMap(email => {
          if (typeof email === 'string' && email.trim()) {
            // Split by semicolon or comma, then trim and filter
            return email
              .split(/[;,]/)
              .map(e => e.trim())
              .filter(e => e && e.length > 0);
          }
          return email ? [email] : [];
        })
        .filter((email, index, self) => self.indexOf(email) === index); // Remove duplicates
    } else if (typeof to === 'string' && to.trim()) {
      // Split by semicolon or comma, then trim and filter
      toEmails = to
        .split(/[;,]/)
        .map(e => e.trim())
        .filter(e => e && e.length > 0);
    }
    
    if (toEmails.length === 0 || !pdfData) {
      return res.status(400).json({ error: 'Missing required fields: to, pdfData' });
    }

    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Get profile settings for email configuration - filter by user_id
    const userId = req.userId;
    db.get('SELECT * FROM admin_settings WHERE user_id = ?', [userId], async (err, profile) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        return res.status(500).json({ error: 'Failed to fetch profile settings' });
      }

      if (!profile) {
        return res.status(400).json({ error: 'Profile settings not configured' });
      }

      // Use SendGrid email relay service
      const apiKey = profile.email_relay_api_key;
      const fromEmail = profile.email_relay_from_email || profile.email;
      const fromName = profile.email_relay_from_name || profile.business_name || profile.name || '';
      const ccEnabled = profile.email_relay_bcc_enabled === 1 || profile.email_relay_bcc_enabled === true; // Checkbox enables CC
      // Use email_subject from profile if not provided in request, or use default
      const emailSubject = subject || profile.email_subject || 'Invoice';
      
      // Build recipient list early so it's available in error handler
      const toRecipients = toEmails.map(email => ({ email: email.trim() })).filter(r => r.email);

      if (!apiKey) {
        return res.status(400).json({ 
          error: 'SendGrid API key not configured. Please set it in Profile Settings.' 
        });
      }

      if (!fromEmail) {
        return res.status(400).json({ 
          error: 'From email address not configured. Please set it in Profile Settings.' 
        });
      }

      try {
        const sgMail = (await import('@sendgrid/mail')).default;
        sgMail.setApiKey(apiKey);

        // Convert base64 PDF to buffer
        const pdfBuffer = Buffer.from(pdfData, 'base64');

        // Check if body is HTML (contains HTML tags)
        const isHtml = body && body.includes('<') && body.includes('>');
        
        // Convert to HTML if not already HTML
        let htmlBody;
        let textBody;
        
        if (isHtml) {
          // Already HTML, use as-is
          htmlBody = body;
          // Create plain text version by stripping HTML tags
          textBody = body
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
        } else {
          // Plain text, convert to HTML
          htmlBody = body 
            ? body.split('\n\n').map(paragraph => {
                if (!paragraph.trim()) return '<br>';
                return `<p>${paragraph.split('\n').map(line => line.trim() || '<br>').join('<br>')}</p>`;
              }).join('')
            : '<p>Please find the invoice attached.</p>';
          textBody = body || 'Please find the invoice attached.';
        }

        // Build personalizations array for SendGrid v3 API
        const personalizations = [{
          to: toRecipients
        }];

        // Add BCC with from email if enabled
        if (ccEnabled && fromEmail && fromEmail.trim()) {
          personalizations[0].bcc = [{ email: fromEmail.trim() }];
          console.log('BCC enabled, adding to BCC:', fromEmail.trim());
        } else {
          console.log('BCC disabled or fromEmail missing. ccEnabled:', ccEnabled, 'fromEmail:', fromEmail);
        }

        const msg = {
          personalizations: personalizations,
          from: {
            email: fromEmail,
            name: fromName
          },
          subject: emailSubject,
          content: [
            {
              type: 'text/plain',
              value: textBody
            },
            {
              type: 'text/html',
              value: htmlBody
            }
          ],
          attachments: [
            {
              content: pdfBuffer.toString('base64'),
              filename: pdfFilename || 'invoice.pdf',
              type: 'application/pdf',
              disposition: 'attachment'
            }
          ]
        };

        const result = await sgMail.send(msg);
        console.log('Email sent via SendGrid');
        
        // Extract SendGrid message ID from response
        // SendGrid returns message ID in x-message-id header
        // Format can be: "base.recvd-..." or just "base"
        // We'll store the base part (before first dot) for better matching
        let sendgridMessageId = result[0]?.headers?.['x-message-id'] || 
                                result[0]?.body?.message_id || 
                                null;
        
        // Extract base message ID (before first dot) for consistent matching
        if (sendgridMessageId && sendgridMessageId.includes('.')) {
          sendgridMessageId = sendgridMessageId.split('.')[0];
        }
        
        console.log('SendGrid message ID extracted:', sendgridMessageId);
        
        // Save PDF to server
        const invoicesDir = process.env.NODE_ENV === 'production' 
          ? join(__dirname, '..', 'data', 'invoices')
          : join(__dirname, '..', 'invoices');
        
        // Ensure invoices directory exists
        if (!existsSync(invoicesDir)) {
          await mkdir(invoicesDir, { recursive: true });
        }
        
        // Generate filename: Invoice_{invoiceNumber}_{timestamp}.pdf
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const invoiceNum = invoiceNumber || 'unknown';
        const pdfFile = `Invoice_${invoiceNum}_${timestamp}.pdf`;
        const pdfPath = join(invoicesDir, pdfFile);
        
        // Save PDF file
        await writeFile(pdfPath, pdfBuffer);
        console.log('PDF saved to:', pdfPath);
        
        // Log email to database
        const now = new Date().toISOString();
        const db = req.app.locals.db;
        for (const recipient of toRecipients) {
          db.run(
            `INSERT INTO email_logs 
             (user_id, invoice_number, recipient_email, subject, status, sendgrid_message_id, pdf_file_path, sent_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              invoiceNum,
              recipient.email,
              emailSubject,
              'sent', // Initial status
              sendgridMessageId,
              pdfPath,
              now,
              now
            ],
            function(err) {
              if (err) {
                console.error('Error logging email:', err);
              } else {
                console.log('Email logged with ID:', this.lastID);
              }
            }
          );
        }
        
        return res.json({ 
          success: true, 
          messageId: sendgridMessageId || 'sendgrid',
          method: 'SendGrid',
          pdfPath: pdfPath
        });
      } catch (relayError) {
        console.error('SendGrid error:', relayError);
        let errorMessage = 'Failed to send email via SendGrid';
        let errorDetails = relayError.message;
        let suggestions = [];
        
        if (relayError.response) {
          const statusCode = relayError.response.statusCode;
          const body = relayError.response.body;
          
          if (statusCode === 401) {
            errorMessage = 'Invalid SendGrid API key. Please check your API key in Profile Settings.';
          } else if (statusCode === 403) {
            errorMessage = 'SendGrid API key does not have permission to send emails.';
          } else if (statusCode === 400 && body?.errors) {
            const firstError = body.errors[0];
            if (firstError.message?.includes('sender')) {
              errorMessage = 'Sender email not verified in SendGrid. Please verify your sender email address in SendGrid.';
              suggestions.push('Go to SendGrid → Settings → Sender Authentication → Verify your sender email');
            } else {
              errorMessage = `SendGrid error: ${firstError.message || relayError.message}`;
              errorDetails = firstError.message || relayError.message;
            }
          } else {
            errorMessage = `SendGrid error: ${body?.errors?.[0]?.message || relayError.message}`;
            errorDetails = body?.errors?.[0]?.message || relayError.message;
          }
        }
        
        // Check for IP blocklist/bounce errors
        if (errorDetails && (
          errorDetails.includes('block list') || 
          errorDetails.includes('blocklist') ||
          errorDetails.includes('S3140') ||
          errorDetails.includes('bounce') ||
          errorDetails.includes('550 5.7.1')
        )) {
          errorMessage = 'Email delivery failed: SendGrid IP address is on recipient\'s blocklist';
          suggestions = [
            'This is a SendGrid infrastructure issue, not a problem with your email content or configuration',
            'Even with Domain Authentication (SPF, DKIM, DMARC), some email providers may still block SendGrid\'s shared IP addresses',
            'The email may still be delivered to other recipients - this is specific to certain email providers (often Outlook/Microsoft)',
            'SendGrid monitors IP reputation and works to resolve blocklist issues automatically',
            'If this persists, consider SendGrid\'s Dedicated IP option for better deliverability control, or contact SendGrid support'
          ];
        }
        
        // Log failed email attempt
        const now = new Date().toISOString();
        const db = req.app.locals.db;
        for (const recipient of toRecipients) {
          db.run(
            `INSERT INTO email_logs 
             (user_id, invoice_number, recipient_email, subject, status, error_message, sent_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              invoiceNumber || 'unknown',
              recipient.email,
              emailSubject,
              'failed',
              errorMessage || 'Unknown error',
              now,
              now
            ],
            function(err) {
              if (err) {
                console.error('Error logging failed email:', err);
              }
            }
          );
        }
        
        return res.status(500).json({ 
          error: errorMessage,
          details: errorDetails,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        });
      }
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

export default router;

