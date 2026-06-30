# Sales-Hub — where it stands & what's next

The single pointer for "continue the Sales-Hub work." Newest decisions at the top.
Full feature backlog lives in [`docs/ROADMAP.md`](docs/ROADMAP.md); the strategic
write-up is [`docs/ideas/in-house-badger-replacement.md`](docs/ideas/in-house-badger-replacement.md).

---

## The product

**Field Sales Tool** (`sales/field-tool/`) — our in-house Badger Maps replacement.
A phone-first app where reps see their book, log visits/calls, schedule follow-ups,
and track a monthly scorecard. Account/order data is **read** from Odoo; activity is
**written** to Firestore (immutable, self-stamped — mirrors the CFIA pattern). Reps
see only their own territory; owners/controllers see any rep or "All".

Surfaced on the Hub home as **Sales-Hub** (Tier 2/3). Owner: Russ.

## Shipped

- Customers list — search, sort (top $ / stale order / stale visit / recent / A–Z),
  filters (channel, province, city, area, wholesale vs ecom, $ band, not-visited/ordered).
- Account detail — contact, 12-mo chart, top products, recent orders + line items,
  per-account settings (type / importance / cadence).
- Check-in — typed touch + notes, GPS "verified" toggle, optional follow-up.
- Schedule / Calendar — follow-ups bucketed (overdue/this week/next/later), edit,
  reschedule, complete, delete (ICS endpoint still stubbed — see Next up).
- My Month — running scorecard (visits / cold / coverage / QA / engagement / admin),
  pace line, coaching nudge, grade.
- Playbook — scoring rules, targets, grade scale, coaching.
- Navigation — top sub-header tabs, hash routing, history-aware Back, breadcrumbs, desktop two-column.
- Calendar — real month grid (today + planned-day dots, tap a day) over the agenda; prominent Subscribe popup with Apple/Outlook how-to and per-rep links for managers.
- Per-account — brand/product toggles (+ a list filter for carries/missing) and water-filter date + 1–12-month reminder.
- Calmer UI pass, default Top $ sort, plain-language sort labels, and a bold Sales-Hub launcher on the field reps' Personal Dashboard.
- **Live Odoo read (in review on this branch)** — see below.

## In flight — Live Odoo read (this branch)

Reconciles the two competing PRs (**#34** and **#32**) into one merge-ready change:
a secure, read-only Odoo proxy (`netlify/functions/odoo-read.js`) so each rep's
**full** book loads live, removing the 75-account snapshot cap. Architecture from #34
(progressive `list` → `agg` → `detail`, scales to thousands of accounts); safety from
#32 (read-only-method firewall, `fields_get` schema-tolerance, RPC timeout, channel
fallback, `GO-LIVE.md`). Falls back to the committed snapshot until the Netlify env
vars (`ODOO_URL` / `ODOO_DB` / `ODOO_USERNAME` / `ODOO_API_KEY`) are set — nothing
breaks before then. **Go-live + verification steps:** [`sales/field-tool/GO-LIVE.md`](sales/field-tool/GO-LIVE.md).

> Supersedes PR #34 and PR #32 — close both in favor of the PR for this branch.

## Next up (prioritized)

1. **Land live Odoo** — set the four Netlify env vars, redeploy, confirm the badge
   reads **Live** and reps see full books. Sanity-check the `x_studio_sales_channel`
   / `property_product_pricelist` / `team_id` mappings against real data; tweak if
   the channel or price-level labels look off.
2. **"My Day" planning view** — a Today tab: one prioritized action list (follow-ups
   due, accounts overdue for a visit, coverage gaps, at-risk/slowing accounts). Pure
   client logic on data the app already has — no new infrastructure.
3. **Map view** (`renderMap` is a stub) — customers as colored pins (active/watch/
   cold), tap to open the account. **Blocked on geocoding:** Odoo accounts have
   street/city/province but no lat/long. Resolve first: does Odoo expose
   `partner_latitude`/`partner_longitude`, or do we need a one-time geocoding pass?
   The live `odoo-read` `list` action is the natural place to add coordinates.
4. **At-risk intelligence** — surface slowing orders / dropped cadence inline on the
   Customers list (risk score, "slowing down" flag, smarter default sort).
5. **Monthly Report Card PDF** — the "Generate" button on My Month is a stub; wire
   the real 3-page PDF (score dashboard, summary + coaching, 6-month trend).
6. **Real ICS feed** — the Calendar Subscribe popup + per-rep links are built, but
   the `/api/sales-calendar.ics?rep=…` endpoint is still a placeholder; back it with a
   `sales-calendar.ics` function (mirror `calendar-ics.js`) so the links actually
   resolve and visits sync to Apple/Outlook.
7. **Confirm the brand list** — `BRANDS` in `sales/field-tool/index.html` is seeded
   from the named lines (1883 syrups, oat milk, Idle tea, …); confirm/extend it.
8. **Routing (Stage 2)** — only if Stage 1 lands and reps actually use routing daily.
   Lasso-and-optimize-my-day (Google Routes API + OR-Tools). The hard 20%; earn it.

## Open questions to resolve

- Lat/long on Odoo accounts vs. a geocoding pass (gates the Map).
- Do Joel/D'Arcy use Badger's *routing* daily, or mostly map + lookup + check-in?
  (Determines whether Stage 1 alone can retire Badger.)
- Confirm the rep ↔ Odoo salesperson map (`REP_BY_EMAIL` / `FIELD_REP_IDS` in
  `odoo-read.js`) as the team changes.
