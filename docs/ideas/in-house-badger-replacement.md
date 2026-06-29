# In-House Badger Maps Replacement (Odoo-Native Field Sales Tool)

**Status:** Idea / scoping
**Owner:** Chris
**Saves:** ~$2–4K/yr in Badger subscription (Joel, D'Arcy, etc.)

## The idea

Build our own field sales app that pulls **live** account data straight from Odoo via API key — no synced copy, no third-party middleman. Sales reps see their accounts on a map, tap a pin, and get real-time CRM intel: last order date, contact info, order history, account stage, anything in the system. Filterable by salesperson.

Because it's wired directly into Odoo (our system of record), the data is 100% real/live/complete — which is actually *better* than Badger, where everything is a two-way sync of a copy.

## The honest split (two products in one coat)

**Product A — Odoo viewer + CRM layer.** Live account map, per-rep filtering, tap-to-see order history / contact / intel. Squarely in our wheelhouse. Odoo XML-RPC/JSON-RPC hands all of this over cleanly (`res.partner` for accounts/contacts, `sale.order` for order history, filter by salesperson field). Days, not months.

**Product B — routing engine.** The lasso-and-optimize-my-day feature. This is the hard 20% — it's the Traveling Salesman Problem with live traffic. Doable with Google Routes API + OR-Tools (Python, free), but this is real engineering, not a weekend feature. **Only build if reps actually use routing daily.**

## Staged approach (earn the right to replace)

1. **Stage 1 — Product A only.** Build the live Odoo account map + CRM lookup. Ship to one rep. Run a few weeks. Proves whether an in-house tool feels good in the field before committing to the hard part.

2. **Stage 2 — routing, only if Stage 1 lands AND routing turns out to matter.** Add OR-Tools optimization once we have real usage data instead of guessing.

This sequencing kills the risk. If Stage 1 underwhelms, we've spent a few days and keep Badger with a clear conscience.

## Open questions to resolve first

- **Does our Odoo have clean lat/long on accounts, or just street addresses?** If addresses only, we need a one-time geocoding pass (Google Maps API, cheap) to get pins on a map. Check before writing code.
- **Do Joel/D'Arcy actually use Badger's routing daily, or mostly map + check-in + account lookup?** Determines whether we can replace Badger completely with just Stage 1, or whether the hard routing piece is load-bearing.

## Steward check (real talk)

This is a textbook over-engineering candidate — "just a check-in app" already grew into "full live CRM replacement with routing" inside one conversation. Savings are modest (~$2–4K/yr). Question isn't *can* we build it (we can) — it's whether this is the highest-leverage place to point Claude Code right now vs. Mateo's marketing build-out, Pantry, etc. Stage 1 is cheap enough to justify; Stage 2 needs to earn it.

## Note on the original "can't fake the check-in" premise

Badger's own check-in does NOT enforce physical presence — it's a form, and they deliberately market *against* hard GPS tracking. A basic geofence check (browser GPS vs. account lat/long, ~100m radius) catches the lazy 95%. Truly un-fakeable is an arms race nobody fully wins. For a small team we trust, "can't *casually* fake it" is enough — and that's the easy part anyway.
