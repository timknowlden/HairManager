# Microsoft Graph API OAuth2 Setup Guide

## Overview

Since Microsoft has disabled basic authentication for Office 365 Family accounts, we've implemented Microsoft Graph API with OAuth2 as an alternative to SMTP.

## ⚠️ Important Note for Office 365 Family Accounts

**Personal Microsoft accounts (Office 365 Family) have limitations:**
- You cannot easily create Azure App Registrations with personal accounts
- Azure App Registration typically requires a business/enterprise account
- Personal accounts may need to use alternative solutions

## Option 1: Use Gmail Instead (Easiest for Personal Accounts)

**Recommended for Office 365 Family accounts**

Gmail still supports basic authentication with App Passwords:

1. Create or use a Gmail account
2. Enable 2FA
3. Generate an App Password
4. Use these SMTP settings:
   - **SMTP Host**: `smtp.gmail.com`
   - **SMTP Port**: `587`
   - **SMTP Secure**: Unchecked
   - **SMTP Username**: Your Gmail address
   - **Email Password**: Your Gmail App Password

## Option 2: Microsoft Graph API (For Business Accounts)

If you have a **Microsoft 365 Business** account, you can use Graph API:

### Step 1: Register an Azure App

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: "HairManager Email App" (or any name)
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**: Leave blank for now
5. Click **Register**
6. Note down:
   - **Application (client) ID** → This is your `Azure Client ID`
   - **Directory (tenant) ID** → This is your `Azure Tenant ID`

### Step 2: Create a Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and set expiration
4. Click **Add**
5. **IMPORTANT**: Copy the secret value immediately (you won't see it again)
   - This is your `Azure Client Secret`

### Step 3: Grant API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions**
5. Add: **Mail.Send**
6. Click **Add permissions**
7. Click **Grant admin consent** (if you're an admin)

### Step 4: Configure in Profile Settings

1. Go to Profile Settings in the app
2. Enable "Use Microsoft Graph API"
3. Enter:
   - **Azure Client ID**: From Step 1
   - **Azure Client Secret**: From Step 2
   - **Azure Tenant ID**: From Step 1
4. Save settings

## Option 3: Use Email Relay Service (Simplest)

For transactional emails, consider using a service like:
- **SendGrid** (free tier: 100 emails/day)
- **Mailgun** (free tier: 5,000 emails/month)
- **Amazon SES** (very cheap)

These services avoid Microsoft's authentication restrictions entirely.

## Testing

After setup:
1. Go to Profile Settings
2. Click "Test Connection" (if using SMTP)
3. Or try sending a test invoice email

## Troubleshooting

### Graph API Errors

- **"Invalid client"**: Check your Client ID and Tenant ID
- **"Invalid client secret"**: Secret may have expired, create a new one
- **"Insufficient privileges"**: Make sure Mail.Send permission is granted and consented
- **"User not found"**: Make sure the email address matches your Microsoft account

### For Personal Accounts

If you have an Office 365 Family account and can't create Azure apps:
- **Use Gmail instead** (Option 1 above)
- **Use an email relay service** (Option 3 above)
- **Contact Microsoft Support** to see if they can enable SMTP AUTH for your account

