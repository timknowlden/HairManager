# Manual Super Admin Setup Guide

This guide shows you how to create a super admin user on a remote server using either SQL commands or the provided script.

## Option 1: Using the Script (Recommended)

The easiest way is to use the existing script:

```bash
# On your remote server
cd /path/to/HairManager
node scripts/create-super-admin.js
```

**Note:** You'll need to edit `scripts/create-super-admin.js` first to set your desired username and password (lines 16-17).

## Option 2: Manual SQL Execution

If you need to create a super admin manually via SQL, follow these steps:

### Step 1: Generate Password Hash

You need to hash your password using bcrypt. You can do this in several ways:

#### Method A: Using Node.js (on the server)
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YourPassword123!', 10).then(hash => console.log(hash));"
```

#### Method B: Using Python (if bcrypt is installed)
```python
import bcrypt
password = b'YourPassword123!'
hashed = bcrypt.hashpw(password, bcrypt.gensalt())
print(hashed.decode())
```

#### Method C: Create a temporary script
```javascript
// hash-password.js
import bcrypt from 'bcrypt';
const password = 'YourPassword123!';
const hash = await bcrypt.hash(password, 10);
console.log(hash);
```

Run: `node hash-password.js`

### Step 2: Execute SQL

Once you have the password hash, connect to your SQLite database and run:

```sql
-- Check if user already exists
SELECT id, username, is_super_admin FROM users WHERE username = 'admin';

-- Option A: Create a NEW super admin user
INSERT INTO users (username, password_hash, email, is_super_admin) 
VALUES ('admin', '$2b$10$YOUR_HASHED_PASSWORD_HERE', 'admin@example.com', 1);

-- Option B: Update an EXISTING user to be super admin
UPDATE users 
SET is_super_admin = 1, password_hash = '$2b$10$YOUR_HASHED_PASSWORD_HERE' 
WHERE username = 'admin';

-- Verify the user was created/updated
SELECT id, username, email, is_super_admin FROM users WHERE username = 'admin';
```

### Step 3: Verify

After creating/updating, verify with:
```sql
SELECT id, username, email, is_super_admin, created_at 
FROM users 
WHERE is_super_admin = 1;
```

## Option 3: Quick SQLite Command Line

If you have direct access to the database file on the server:

```bash
# Connect to the database
sqlite3 /path/to/data/hairmanager.db

# Then run the SQL commands from Option 2
```

## Database Location

The database location depends on your environment:

- **Development**: `./hairmanager.db` (in project root)
- **Production/Docker**: `./data/hairmanager.db` (in data directory)
- **Custom**: Check your `NODE_ENV` and deployment configuration

## Example: Complete Manual Setup

```bash
# 1. SSH into your server
ssh user@your-server.com

# 2. Navigate to your app directory
cd /path/to/HairManager

# 3. Generate password hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('MySecurePassword123!', 10).then(hash => console.log(hash));"

# Copy the hash output (starts with $2b$10$...)

# 4. Connect to database
sqlite3 data/hairmanager.db

# 5. Insert super admin (replace HASH with your hash from step 3)
INSERT INTO users (username, password_hash, email, is_super_admin) 
VALUES ('admin', 'HASH_FROM_STEP_3', 'admin@example.com', 1);

# 6. Verify
SELECT id, username, is_super_admin FROM users WHERE username = 'admin';

# 7. Exit
.quit
```

## Troubleshooting

### "no such table: users"
- Run the migration first: `node database/migrate.js` or ensure migrations have run

### "column is_super_admin does not exist"
- The migration should add this column automatically
- Manually add it: `ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0;`

### "UNIQUE constraint failed"
- User already exists, use UPDATE instead of INSERT

## Security Notes

⚠️ **Important:**
- Never commit password hashes to version control
- Use strong passwords for super admin accounts
- Consider using environment variables for sensitive data
- After creating the admin, verify you can log in and then remove any temporary scripts
