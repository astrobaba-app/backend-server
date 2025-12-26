# Two-Factor Authentication Migration

This migration adds Google Authenticator support to the Admin panel by adding two new fields to the `admins` table.

## What this migration does:

### New Fields Added:
1. **twoFactorEnabled** (BOOLEAN)
   - Default: `false`
   - Indicates if Two-Factor Authentication is enabled for the admin account

2. **twoFactorSecret** (VARCHAR(255))
   - Stores the secret key for Google Authenticator TOTP generation
   - Only populated when 2FA is enabled

## How to run:

### Option 1: Run the migration script
```bash
cd backend-server
node migrations/runTwoFactorMigration.js
```

### Option 2: Use the migration module directly
```javascript
const { sequelize } = require("./dbConnection/dbConfig");
const migration = require("./migrations/addTwoFactorFieldsToAdmin");

async function runMigration() {
  const queryInterface = sequelize.getQueryInterface();
  await migration.up(queryInterface);
  console.log("Migration completed!");
}

runMigration();
```

## Rollback:

If you need to rollback this migration:

```javascript
const { sequelize } = require("./dbConnection/dbConfig");
const migration = require("./migrations/addTwoFactorFieldsToAdmin");

async function rollback() {
  const queryInterface = sequelize.getQueryInterface();
  await migration.down(queryInterface);
  console.log("Rollback completed!");
}

rollback();
```

## Verification:

After running the migration, verify the columns were added:

```sql
-- Check if columns exist
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'admins' 
AND column_name IN ('twoFactorEnabled', 'twoFactorSecret');
```

Expected output:
```
column_name      | data_type         | column_default
-----------------+-------------------+----------------
twoFactorEnabled | boolean           | false
twoFactorSecret  | character varying | NULL
```

## Dependencies:

The following npm packages are required (already installed in package.json):
- `speakeasy` (^2.0.0) - For TOTP generation and verification
- `qrcode` (^1.5.4) - For QR code generation

## Features Enabled:

Once the migration is complete, admins can:
1. Enable 2FA in their profile settings
2. Scan the QR code with Google Authenticator app
3. Verify their setup with a 6-digit code
4. Disable 2FA by re-verifying with a code

## API Endpoints:

The following endpoints are available after migration:
- `POST /api/admin/2fa/enable` - Generate QR code and secret
- `POST /api/admin/2fa/verify` - Verify and activate 2FA
- `POST /api/admin/2fa/disable` - Disable 2FA (requires verification)
