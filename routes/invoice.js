import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/invoice/send-email
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, body, pdfData, pdfFilename } = req.body;

    if (!to || !subject || !pdfData) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, pdfData' });
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
      const bccEmail = profile.email; // Your email address for BCC

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

        const msg = {
          to: to,
          from: {
            email: fromEmail,
            name: fromName
          },
          subject: subject,
          text: textBody,
          html: htmlBody,
          attachments: [
            {
              content: pdfBuffer.toString('base64'),
              filename: pdfFilename || 'invoice.pdf',
              type: 'application/pdf',
              disposition: 'attachment'
            }
          ]
        };

        // Add BCC if your email is configured and different from the from email
        if (bccEmail && bccEmail.trim() && bccEmail !== fromEmail) {
          msg.bcc = bccEmail.trim();
        }

        await sgMail.send(msg);
        console.log('Email sent via SendGrid');
        return res.json({ 
          success: true, 
          messageId: 'sendgrid',
          method: 'SendGrid'
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
            'This is a SendGrid infrastructure issue, not a problem with your email content',
            'Set up Domain Authentication (SPF, DKIM, DMARC) in SendGrid to improve deliverability',
            'Go to SendGrid → Settings → Sender Authentication → Authenticate Your Domain',
            'Contact SendGrid support if the issue persists',
            'The email may still be delivered to other recipients - this is specific to certain email providers'
          ];
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

