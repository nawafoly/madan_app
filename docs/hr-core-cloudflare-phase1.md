# HR Core Cloudflare migration — Phase 1

This phase creates a Cloudflare-owned source of truth for:

- administrative accounts and roles;
- explicit permission overrides;
- employee identity and employment profile data;
- HR audit logs;
- Firestore-to-D1 migration runs.

It intentionally does **not** switch the production React screens yet. Firebase Authentication remains temporarily active only to identify the caller. The Worker verifies the Firebase ID token cryptographically, then reads the account, role, active status, permissions, and employee profile from D1. It does not query Firestore during normal API requests.

## Resources

- Worker: `maedin-hr-api`
- D1 database: `maedin-hr`
- D1 binding: `HR_DB`
- Wrangler config: `workers/wrangler.hr.toml`
- Migrations: `workers/hr-migrations`

## One-time setup

Create the database:

```powershell
cd C:\Users\nawaf\Downloads\madan
npx wrangler d1 create maedin-hr
```

Copy the returned `database_id` into:

```text
workers/wrangler.hr.toml
```

Replace:

```text
REPLACE_WITH_MAEDIN_HR_DATABASE_ID
```

Create a strong migration secret and store it only in Cloudflare:

```powershell
$syncSecret = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$syncSecret | npx wrangler secret put HR_SYNC_SECRET --config workers/wrangler.hr.toml
$env:HR_SYNC_SECRET = $syncSecret
```

Apply the database migrations:

```powershell
npm run hr:d1:migrate:remote
```

Deploy the Worker:

```powershell
npm run hr:worker:deploy
```

After deployment, save the Worker URL for the migration tool:

```powershell
$env:HR_CORE_API_URL = "https://maedin-hr-api.<your-subdomain>.workers.dev"
```

## Safe migration sequence

Run a read-only audit first:

```powershell
npm run hr:migrate:dry
```

Review the generated report under:

```text
reports/hr-core-migration/
```

Then import in batches:

```powershell
npm run hr:migrate
```

Verify counts:

```powershell
Invoke-RestMethod "$env:HR_CORE_API_URL/health"
```

## Frontend feature flags for the next phase

Do not enable the D1 UI switch during Phase 1. The API client is ready at:

```text
client/src/lib/hrCoreApi.ts
```

The next phase will set:

```text
VITE_HR_CORE_API_URL=https://maedin-hr-api.<your-subdomain>.workers.dev
VITE_USE_HR_D1=true
```

Only after the migrated employee and account counts are checked will the employee list and employee details screens be switched from Firestore to D1.
