# Field Sales Tool — going live with Odoo

Right now the tool can read **every** customer straight from Odoo instead of the
old frozen sample (which only had 75). To switch it on, four values get typed
into **Netlify**, once. No code changes, nothing handed to anyone.

## What to enter in Netlify

Netlify → your site → **Site settings → Environment variables** → add these four:

| Variable | What it is |
|---|---|
| `ODOO_URL` | Your Odoo web address, e.g. `https://fratello.odoo.com` (must be `https`) |
| `ODOO_DB` | The Odoo database name |
| `ODOO_USERNAME` | The login/email of the user the tool signs in as |
| `ODOO_API_KEY` | That user's API key — Odoo → top-right avatar → **Preferences → Account Security → New API Key** |

Then **redeploy** the site (Netlify → Deploys → Trigger deploy). Done.

Until those are set, the tool keeps showing the frozen sample automatically — it
never breaks while you get the values in place.

## Read-only — guaranteed

This connection **only ever reads** from Odoo. It can never create, edit, move,
or delete anything in your Odoo database. That's enforced two ways:

1. **In the code:** every request is forced through a read-only filter
   (`READ_ONLY_METHODS` in `netlify/functions/odoo-read.js`). Any attempt to
   write/change/delete throws an error before it can reach Odoo.
2. **Recommended belt-and-suspenders:** give the `ODOO_USERNAME` user
   *read-only* access rights in Odoo, so Odoo's own server would refuse any
   write even if something tried.

## How to confirm it's live

Open the tool. The little dot at the top right reads **Live** (not "Preview"),
and your salespeople now see their full customer list — not 15 each.
