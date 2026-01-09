# Automatic Admin User Setup

The application now **automatically creates a super admin user** when the server starts, if one doesn't already exist.

## How It Works

1. **On Server Startup:**
   - Database is initialized
   - Migrations run (ensures all columns exist)
   - Admin user is automatically created if missing

2. **Default Credentials:**
   - **Username:** `admin`
   - **Password:** `admin123!`
   - **Email:** (none)

3. **Customization via Environment Variables:**
   You can customize the admin credentials by setting environment variables:
   ```bash
   ADMIN_USERNAME=myadmin
   ADMIN_PASSWORD=MySecurePassword123!
   ADMIN_EMAIL=admin@example.com
   ```

## For Docker/Production

Add to your `docker-compose.yml` or environment:
```yaml
environment:
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=YourSecurePasswordHere
  - ADMIN_EMAIL=admin@yourdomain.com
```

## What Gets Created

- Super admin user with `is_super_admin = 1`
- Default services (24 services) for the admin user
- All necessary database columns are automatically added

## Database Schema

The `users` table automatically includes:
- `id` (PRIMARY KEY)
- `username` (UNIQUE)
- `password_hash`
- `email`
- `is_super_admin` (INTEGER, DEFAULT 0)
- `created_at` (TIMESTAMP)

## Manual Override

If you need to manually create/update an admin user, you can still use:
```bash
node scripts/create-admin-remote.js <username> <password> [email]
```

## Security Note

⚠️ **Important:** The default password is `admin123!` - **change it immediately after first login!**

For production, always set `ADMIN_PASSWORD` environment variable to a strong password.
