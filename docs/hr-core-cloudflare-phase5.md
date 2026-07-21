# HR Core Cloudflare Phase 5

This phase connects the employee portal leave and service-request workflows to the Cloudflare HR Core API and D1.

## D1-backed employee portal operations

- Read the current employee's leave requests from D1.
- Submit leave requests to D1.
- Read the current employee's HR/service requests from D1.
- Submit permission, overtime, salary advance, resignation, exit/re-entry, letter, and attendance correction requests to D1.
- Refresh the portal lists immediately after successful submission.
- Preserve Firestore as a feature-flag fallback during the staged migration.

## Transitional dependency

In-app notification delivery still uses the existing Firebase notification collection. Notification failure no longer causes a successfully stored D1 request to be shown as failed.
