import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './database/init.js';
import { migrateDatabase } from './database/migrate.js';
import appointmentsRoutes from './routes/appointments.js';
import servicesRoutes from './routes/services.js';
import locationsRoutes from './routes/locations.js';
import profileRoutes from './routes/profile.js';
import invoiceRoutes from './routes/invoice.js';
import authRoutes from './routes/auth.js';
import financialRoutes from './routes/financial.js';

console.log('Profile routes imported:', profileRoutes ? 'YES' : 'NO');
if (profileRoutes) {
  console.log('Profile router type:', typeof profileRoutes);
  console.log('Profile router is function:', typeof profileRoutes === 'function' ? 'YES' : 'NO');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for PDF uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Debug middleware to log ALL requests (even non-API)
console.log('[SERVER INIT] Registering request logging middleware...');
app.use((req, res, next) => {
  console.log(`\n[REQUEST] ${req.method} ${req.originalUrl}`);
  if (req.originalUrl.startsWith('/api')) {
    console.log(`[API Request] ${req.method} ${req.originalUrl}`);
    console.log(`[API Request] Path: ${req.path}, BaseURL: ${req.baseUrl}, URL: ${req.url}`);
    if (req.originalUrl.includes('admin')) {
      console.log(`[API Request] *** ADMIN REQUEST DETECTED ***`);
    }
  }
  next();
});
console.log('[SERVER INIT] Request logging middleware registered');

// Profile routes are now handled by the profile router (routes/profile.js)
// which includes authentication middleware

// Test email endpoint removed - using SendGrid only now
/*
app.post('/api/profile/test-email', async (req, res) => {
  console.log('\n[DIRECT PROFILE ROUTE] POST /api/profile/test-email - HANDLER CALLED');
  console.log('[DIRECT PROFILE ROUTE] Request body:', { 
    email: req.body?.email ? '***' : 'missing', 
    email_password: req.body?.email_password ? '***' : 'missing',
    smtp_host: req.body?.smtp_host ? req.body.smtp_host : 'missing',
    smtp_port: req.body?.smtp_port,
    smtp_secure: req.body?.smtp_secure,
    smtp_username: req.body?.smtp_username ? '***' : 'missing'
  });
  
  try {
    const { email, email_password, smtp_host, smtp_port, smtp_secure, smtp_username } = req.body;

    if (!email || !email_password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Create a temporary profile object for testing
    const testProfile = {
      email,
      email_password,
      smtp_host,
      smtp_port: smtp_port ? parseInt(smtp_port) : null,
      smtp_secure: smtp_secure === true || smtp_secure === 1 || smtp_secure === '1',
      smtp_username
    };

    // Helper function to test email connection
    const testEmailConnection = async (testEmail) => {
      const profile = { ...testProfile, email: testEmail };
    let transporter;
      let configUsed = {};
      
      // If custom SMTP settings are provided, use them
      if (profile.smtp_host) {
        const isOutlookHost = profile.smtp_host.includes('outlook.com') || profile.smtp_host.includes('office365.com');
        
        const config = {
          host: profile.smtp_host,
          port: profile.smtp_port || 587,
          secure: profile.smtp_secure === true || profile.smtp_secure === 1,
          auth: {
            user: profile.smtp_username || profile.email,
            pass: profile.email_password
          }
        };
        
        // For Outlook/Office365, require TLS/STARTTLS
        if (isOutlookHost) {
          config.requireTLS = true;
        }
        
        if (!config.secure) {
          config.tls = { 
            ciphers: 'SSLv3',
            // Some Office365 setups may need this
            rejectUnauthorized: isOutlookHost ? false : true
          };
        }
        
        configUsed = {
          host: config.host,
          port: config.port,
          secure: config.secure,
          username: config.auth.user,
          passwordSet: !!config.auth.pass
        };
        
        console.log('[EMAIL TEST] Using custom SMTP config:', { ...configUsed, passwordSet: '***' });
        transporter = nodemailer.createTransport(config);
      } else if (profile.smtp_username && (profile.smtp_username.includes('@outlook.com') || profile.smtp_username.includes('@office365.com') || profile.smtp_username.includes('@microsoft.com'))) {
        // If SMTP username is provided and it's an Outlook/Office365 address, use Outlook SMTP
        // This handles custom domains that use Outlook/Office365
        // Try smtp.office365.com first (for Office365), then fall back to smtp-mail.outlook.com
        const isOffice365 = profile.smtp_username.includes('@office365.com') || profile.smtp_username.includes('@microsoft.com');
        const smtpHost = isOffice365 ? 'smtp.office365.com' : 'smtp-mail.outlook.com';
        
        const config = {
          host: smtpHost,
          port: profile.smtp_port ? parseInt(profile.smtp_port) : 587,
          secure: profile.smtp_secure === true || profile.smtp_secure === 1,
          auth: {
            user: profile.smtp_username,
            pass: profile.email_password
          },
          requireTLS: true // Force TLS/STARTTLS
        };
        
        if (!config.secure) {
          config.tls = { 
            ciphers: 'SSLv3',
            rejectUnauthorized: false // Some Office365 setups require this
          };
        }
        
        configUsed = {
          host: config.host,
          port: config.port,
          secure: config.secure,
          username: config.auth.user,
          passwordSet: !!config.auth.pass,
          autoDetected: `Outlook/Office365 (via SMTP username) - ${smtpHost}`
        };
        
        console.log('[EMAIL TEST] Using Outlook/Office365 SMTP (detected from SMTP username):', { ...configUsed, passwordSet: '***' });
        transporter = nodemailer.createTransport(config);
      } else {
        // Auto-detect
        const emailDomain = testEmail.split('@')[1]?.toLowerCase() || '';
        const isOutlook = emailDomain.includes('outlook.com') || 
                         emailDomain.includes('hotmail.com') || 
                         emailDomain.includes('live.com') ||
                         emailDomain.includes('msn.com');

    if (emailDomain.includes('gmail.com')) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
              user: testEmail,
              pass: profile.email_password
            }
          });
        } else if (isOutlook) {
          transporter = nodemailer.createTransport({
            host: 'smtp-mail.outlook.com',
            port: 587,
            secure: false, // false = use STARTTLS (upgrade connection to TLS)
            requireTLS: true, // Require STARTTLS/TLS encryption
            auth: {
              user: testEmail,
              pass: profile.email_password
            },
            tls: {
              ciphers: 'SSLv3',
              rejectUnauthorized: false // Some Outlook setups require this
        }
      });
    } else {
      transporter = nodemailer.createTransport({
        host: 'smtp-mail.outlook.com',
        port: 587,
            secure: false, // false = use STARTTLS (upgrade connection to TLS)
            requireTLS: true, // Require STARTTLS/TLS encryption
        auth: {
              user: testEmail,
              pass: profile.email_password
        },
        tls: {
              ciphers: 'SSLv3',
              rejectUnauthorized: false // Some Outlook setups require this
            }
          });
        }
      }

      console.log('[EMAIL TEST] Attempting connection with:', { 
        email: testEmail, 
        config: configUsed.host ? configUsed : 'auto-detect',
        timestamp: new Date().toISOString()
      });
      
      await transporter.verify();
      
      console.log('[EMAIL TEST] Connection successful!');
      return { success: true, email: testEmail, config: configUsed };
    };

    // Try with the provided email first
    try {
      const result = await testEmailConnection(email);
      res.json({ success: true, message: 'Email connection test successful' });
      return;
    } catch (error) {
      // If using custom SMTP with Outlook and authentication fails, try with @outlook.com username
      if (smtp_host && smtp_host.includes('outlook')) {
        const emailDomain = email.split('@')[1]?.toLowerCase() || '';
        const isOutlookDomain = emailDomain.includes('outlook.com') || 
                               emailDomain.includes('hotmail.com') || 
                               emailDomain.includes('live.com') ||
                               emailDomain.includes('msn.com');
        
        // If not already using @outlook.com and we have a username specified or it's a different domain
        if (isOutlookDomain && !emailDomain.includes('outlook.com') && !smtp_username) {
          const username = email.split('@')[0];
          const outlookEmail = `${username}@outlook.com`;
          
          console.log(`[EMAIL TEST] Custom SMTP auth failed, trying with @outlook.com username: ${outlookEmail}`);
          
          try {
            // Try with @outlook.com as the username
            const retryProfile = { ...testProfile, email: outlookEmail, smtp_username: outlookEmail };
            const retryConfig = {
              host: smtp_host,
              port: smtp_port ? parseInt(smtp_port) : 587,
              secure: smtp_secure === true || smtp_secure === 1,
              auth: {
                user: outlookEmail,
                pass: email_password
              }
            };
            
            if (!retryConfig.secure) {
              retryConfig.tls = { ciphers: 'SSLv3' };
            }
            
            const retryTransporter = nodemailer.createTransport(retryConfig);
            await retryTransporter.verify();
            
            res.json({ 
              success: true, 
              message: 'Email connection test successful! Note: Outlook required the @outlook.com address as the SMTP username.',
              usedEmail: outlookEmail,
              usedSmtpUsername: outlookEmail
            });
            return;
          } catch (retryError) {
            console.log('[EMAIL TEST] Retry with @outlook.com also failed');
            // Continue to show the original error with improved suggestions
          }
        }
      }
      // Log detailed error information
      console.error('[EMAIL TEST] Connection failed:', {
        error: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        stack: error.stack?.substring(0, 500)
      });
      
      // Check if it's an Outlook authentication error and we're using an alias
      const isAuthError = error.message && (
        error.message.includes('Invalid login') ||
        error.message.includes('Authentication unsuccessful') ||
        error.message.includes('535') ||
        error.message.includes('534') ||
        error.message.includes('530') ||
        error.code === 'EAUTH'
      );
      
      const isConnectionError = error.code && (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET'
      );

      // If it's an Outlook domain and we're not already using @outlook.com, try with @outlook.com
      // Only if custom SMTP is not configured
      if (isAuthError && !smtp_host) {
        const emailDomain = email.split('@')[1]?.toLowerCase() || '';
        const isOutlook = emailDomain.includes('outlook.com') || 
                         emailDomain.includes('hotmail.com') || 
                         emailDomain.includes('live.com') ||
                         emailDomain.includes('msn.com');
        
        if (isOutlook && !emailDomain.includes('outlook.com')) {
          const username = email.split('@')[0];
          const outlookEmail = `${username}@outlook.com`;
          
          console.log(`[EMAIL TEST] First attempt failed, trying with @outlook.com domain: ${outlookEmail}`);
          
          try {
            await testEmailConnection(outlookEmail);
            res.json({ 
              success: true, 
              message: 'Email connection test successful! Note: Outlook required the @outlook.com domain instead of your alias.',
              usedEmail: outlookEmail
            });
            return;
          } catch (retryError) {
            // Both attempts failed
            const retryIsAuthError = retryError.message && (
              retryError.message.includes('Invalid login') ||
              retryError.message.includes('Authentication unsuccessful') ||
              retryError.message.includes('535') ||
              retryError.code === 'EAUTH'
            );

            if (retryIsAuthError) {
              res.status(400).json({ 
                error: 'Email authentication failed. This could be due to:\n' +
                       '• Incorrect password\n' +
                       '• Two-factor authentication (2FA) is enabled - you may need to use an App Password instead of your regular password\n' +
                       '• For Outlook aliases, try using your primary @outlook.com email address\n' +
                       '• Your account may require additional security settings to allow SMTP access',
                details: 'Both the provided email and @outlook.com domain were tried. Please verify your credentials.'
              });
              return;
            }
            throw retryError;
          }
        }
      }

      // Handle connection errors
      if (isConnectionError) {
        let errorMessage = 'Could not connect to the email server.';
        let suggestions = [];
        
        if (smtp_host) {
          errorMessage = `Could not connect to ${smtp_host}:${smtp_port || 587}`;
          suggestions.push(`• Verify the SMTP host "${smtp_host}" is correct`);
          suggestions.push(`• Verify the SMTP port "${smtp_port || 587}" is correct`);
          suggestions.push('• Check if your firewall is blocking the connection');
          suggestions.push('• Try a different port (587 for TLS, 465 for SSL)');
        } else {
          errorMessage = 'Could not connect to the email server.';
          suggestions.push('• Check your internet connection');
          suggestions.push('• Try configuring custom SMTP settings manually');
        }
        
        res.status(400).json({ 
          error: errorMessage,
          suggestions: suggestions.join('\n'),
          details: error.message || error.code || 'Connection failed',
          diagnostic: {
            code: error.code,
            host: smtp_host || 'auto-detect',
            port: smtp_port || 'auto-detect'
          }
        });
        return;
      }
      
      // Handle authentication errors
      if (isAuthError) {
        let errorMessage = 'Email authentication failed.';
        let suggestions = [];
        const authUser = smtp_username || email;
        const isOutlook535 = error.message && error.message.includes('535 5.7.139');
        const isBasicAuthDisabled = error.message && error.message.includes('basic authentication is disabled');

        if (smtp_host) {
          errorMessage = `Authentication failed for ${authUser}@${smtp_host}`;
          
          if (isBasicAuthDisabled) {
            errorMessage = 'Outlook/Office365 Basic Authentication is Disabled';
            suggestions.push('• Your Microsoft account has basic authentication (username/password) disabled');
            suggestions.push('• This means even App Passwords will not work for SMTP');
            suggestions.push('• For Office 365 Family (personal accounts):');
            suggestions.push('  - Go to https://account.microsoft.com/security');
            suggestions.push('  - Check "Security defaults" settings - this may be blocking SMTP');
            suggestions.push('  - Look for "App passwords" section and verify 2FA is properly configured');
            suggestions.push('  - Microsoft may have permanently disabled basic auth for your account');
            suggestions.push('• Unfortunately, Microsoft has been phasing out basic authentication for personal accounts');
            suggestions.push('• You may need to use a different email provider (Gmail, etc.) that still supports basic auth');
            suggestions.push('• Or consider using a business email account that allows SMTP AUTH to be enabled');
          } else if (isOutlook535) {
            errorMessage = 'Outlook authentication failed (Error 535 5.7.139)';
            suggestions.push('• This error typically means Outlook rejected your credentials');
            suggestions.push('• Verify you\'re using an App Password (not your regular password) if 2FA is enabled');
            suggestions.push('• Make sure the App Password was generated for "Mail" or "Other" app type');
            suggestions.push('• Try using your primary @outlook.com email address in the "SMTP Username" field (even if your email is an alias)');
            suggestions.push('• Verify the App Password was copied correctly (no extra spaces)');
            suggestions.push('• Check if your Microsoft account has "Security defaults" enabled - you may need to disable it or use Conditional Access');
            suggestions.push('• Try port 587 with "SMTP Secure" unchecked (TLS), or port 465 with "SMTP Secure" checked (SSL)');
            suggestions.push('• If using a custom domain with Outlook, ensure SMTP is enabled in your Microsoft 365 admin center');
          } else {
            suggestions.push(`• Verify the SMTP username "${authUser}" is correct`);
            suggestions.push('• Verify the password/App Password is correct');
            suggestions.push(`• Verify the SMTP host "${smtp_host}" is correct for your email provider`);
            suggestions.push(`• Verify the SMTP port "${smtp_port || 587}" and security settings match your provider's requirements`);
            suggestions.push('• For Outlook: Make sure you\'re using an App Password if 2FA is enabled');
            suggestions.push('• For Outlook: Try using your primary @outlook.com address in the SMTP Username field');
          }
        } else {
          const emailDomain = email.split('@')[1]?.toLowerCase() || '';
          const isOutlook = emailDomain.includes('outlook.com') || 
                           emailDomain.includes('hotmail.com') || 
                           emailDomain.includes('live.com');
          
          if (isOutlook) {
            if (isBasicAuthDisabled) {
              errorMessage = 'Outlook/Office365 Basic Authentication is Disabled';
              suggestions.push('• Your Microsoft account has basic authentication (username/password) disabled');
              suggestions.push('• This means even App Passwords will not work for SMTP');
              suggestions.push('• For Office 365 Family (personal accounts):');
              suggestions.push('  - Go to https://account.microsoft.com/security');
              suggestions.push('  - Check "Security defaults" settings - this may be blocking SMTP');
              suggestions.push('  - Look for "App passwords" section and verify 2FA is properly configured');
              suggestions.push('  - Microsoft may have permanently disabled basic auth for your account');
              suggestions.push('• Unfortunately, Microsoft has been phasing out basic authentication for personal accounts');
              suggestions.push('• You may need to use a different email provider (Gmail, etc.) that still supports basic auth');
              suggestions.push('• Or consider using a business email account that allows SMTP AUTH to be enabled');
            } else if (isOutlook535) {
              errorMessage = 'Outlook authentication failed (Error 535 5.7.139)';
              suggestions.push('• This error means Outlook rejected your credentials');
              suggestions.push('• You MUST use an App Password if 2FA is enabled (regular password will not work)');
              suggestions.push('• Create a new App Password: https://account.microsoft.com/security');
              suggestions.push('• Make sure you copy the App Password exactly (16 characters, no spaces)');
              suggestions.push('• Try configuring custom SMTP settings with your primary @outlook.com address in the SMTP Username field');
              suggestions.push('• Check Microsoft account security settings - some accounts require App Passwords for SMTP');
            } else {
              suggestions.push('• Verify your password is correct');
              suggestions.push('• If you have 2FA enabled, use an App Password instead of your regular password');
              suggestions.push('• Try using your primary @outlook.com email address if you\'re using an alias');
              suggestions.push('• Check that SMTP access is enabled in your account settings');
            }
          } else if (emailDomain.includes('gmail.com')) {
            suggestions.push('• Verify your password is correct');
            suggestions.push('• If you have 2FA enabled, use an App Password instead of your regular password');
            suggestions.push('• Enable "Less secure app access" or use App Passwords in your Google Account settings');
          } else {
            suggestions.push('• Verify your email address and password are correct');
            suggestions.push('• Consider configuring custom SMTP settings in the advanced options below');
          }
        }

        // Determine actual SMTP host used (might be auto-detected from username)
        let actualSmtpHost = smtp_host;
        let actualSmtpPort = smtp_port;
        if (!actualSmtpHost && smtp_username && smtp_username.includes('@outlook.com')) {
          actualSmtpHost = 'smtp-mail.outlook.com (auto-detected from SMTP username)';
          actualSmtpPort = smtp_port || '587 (auto-detected)';
        } else if (!actualSmtpHost) {
          actualSmtpHost = 'auto-detect';
          actualSmtpPort = smtp_port || 'auto-detect';
        }
        
        res.status(400).json({ 
          error: errorMessage,
          suggestions: suggestions.join('\n'),
          details: error.message || error.code || 'Authentication failed',
          diagnostic: {
            code: error.code,
            responseCode: error.responseCode,
            command: error.command,
            email: email,
            smtpHost: actualSmtpHost,
            smtpPort: actualSmtpPort,
            smtpSecure: smtp_secure ? 'yes' : 'no',
            smtpUsername: smtp_username || email,
            note: smtp_username && smtp_username.includes('@outlook.com') && !smtp_host 
              ? 'Using Outlook SMTP (detected from SMTP username)' 
              : undefined
          }
        });
        return;
      }

      // For other errors, provide generic message with diagnostic info
      res.status(400).json({ 
        error: 'Email connection test failed',
        details: error.message || error.code || 'Unknown error',
        diagnostic: {
          code: error.code,
          responseCode: error.responseCode,
          command: error.command,
          email: email,
          smtpHost: smtp_host || 'auto-detect',
          smtpPort: smtp_port || 'auto-detect',
          smtpSecure: smtp_secure ? 'yes' : 'no',
          smtpUsername: smtp_username || email
        }
      });
    }
  } catch (error) {
    console.error('[DIRECT PROFILE ROUTE] Email test error:', error);
    
    let userMessage = 'Failed to connect to email server.';
    
    if (error.message) {
      if (error.message.includes('Invalid login') || error.message.includes('Authentication unsuccessful')) {
        userMessage = 'Email authentication failed. Please check your email address and password.';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
        userMessage = 'Could not connect to the email server. Please check your SMTP host and port settings.';
      } else {
        userMessage = error.message;
      }
    }
    
    res.status(400).json({ 
      error: userMessage,
      details: error.message || error.code || 'Unknown error occurred',
      diagnostic: {
        code: error.code,
        email: req.body?.email || 'unknown',
        smtpHost: req.body?.smtp_host || 'auto-detect',
        smtpPort: req.body?.smtp_port || 'auto-detect'
      }
    });
  }
});
*/

// Profile routes will be registered after database initialization

// Initialize database
const dbPath = join(__dirname, 'katescuts.db');

// Initialize database first, then migrate, then start server
initDatabase(dbPath)
  .then(() => migrateDatabase())
  .then(() => {
    // Create database connection after initialization
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
      } else {
        console.log('Connected to SQLite database');
      }
    });

    // Make db available to routes
    app.locals.db = db;

    // Routes - register all routes
    try {
      console.log('Registering all routes...');
      
      // Auth routes (no authentication required)
      app.use('/api/auth', authRoutes);
      console.log('✓ Auth routes registered');
      
      // Protected routes (require authentication)
      app.use('/api/appointments', appointmentsRoutes);
      console.log('✓ Appointments routes registered');
      
      app.use('/api/services', servicesRoutes);
      console.log('✓ Services routes registered');
      
      app.use('/api/locations', locationsRoutes);
      console.log('✓ Locations routes registered');
      
      app.use('/api/profile', profileRoutes);
      console.log('✓ Profile routes registered');
      
      app.use('/api/invoice', invoiceRoutes);
      console.log('✓ Invoice routes registered');
      
      app.use('/api/financial', financialRoutes);
      console.log('✓ Financial routes registered');
    } catch (err) {
      console.error('ERROR registering routes:', err);
      console.error(err.stack);
    }
    


    // Health check
    app.get('/api/health', (req, res) => {
      console.log('[Health Check] Route handler called');
      res.json({ status: 'ok' });
    });

    app.listen(PORT, () => {
      console.log(`\nServer running on http://localhost:${PORT}`);
      console.log('Available API endpoints:');
      console.log('  GET  /api/health');
      console.log('  POST /api/auth/register');
      console.log('  POST /api/auth/login');
      console.log('  GET  /api/auth/me');
      console.log('  GET  /api/profile (protected)');
      console.log('  PUT  /api/profile (protected)');
      console.log('  POST /api/profile/clear-postcode-resync (protected)');
      console.log('  All /api/appointments, /api/services, /api/locations, /api/invoice routes are protected');
      console.log('\nWaiting for requests...\n');
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

