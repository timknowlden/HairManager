import express from 'express';
import sgMail from '@sendgrid/mail';

const router = express.Router();

// Send email via relay service (SendGrid, Mailgun, etc.)
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

    // Get profile settings
    db.get('SELECT * FROM admin_settings ORDER BY id DESC LIMIT 1', [], async (err, profile) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        return res.status(500).json({ error: 'Failed to fetch profile settings' });
      }

      if (!profile) {
        return res.status(400).json({ error: 'Profile settings not configured' });
      }

      // Check if relay service is configured
      if (!profile.email_relay_service || !profile.email_relay_api_key) {
        return res.status(400).json({ 
          error: 'Email relay service not configured. Please set up a relay service (SendGrid, etc.) in Profile Settings.' 
        });
      }

      const relayService = profile.email_relay_service.toLowerCase();
      const fromEmail = profile.email_relay_from_email || profile.email || 'noreply@example.com';
      const fromName = profile.email_relay_from_name || profile.business_name || profile.name || '';

      try {
        if (relayService === 'sendgrid') {
          // SendGrid implementation
          sgMail.setApiKey(profile.email_relay_api_key);

          // Convert base64 PDF to buffer
          const pdfBuffer = Buffer.from(pdfData, 'base64');

          const msg = {
            to: to,
            from: {
              email: fromEmail,
              name: fromName
            },
            subject: subject,
            text: body || 'Please find the invoice attached.',
            html: body ? body.replace(/\n/g, '<br>') : '<p>Please find the invoice attached.</p>',
            attachments: [
              {
                content: pdfBuffer.toString('base64'),
                filename: pdfFilename || 'invoice.pdf',
                type: 'application/pdf',
                disposition: 'attachment'
              }
            ]
          };

          await sgMail.send(msg);
          console.log('Email sent via SendGrid');
          return res.json({ 
            success: true, 
            message: 'Email sent successfully via SendGrid',
            method: 'SendGrid'
          });
        } else {
          return res.status(400).json({ 
            error: `Unsupported relay service: ${relayService}. Currently supported: SendGrid` 
          });
        }
      } catch (relayError) {
        console.error('Relay service error:', relayError);
        
        let errorMessage = 'Failed to send email via relay service';
        if (relayError.response) {
          errorMessage += `: ${relayError.response.body?.errors?.[0]?.message || relayError.response.body?.message || 'Unknown error'}`;
        } else {
          errorMessage += `: ${relayError.message}`;
        }
        
        res.status(500).json({ 
          error: errorMessage,
          details: relayError.message,
          service: relayService
        });
      }
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

export default router;
