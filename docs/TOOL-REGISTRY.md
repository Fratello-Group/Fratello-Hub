# Tool Registry

Master list of all tools in the Fratello Ops Hub. Updated as tools are added.

---

## How to Read This

Each entry includes:
- **Location** — File path in this repo
- **Owner** — Who built and maintains it
- **Tier** — Staff (1) / Manager (2) / Owner (3)
- **Status** — Draft / Active / Needs Update / Planned
- **Data Source** — Manual / Google Sheets / Odoo / Shopify

---

## Active Tools

### Fratello Ops Hub Portal
- **Location:** `/index.html`
- **Owner:** Chris
- **Tier:** All (login required)
- **Status:** Active
- **Data Source:** N/A
- **Description:** Main portal entry point with tier-based access and department navigation.

### Brand Guide & Claude Skill
- **Location:** `/system/skills/fratello-design-skill.html`
- **Owner:** Mateo
- **Tier:** All Hub users
- **Status:** Active
- **Data Source:** Manual
- **Description:** Download page and setup instructions for the Fratello Claude design skill.

### Wholesale Proposal Builder
- **Location:** `/sales/proposal-builder.html`
- **Owner:** Mateo
- **Tier:** Sales, Controller, Owner
- **Status:** Active
- **Data Source:** External Vercel app
- **Description:** Sales proposal builder embedded inside the Hub with a Hub header, back navigation, proposal links, and PDF saving.

### Hiring Document Generator
- **Location:** `/hr/hiring/hiring-document-generator.html`
- **Owner:** Chris Prefontaine
- **Tier:** Manager (Owner, Controller, Production, Marketing)
- **Status:** Active
- **Data Source:** Manual
- **Description:** Generates offer letters, employment agreements, and job descriptions as downloadable PDFs. Includes role presets for all Fratello positions with auto-filled titles, reporting lines, pay structures, and protection levels. Supports salaried and hourly employees, configurable restrictive covenants, and company signatory selection.

### Staff Permissions
- **Location:** `/system/permissions.html`
- **Owner:** Chris Prefontaine
- **Tier:** Owner
- **Status:** Active concept
- **Data Source:** Firebase Auth + Firestore
- **Description:** Owner-only staff access management for invites, profile assignment, password resets, and disabled users.

### Invite & Password Setup
- **Location:** `/system/accept-invite.html`
- **Owner:** Chris Prefontaine
- **Tier:** Invite link only
- **Status:** Active concept
- **Data Source:** Firebase Auth + Firestore
- **Description:** Lets invited staff create or reset their own password while keeping their access profile owner-assigned.

### Vacation Tracker
- **Location:** `/hr/time-off/vacation-tracker.html`
- **Owner:** Chris Prefontaine
- **Tier:** Staff+ (views differ by role)
- **Status:** Active concept
- **Data Source:** Firestore
- **Description:** Submit, view, and approve vacation requests with team calendar and timeline visibility.

### Sick Day Logger
- **Location:** `/hr/time-off/sick-day-logger.html`
- **Owner:** Chris Prefontaine
- **Tier:** Staff+
- **Status:** Active concept
- **Data Source:** Firestore
- **Description:** Quickly log sick days as private attendance records without medical details.

### Sick Day Report
- **Location:** `/hr/time-off/sick-day-report.html`
- **Owner:** Chris Prefontaine
- **Tier:** Owner + Controller
- **Status:** Active concept
- **Data Source:** Firestore
- **Description:** Private Owner/Controller report for sick-day records, filters, trends, and CSV export.

### Calendar Subscriptions
- **Location:** `/hr/time-off/calendar-subscribe.html`
- **Owner:** Chris Prefontaine
- **Tier:** Staff+ (private feed options differ by role)
- **Status:** Active concept
- **Data Source:** Firestore + Netlify Functions
- **Description:** Provides Outlook, Google Calendar, and Apple Calendar instructions for private time-off calendar feeds.

### Time-Off Review Page
- **Location:** `/hr/time-off/review.html`
- **Owner:** Chris Prefontaine
- **Tier:** Manager+
- **Status:** Active concept
- **Data Source:** Firestore + Netlify Functions
- **Description:** Deep-link approval page for vacation requests from email notifications.

### User Management
- **Location:** `/system/admin/users.html`
- **Owner:** Chris Prefontaine
- **Tier:** Owner + Controller
- **Status:** Active concept
- **Data Source:** Firestore
- **Description:** Manage time-off user records, departments, role tiers, managers, and active status.

### Hub Activity Log
- **Location:** `/system/admin/activity-log.html`
- **Owner:** Chris Prefontaine
- **Tier:** Owner
- **Status:** Active concept
- **Data Source:** Firestore + Netlify Functions
- **Description:** Owner-only view of Hub login, tool, form, approval, and data-change events.

### HUB QA Checklist
- **Location:** `/docs/HUB-QA-CHECKLIST.md`
- **Owner:** Chris Prefontaine
- **Tier:** Owner
- **Status:** Active
- **Data Source:** Manual
- **Description:** Plain-English checklist for testing Owner, Staff, Sales, Hiring, disabled-user, and reset-link behavior.

---

## Planned Tools

### Financial Dashboard
- **Location:** `/finance/dashboards/` (TBD)
- **Owner:** Controller
- **Tier:** Owner
- **Status:** Planned
- **Data Source:** Odoo
- **Description:** Monthly P&L, cash flow, and KPI tracking.

### Production Planning Engine
- **Location:** `/production/planning/` (TBD)
- **Owner:** Kyle
- **Tier:** Manager
- **Status:** Planned
- **Data Source:** Manual → Odoo
- **Description:** Weekly roast scheduling and capacity planning.

### Wage Assessment Tool
- **Location:** `/hr/wages/` (TBD)
- **Owner:** Kyle
- **Tier:** Manager
- **Status:** Planned
- **Data Source:** Manual
- **Description:** Compensation analysis and benchmarking.

---

## Registry Template

Copy this when adding a new tool:

```
### [Tool Name]
- **Location:** /department/subfolder/filename
- **Owner:** Name
- **Tier:** Staff / Manager / Owner
- **Status:** Draft / Active / Needs Update / Planned
- **Data Source:** Manual / Google Sheets / Odoo / Shopify
- **Description:** One-line summary.
```
