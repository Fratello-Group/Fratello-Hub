# Fratello Hub Data Layer

This folder holds shared browser-side API helpers. Time-off tools should import `system/api/firestore-client.js` instead of calling Firebase directly.

## Firestore Collections

- `users` is the Fratello team directory and approval-routing source of truth.
- `time_off_requests` stores vacation requests and sick day records in one collection, separated by `type`.
- `approvals` is an append-only audit trail. Browser code must not write it directly.
- `activity_log` stores Hub usage events. Browser code should go through a future server endpoint.
- `notifications` stores outbound email attempts for audit/debugging.
- `holidays` stores Alberta and federal statutory holidays.
- `settings/global` stores Hub-wide feature flags and defaults.

## Front-End Client

Use:

```js
import {
    getUserByEmail,
    submitTimeOffRequest,
    getMyRequests,
    getTeamRequests,
    approveRequest,
    denyRequest,
    getHolidays
} from '../../system/api/firestore-client.js';
```

The exported functions are intentionally small and async:

- `getUserByEmail(email)`
- `getCurrentUser()`
- `getUsers()` and `getActiveUsers()` for Owner/Controller admin screens
- `submitTimeOffRequest(input)`
- `getMyRequests(options)`
- `getRequestsForApproval(options)`
- `getTeamRequests(options)`
- `getRequestById(requestId)`
- `cancelRequest(requestId)`
- `approveRequest(requestId, comment)`
- `denyRequest(requestId, comment)`
- `getHolidays(options)`
- `getGlobalSettings()`
- `getApprovalsForRequest(requestId)`

## Privacy Notes

Sick day records are only readable by the requesting user, Owner, and Controller. Managers cannot read sick days for their direct reports.

Direct Firestore reads also do not expose every vacation document to every employee. That protects notes and requester details. A future Netlify Function should create anonymized calendar entries for broad team-calendar views, because Firestore security rules cannot return only selected fields from a document.

## Approval Actions

`approveRequest` and `denyRequest` call `/.netlify/functions/time-off-approval-action`. Agent 4 should implement that endpoint so approval writes happen on the server, where the Admin SDK can append to `approvals` and update `time_off_requests` safely.
