# Firestore HR hotfix snippets

Use these snippets on the currently published compact rules file.

## 1. Replace `hrAllowedUserFieldsOnly`

```rules
function hrAllowedUserFieldsOnly() {
  let keys = request.resource.data.diff(resource.data).changedKeys();
  return keys.hasOnly([
    "name",
    "displayName",
    "fullName",
    "email",
    "phone",
    "photoURL",
    "profile",
    "title",
    "employeeProfile",
    "employeeProfileEnabled",
    "includeInEmployeeManagement",
    "linkedEmployeeId",
    "jobTitle",
    "department",
    "employmentStatus",
    "employment",
    "startDate",
    "leaveBalance",
    "allowedZoneIds",
    "adminNotes",
    "employeeId",
    "updatedAt"
  ]);
}
```

## 2. Add `employee_service_requests`

Add this block before `match /employee_files/{fileId}` or before `match /employees/{employeeId}`.

```rules
match /employee_service_requests/{requestId} {
  allow create: if signedIn()
    && (
      (("employeeUid" in request.resource.data) && request.resource.data.employeeUid == request.auth.uid)
      || (("userId" in request.resource.data) && request.resource.data.userId == request.auth.uid)
      || (("uid" in request.resource.data) && request.resource.data.uid == request.auth.uid)
    );

  allow get, list: if isAdmin()
    || isHr()
    || (
      signedIn()
      && (
        (("employeeUid" in resource.data) && resource.data.employeeUid == request.auth.uid)
        || (("userId" in resource.data) && resource.data.userId == request.auth.uid)
        || (("uid" in resource.data) && resource.data.uid == request.auth.uid)
      )
    );

  allow update, delete: if isAdmin() || isHr();
}
```
