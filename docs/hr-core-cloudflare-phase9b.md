# HR Core Cloudflare — Phase 9B

This phase completes the D1-only cutover for:

- Employee self profile loading.
- Employee phone and avatar updates.
- Employee files, payroll, leave requests, and service requests shown in the profile.
- HR attendance employee directory and attendance-zone assignments.
- Staff portal weekly-report badge counts.
- Active employee/coworker directory.

Firebase remains only for authentication and Firebase ID-token issuance during the transition.

## Security

Non-manager employees may update only:

- `phone`
- `avatarUrl`

All privileged fields such as salary, role, employment status, permissions, and leave balance remain manager-only.

## Worker release

`phase9b-self-service-profile-v1`
