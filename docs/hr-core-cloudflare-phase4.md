# HR Core Cloudflare — Phase 4

This phase connects the administrative employee workspace to the HR Core Worker for operational HR data when `VITE_USE_HR_D1=true` and `VITE_HR_CORE_API_URL` is configured.

## D1-backed operations

- Employee leave request list
- Leave request approval and rejection
- Emergency leave creation and approval
- Partial cancellation of an approved leave day
- Employee absence list, creation, and deletion
- Employee service request list, approval, and rejection

Firestore remains as a fallback only when the HR D1 feature flag is disabled. In-app notifications still use the current notification infrastructure during the transition.

## Verification

- HR Worker tests: 14 passed
- Leave helper tests: 5 passed
- Production Vite build: passed
