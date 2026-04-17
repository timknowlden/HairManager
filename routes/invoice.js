import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

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
      toEmails = to
        .flatMap(email => {
          if (typeof email === 'string' && email.trim()) {
            return email
              .split(/[;,]/)
              .map(e => e.trim())
              .filter(e => e && e.length > 0);
          }
          return email ? [email] : [];
        })
        .filter((email, index, self) => self.indexOf(email) === index);
    } else if (typeof to === 'string' && to.trim()) {
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

      // Use Resend email service
      const apiKey = profile.email_relay_api_key;
      const fromEmail = profile.email_relay_from_email || profile.email;
      const fromName = profile.email_relay_from_name || profile.business_name || profile.name || '';
      const replyTo = profile.email_relay_reply_to || fromEmail;
      const ccEnabled = profile.email_relay_bcc_enabled === 1 || profile.email_relay_bcc_enabled === true;
      const emailSubject = subject || profile.email_subject || 'Invoice';

      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Resend API key not configured. Please set it in Profile Settings.' 
        });
      }

      if (!fromEmail) {
        return res.status(400).json({ 
          error: 'From email address not configured. Please set it in Profile Settings.' 
        });
      }

      try {
        const resend = new Resend(apiKey);

        // Convert base64 PDF to buffer
        const pdfBuffer = Buffer.from(pdfData, 'base64');

        // Check if body is HTML (contains HTML tags)
        const isHtml = body && body.includes('<') && body.includes('>');
        
        let htmlBody;
        let textBody;
        
        if (isHtml) {
          htmlBody = body;
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
          htmlBody = body 
            ? body.split('\n\n').map(paragraph => {
                if (!paragraph.trim()) return '<br>';
                return `<p>${paragraph.split('\n').map(line => line.trim() || '<br>').join('<br>')}</p>`;
              }).join('')
            : '<p>Please find the invoice attached.</p>';
          textBody = body || 'Please find the invoice attached.';
        }

        // Build the Resend email payload
        const emailPayload = {
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          reply_to: replyTo,
          to: toEmails,
          subject: emailSubject,
          html: htmlBody,
          text: textBody,
          headers: {
            'List-Unsubscribe': `<mailto:${replyTo}?subject=unsubscribe>`,
          },
          attachments: [
            {
              content: pdfBuffer,
              filename: pdfFilename || 'invoice.pdf',
            }
          ]
        };

        // Add BCC with the user's profile email (not the from address)
        if (ccEnabled) {
          const bccEmail = (profile.email || '').trim();
          if (bccEmail) {
            emailPayload.bcc = [bccEmail];
            console.log('BCC enabled, adding to BCC:', bccEmail);
          }
        }

        const { data, error: resendError } = await resend.emails.send(emailPayload);

        if (resendError) {
          throw resendError;
        }

        console.log('Email sent via Resend');
        
        // Extract Resend message ID from response
        const resendMessageId = data?.id || null;
        console.log('Resend message ID:', resendMessageId);
        
        // Save PDF to server
        const invoicesDir = process.env.NODE_ENV === 'production' 
          ? join(__dirname, '..', 'data', 'invoices')
          : join(__dirname, '..', 'invoices');
        
        if (!existsSync(invoicesDir)) {
          await mkdir(invoicesDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const invoiceNum = invoiceNumber || 'unknown';
        const pdfFile = `Invoice_${invoiceNum}_${timestamp}.pdf`;
        const pdfPath = join(invoicesDir, pdfFile);
        
        await writeFile(pdfPath, pdfBuffer);
        console.log('PDF saved to:', pdfPath);
        
        // Log email to database
        const now = new Date().toISOString();
        const toRecipients = toEmails.map(email => ({ email: email.trim() })).filter(r => r.email);
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
              'sent',
              resendMessageId,
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
          messageId: resendMessageId || 'resend',
          method: 'Resend',
          pdfPath: pdfPath
        });
      } catch (relayError) {
        console.error('Resend error:', relayError);
        let errorMessage = 'Failed to send email via Resend';
        let errorDetails = relayError.message;
        let suggestions = [];
        
        if (relayError.statusCode === 401 || relayError.name === 'validation_error') {
          errorMessage = 'Invalid Resend API key. Please check your API key in Profile Settings.';
        } else if (relayError.statusCode === 403) {
          errorMessage = 'Resend API key does not have permission to send emails.';
        } else if (relayError.statusCode === 422) {
          errorMessage = `Resend validation error: ${relayError.message}`;
          if (relayError.message?.includes('domain')) {
            suggestions.push('Make sure your sending domain is verified in Resend');
            suggestions.push('Go to resend.com/domains to verify your domain');
          }
        } else if (relayError.statusCode === 429) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        } else {
          errorMessage = `Resend error: ${relayError.message}`;
        }
        
        // Log failed email attempt
        const now = new Date().toISOString();
        const toRecipients = toEmails.map(email => ({ email: email.trim() })).filter(r => r.email);
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
