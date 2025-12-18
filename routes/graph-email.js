import express from 'express';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const router = express.Router();

// OAuth2 configuration - these should be set in environment variables or database
// For now, we'll get them from the request or database
const getGraphClient = async (clientId, clientSecret, tenantId) => {
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  
  return Client.initWithMiddleware({ authProvider });
};

// Send email via Microsoft Graph API
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, body, pdfData, pdfFilename, fromEmail } = req.body;

    if (!to || !subject || !pdfData || !fromEmail) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, pdfData, fromEmail' });
    }

    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Get OAuth2 credentials from profile settings
    db.get('SELECT * FROM admin_settings ORDER BY id DESC LIMIT 1', [], async (err, profile) => {
      if (err) {
        console.error('Error fetching profile settings:', err);
        return res.status(500).json({ error: 'Failed to fetch profile settings' });
      }

      if (!profile) {
        return res.status(400).json({ error: 'Profile settings not configured' });
      }

      // Check if OAuth2 is configured
      if (!profile.azure_client_id || !profile.azure_client_secret || !profile.azure_tenant_id) {
        return res.status(400).json({ 
          error: 'OAuth2 not configured. Please set up Azure App Registration in Profile Settings.' 
        });
      }

      try {
        // Create Graph client
        const client = await getGraphClient(
          profile.azure_client_id,
          profile.azure_client_secret,
          profile.azure_tenant_id
        );

        // Convert base64 PDF to buffer
        const pdfBuffer = Buffer.from(pdfData, 'base64');

        // Create email message
        const message = {
          message: {
            subject: subject,
            body: {
              contentType: 'HTML',
              content: body || '<p>Please find the invoice attached.</p>'
            },
            toRecipients: [
              {
                emailAddress: {
                  address: to
                }
              }
            ],
            attachments: [
              {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: pdfFilename || 'invoice.pdf',
                contentType: 'application/pdf',
                contentBytes: pdfBuffer.toString('base64')
              }
            ]
          }
        };

        // Send email using Graph API
        const result = await client
          .api(`/users/${fromEmail}/sendMail`)
          .post(message);

        console.log('Email sent via Graph API');
        res.json({ success: true, message: 'Email sent successfully via Microsoft Graph API' });
      } catch (graphError) {
        console.error('Graph API error:', graphError);
        res.status(500).json({ 
          error: 'Failed to send email via Graph API',
          details: graphError.message 
        });
      }
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

export default router;

