# Fratello Hub Project Update

Use this as the current project context for Claude.

## Plain-English Summary

The Fratello Ops Hub is now more than a static internal links page. It has a real Firebase login system, Firestore database wiring, role-based access, multiple internal tools, and the first version of the time-off system.

The Hub is still in development, not fully production-ready. Some pieces are built in code but need Firebase/Netlify/Resend setup, database seeding, and final testing before employees use it.

## Core Project Details

- **Project:** Fratello Ops Hub
- **Live Netlify site:** `https://fratello-ops-hub.netlify.app`
- **Repository:** `Fratello-Group/Fratello-Hub`
- **Hosting:** Netlify, deployed from GitHub `main`
- **Auth provider:** Firebase Authentication
- **Database:** Cloud Firestore
- **Frontend style:** Static HTML/CSS/JavaScript pages using Fratello design tokens
- **Primary brand direction:** Clean, modern, Fratello-branded, lighter/brighter for tools, with a persistent Hub header/back navigation

## What Is Already Wired Up

### 1. Firebase Authentication

The Hub now uses Firebase Authentication for professional login.

Supported sign-in methods:

- Google sign-in
- Email/password sign-in
- Firebase password reset emails

Current Firebase web config is stored in:

```text
/system/firebase-config.js
```

Owner emails currently recognized:

```text
prefontainech@gmail.com
russ@fratellocoffee.com
```

Important note: public self-signup should remain disabled in Firebase. Users should be invited or created by Owner/Admin, then assigned a Hub profile.

### 2. Role-Based Hub Access

The Hub currently has these access profiles:

- Owner
- Controller
- Production
- Marketing
- Sales
- Staff

The main Hub page filters what a user sees based on their profile.

Main role/profile logic lives in:

```text
/system/fratello-auth.js
/index.html
/system/permissions.html
```

### 3. Firestore Foundation

Firestore is now wired into the codebase as the persistent database layer for future stateful tools.

Important files:

```text
/firestore.rules
/firestore-rules.test.js
/scripts/seed-firestore.js
/system/api/firestore-client.js
/system/api/README.md
/docs/FIRESTORE-SETUP.md
```

The Firestore structure includes:

- `users`
- `time_off_requests`
- `approvals`
- `activity_log`
- `notifications`
- `holidays`
- `settings`

The seed script includes:

- 18 Fratello team members
- Approval routing
- 2026, 2027, and 2028 Canadian/Alberta stat holidays
- Default global settings

Important privacy rule:

**Sick day records are private. Managers cannot see sick-day details for their teams. Sick days are visible only to the employee, Owner, and Controller.**

### 4. Firestore Security Rules

Rules have been written for the new database layer.

The key protection is:

- Owners and Controller can see all time-off records.
- Employees can see their own records.
- Approvers can see vacation requests assigned to them.
- Managers cannot see sick-day records for their direct reports.
- Activity logs are Owner-only.
- Notifications are Owner-only.
- Approvals are read by Owner, Controller, and the approver.

The local rules simulation passed.

Important test file:

```text
/firestore-rules.test.js
```

### 5. Netlify Functions

The project now includes Netlify server functions for time-off and system workflows.

Built functions:

```text
/netlify/functions/time-off-approval-action.js
/netlify/functions/notify-on-request-submit.js
/netlify/functions/notify-on-status-change.js
/netlify/functions/notify-on-sick-day.js
/netlify/functions/check-escalations.js
/netlify/functions/calendar-ics.js
/netlify/functions/log-activity.js
/netlify/functions/firestore-smoke-test.js
```

Shared server runtime:

```text
/netlify/functions/templates/_runtime.js
```

Email templates:

```text
/netlify/functions/templates/base.html
/netlify/functions/templates/request-submitted.html
/netlify/functions/templates/status-change.html
/netlify/functions/templates/sick-day.html
/netlify/functions/templates/escalation-reminder.html
/netlify/functions/templates/escalated.html
```

### 6. Email Notification Wiring

Email notifications are designed around Resend.

Planned sender:

```text
hub@fratellocoffee.com
```

Environment variables expected in Netlify:

```text
RESEND_API_KEY
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME
```

Setup guide:

```text
/docs/handoffs/resend-setup.md
```

Current status: code is built, but actual email sending depends on Resend account setup, API key, domain verification, and Netlify environment variables.

### 7. Calendar Feed Wiring

The Hub now has an ICS calendar feed function:

```text
/netlify/functions/calendar-ics.js
```

Friendly route:

```text
/api/calendar.ics
```

Route file:

```text
/_redirects
```

Calendar feed behavior:

- Team calendar shows approved vacation and stat holidays.
- Personal calendar can show a user’s own time off.
- Owner/Controller private feed can include sick days.
- Sick days are never included in normal manager/team vacation calendar views.

Calendar subscription page:

```text
/hr/time-off/calendar-subscribe.html
```

### 8. Time-Off System

The first version of the time-off system has been built.

Pages:

```text
/hr/time-off/vacation-tracker.html
/hr/time-off/sick-day-logger.html
/hr/time-off/sick-day-report.html
/hr/time-off/review.html
/hr/time-off/calendar-subscribe.html
```

Vacation Tracker includes:

- Submit vacation request
- Month calendar
- Team timeline
- My requests
- Approvals queue for managers

Sick Day Logger includes:

- Simple mobile-friendly sick-day entry
- Date defaults to today
- Half-day option
- Category dropdown
- Optional short operational note
- No symptoms, diagnosis, attachments, or doctor’s notes
- User can see their own recent sick-day records

Sick Day Report includes:

- Owner/Controller-only access
- Filters by employee, department, category, and date range
- Current-quarter summary
- Trend flag for 3+ sick days in 30 days
- CSV export

Approval Review page includes:

- Deep link from email
- Request details
- Team vacation context
- Approve/deny actions
- No sick-day data shown

### 9. Admin Pages

Built admin pages:

```text
/system/admin/users.html
/system/admin/activity-log.html
```

User Management:

- Owner/Controller view
- Add/edit user records
- Assign department
- Assign role tier
- Assign manager
- Toggle active/inactive
- CSV import concept

Activity Log:

- Owner-only
- View recent Hub activity
- Filter by event type/date/search
- Export CSV

Activity logging function:

```text
/netlify/functions/log-activity.js
```

Frontend helper:

```text
/system/api/activity-logger.js
```

### 10. Existing Hub Tools

The Hub also currently includes these tools/resources.

#### Staff Permissions

```text
/system/permissions.html
```

Purpose:

- Owner-only access profile management
- Invite/add users
- Assign access profile
- Disable users
- Create reset links

#### Hiring Document Generator

```text
/hr/hiring/hiring-document-generator.html
```

Purpose:

- Generate offer letters, employment agreements, and job descriptions
- Includes role presets and Fratello hiring document logic
- PDF output remains as originally designed
- Tool UI was updated to better match the Hub

#### Wholesale Proposal Builder

```text
/sales/proposal-builder.html
```

External app embedded/linked through Hub:

```text
https://fratello-proposal-builder.vercel.app/
```

Purpose:

- Create wholesale product proposals
- Share proposal links
- Save/export proposals

#### Employee Expense Reimbursement

```text
/operations/forms/expense-report.html
```

Purpose:

- Enter reimbursable business expenses one at a time
- GST handling defaults to GST included
- Can turn GST off or enter manual GST
- Builds a clean report
- Can download HTML report and CSV
- Exported report uses the Fratello logo

#### Fratello Design Skill

```text
/system/skills/fratello-design-skill.html
/system/skills/fratello-design-skill.md
```

Purpose:

- Lets staff download/use the Fratello Claude design skill
- Helps create on-brand Fratello content in Claude

## Current Hub Sections

The Hub is organized into:

- Departments
- Employee Resources
- Owner/Admin

Current department sections:

- Finance
- Production
- Sales
- Marketing
- HR & People

The home page has been moving toward a cleaner design:

- Live tools are pulled forward
- Department sections are more compact
- Role/access labels are less visually heavy
- Tools use a brighter, cleaner Fratello look where appropriate

## Important Setup Still Needed

These items may already be partially done, but should be confirmed before production use.

### Firebase / Firestore

1. Confirm Firebase project is `fratello-hub`.
2. Confirm Firestore is created.
3. Publish `firestore.rules`.
4. Add Netlify environment variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_SERVICE_ACCOUNT
```

5. Run the seed script:

```text
npm run seed:firestore -- --dry-run
npm run seed:firestore
```

6. Confirm staff emails before relying on seeded users.

### Resend Email

1. Create/confirm Resend account.
2. Verify `fratellocoffee.com`.
3. Add Netlify environment variables:

```text
RESEND_API_KEY
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME
```

4. Turn on notification emails in Firestore settings when ready.

### Netlify

Confirm Netlify deploys after GitHub push to `main`.

Current site name:

```text
fratello-ops-hub
```

Current public URL:

```text
https://fratello-ops-hub.netlify.app
```

## Known Development Notes

- The time-off code is built, but should be tested on the live site after Netlify deploy.
- Some pages include prototype fallback states if Firestore is not fully connected yet.
- Firestore rules simulation passed locally.
- Script syntax checks passed locally.
- The local visual preview server could not be reached from the sandbox during the last build, so a live-browser visual QA pass is still recommended.
- `.DS_Store` may show as dirty locally; do not commit it.

## Important Privacy/Security Rules

Claude should treat these as non-negotiable:

1. Sick-day details are private.
2. Department managers must never see sick-day details for their team.
3. Sick days must never appear on the normal team vacation calendar.
4. Do not add medical symptoms, diagnoses, attachments, or doctor’s notes.
5. Approvals and audit logs should be written server-side through Netlify functions.
6. Activity Log is Owner-only unless Chris explicitly changes that rule.
7. Users should not choose their own access level.
8. Public self-signup should remain disabled.

## Current Staff / Approval Routing Assumptions

Seeded team members and routing:

| Person | Role | Department | Tier | Approver |
|---|---|---|---|---|
| Chris Prefontaine | CEO | Owner | Owner | none |
| Russ Prefontaine | President | Owner | Owner | none |
| Chris McGhee | Controller | Controller | Controller | Chris Prefontaine |
| Kyle Park | Production & Operations Manager / Roasting Supervisor | Production | Manager | Chris Prefontaine |
| Mateo Corredor | Marketing & Brand Manager | Marketing | Manager | Chris Prefontaine |
| Joel May | Key Account Manager | Sales | Manager | Russ Prefontaine |
| D'arcy Watsham | Customer Care Specialist | Sales | Staff | Russ Prefontaine |
| Allana Contois | Warehouse Supervisor | Production | Manager | Kyle Park |
| Jaleisy Quintero | Packaging Supervisor | Production | Manager | Kyle Park |
| Nancy Gibb | Bookkeeper & Customer Service Coordinator | Controller | Staff | Chris McGhee |
| Luke Prefontaine | Delivery Driver | Production | Staff | Allana Contois |
| Sandra Mestre | Warehouse Team Member | Production | Staff | Allana Contois |
| Monica Banman | Warehouse Team Member | Production | Staff | Allana Contois |
| Oleksandr Svyrydov | Coffee Roaster | Production | Staff | Kyle Park |
| Sungjoo Hong | Coffee Roaster | Production | Staff | Kyle Park |
| Tatum Olsen | Roasting Assistant | Production | Staff | Kyle Park |
| Olena Zaitseva | Packaging Team Member | Production | Staff | Jaleisy Quintero |
| Yerly Camacho | Packaging Team Member | Production | Staff | Jaleisy Quintero |

Important email assumption:

Some staff emails were assumed as `first.last@fratellocoffee.com`. Confirm all staff emails before production use.

## Suggested Next Work

Recommended next steps:

1. Confirm Firebase/Firestore setup is complete.
2. Run seed script and verify the `users` collection.
3. Test Owner login.
4. Test Staff login.
5. Test vacation request submission.
6. Test manager approval.
7. Test sick-day privacy.
8. Set up Resend.
9. Test email notifications.
10. Test calendar subscription feeds.
11. Do mobile QA for vacation and sick-day pages.
12. Continue cleaning the Hub front page design.

## How Claude Should Help Going Forward

When working on this project, Claude should:

- Keep explanations simple for Chris.
- Clearly separate “built in code” from “fully configured and live.”
- Avoid adding new systems unless they are necessary.
- Use Firestore as the database layer for future stateful tools.
- Keep role access and privacy rules consistent.
- Use Fratello design tokens and the approved brand direction.
- Keep the Hub feeling clean, modern, and not overwhelming.
- Treat security and sick-day privacy as the top priority.

