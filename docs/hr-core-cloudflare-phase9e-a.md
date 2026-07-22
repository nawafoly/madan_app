# HR Core Cloudflare Phase 9E-A

Phase 9E-A moves authenticated HR role, status and effective permissions from Firestore to GET /api/hr/me on Cloudflare D1. Firebase Authentication remains responsible only for session authentication. Public Firebase users absent from HR D1 remain clients on the public surface, while missing accounts are denied on the staff surface.
