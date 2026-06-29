# Fratello Hub — Roadmap & Idea Backlog

A running to-do list of features and ideas to develop into the Hub. Newest ideas
at the top of the Backlog. Full write-ups for larger ideas live in `docs/ideas/`.

Status legend: **Idea** (scoping) · **Planned** (agreed, not started) · **In progress** · **Shipped**

---

## Backlog / Ideas

### In-house Badger Maps replacement — Odoo-native field sales tool
- **Status:** Idea / scoping · **Owner:** Chris · **Saves:** ~$2–4K/yr (Badger subscription)
- A field-sales app wired directly to Odoo (live, no synced copy): sales reps see
  their accounts on a map, tap a pin for real-time CRM intel (last order, contact,
  history, stage), filterable by salesperson.
- **Stage 1 (cheap, days):** live Odoo account map + CRM lookup — ship to one rep, run a few weeks.
- **Stage 2 (only if Stage 1 lands & routing is actually used daily):** route optimization (Google Routes API + OR-Tools).
- Resolve first: do Odoo accounts have lat/long or just addresses (geocoding pass needed)? Do Joel/D'Arcy actually use Badger's *routing* daily, or mostly map + lookup + check-in?
- Full write-up: [`docs/ideas/in-house-badger-replacement.md`](ideas/in-house-badger-replacement.md)

### Company-wide messaging / announcements
- **Status:** Idea / scoping
- Owners (Chris + Russ) message everyone; a manager messages their team; Kyle
  messages all 3 of his production teams; the Controller (Chris McGhee) messages
  everyone. Delivered as push notifications + an in-app inbox/notice.
- Tie-in: have the notification opt-in prompt appear for everyone on next login so consent is captured.
