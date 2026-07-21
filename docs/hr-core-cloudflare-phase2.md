# Maedin HR Core — Phase 2

This phase connects the administrative Employees page to Cloudflare HR Core.

## Enabled behavior

When both environment variables are enabled:

- The employee list is read from `maedin-hr-api` / D1.
- Employee profile edits continue writing to Firestore temporarily for compatibility with unmigrated HR modules.
- The same edit is written to D1 and the local UI is refreshed from the D1 response.
- Firebase Authentication remains the temporary identity provider for the API token.

## Environment variables

```env
VITE_USE_HR_D1=true
VITE_HR_CORE_API_URL=https://maedin-hr-api.maedin.workers.dev
```

## Rollback

Set `VITE_USE_HR_D1=false` to restore the previous Firestore list source without reverting code.

## Validation

- `npm run build`
- `npm test -- --run server/hr-core-worker.test.ts client/src/lib/employeeLeave.test.ts`
