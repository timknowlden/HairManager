# SendGrid Email Relay Setup Guide

## Quick Setup (5 minutes)

### Step 1: Create SendGrid Account

1. Go to: https://signup.sendgrid.com/
2. Sign up for a free account (100 emails/day free)
3. Verify your email address

### Step 2: Get Your API Key

1. Log in to SendGrid: https://app.sendgrid.com/
2. Go to **Settings** → **API Keys** (or visit: https://app.sendgrid.com/settings/api_keys)
3. Click **Create API Key**
4. Choose **Full Access** (or at minimum, **Mail Send** permission)
5. Give it a name like "HairManager Invoice Emails"
6. **IMPORTANT**: Copy the API key immediately - you won't see it again!
   - It will look like: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Create & Verify Sender Identity (REQUIRED)

**⚠️ IMPORTANT: You MUST verify a sender before SendGrid will send emails!**

SendGrid requires sender verification for security and deliverability. You have two options:

#### Option A: Single Sender Verification (Quickest - Recommended for testing)

1. Go to **Settings** → **Sender Authentication** (or visit: https://app.sendgrid.com/settings/sender_auth/senders)
2. Click **Create a Sender**
3. Fill in the form:
   - **From Email**: The email address you want to send from (e.g., `your-email@example.com` or `invoices@example.com`)
   - **From Name**: Your business name (e.g., "HairManager")
   - **Reply To**: Same as From Email (or a different one if you want replies to go elsewhere)
   - **Company Address**: Your business address
   - **City, State, Zip, Country**: Your location
4. Click **Create**
5. **Check your email** - SendGrid will send a verification email
6. **Click the verification link** in the email
7. Once verified, you can use this email address in the app

#### Option B: Domain Authentication (More Professional - Recommended for production)

If you own a domain (like `knowlden.org`), you can verify the entire domain:

1. Go to **Settings** → **Sender Authentication** → **Authenticate Your Domain**
2. Enter your domain name
3. SendGrid will provide DNS records (SPF, DKIM, etc.)
4. Add these records to your domain's DNS settings
5. Once verified, you can send from any email address on that domain

**For quick testing, use Option A (Single Sender).**

### Step 4: Configure in App

1. Go to **Profile Settings** in the app
2. Scroll to **Email Relay Service** section
3. Check **Enable Email Relay Service**
4. Fill in:
   - **Relay Service**: SendGrid (already selected)
   - **API Key**: Paste your SendGrid API key
   - **From Email Address**: The email you verified (or any email if using domain auth)
   - **From Name**: Your business name (e.g., "HairManager")
5. Click **Save Settings**

### Step 5: Test

1. Try sending a test invoice email
2. Check the recipient's inbox (and spam folder)
3. If it works, you're all set! 🎉

## Troubleshooting

### "Invalid API Key" Error
- Make sure you copied the entire API key (starts with `SG.`)
- Check that the API key has "Mail Send" permissions
- Try creating a new API key

### "Sender not verified" Error
- Verify your sender email in SendGrid
- Make sure the "From Email Address" matches a verified sender

### Emails going to spam
- Complete domain authentication (more professional)
- Add SPF/DKIM records to your domain
- Use a professional "From Name"

## Benefits

✅ **No Microsoft authentication issues** - Bypasses all Outlook/Office365 restrictions
✅ **100 free emails/day** - Perfect for small businesses
✅ **Reliable delivery** - Professional email infrastructure
✅ **Easy setup** - No complex OAuth or SMTP configuration
✅ **Works with any email** - Send from any address you verify

## Free Tier Limits

- **SendGrid Free**: 100 emails/day
- If you need more, paid plans start at $19.95/month for 50,000 emails

## Alternative Services

If SendGrid doesn't work for you:
- **Mailgun**: 5,000 emails/month free
- **Amazon SES**: Very cheap, pay-as-you-go
- **Postmark**: Great for transactional emails

The app currently supports SendGrid, but we can add support for other services if needed.

