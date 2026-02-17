import express from 'express';
import { Resend } from 'resend';

const router = express.Router();

// Send email via Resend API
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
      if (!profile.email_relay_api_key) {
        return res.status(400).json({ 
          error: 'Resend API key not configured. Please set up Resend in Profile Settings.' 
        });
      }

      const fromEmail = profile.email_relay_from_email || profile.email || 'noreply@example.com';
      const fromName = profile.email_relay_from_name || profile.business_name || profile.name || '';

      try {
        const resend = new Resend(profile.email_relay_api_key);

        // Convert base64 PDF to buffer
        const pdfBuffer = Buffer.from(pdfData, 'base64');

        const { data, error: resendError } = await resend.emails.send({
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          to: [to],
          subject: subject,
          text: body || 'Please find the invoice attached.',
          html: body ? body.replace(/\n/g, '<br>') : '<p>Please find the invoice attached.</p>',
          attachments: [
            {
              content: pdfBuffer,
              filename: pdfFilename || 'invoice.pdf',
            }
          ]
        });

        if (resendError) {
          throw resendError;
        }

        console.log('Email sent via Resend');
        return res.json({ 
          success: true, 
          message: 'Email sent successfully via Resend',
          method: 'Resend'
        });
      } catch (relayError) {
        console.error('Resend error:', relayError);
        
        let errorMessage = 'Failed to send email via Resend';
        errorMessage += `: ${relayError.message}`;
        
        res.status(500).json({ 
          error: errorMessage,
          details: relayError.message,
          service: 'resend'
        });
      }
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

export default router;
