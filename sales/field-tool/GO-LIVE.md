# Field Sales Tool — going live with Odoo

Right now the tool reads a **frozen sample** (`snapshot.js`, ~75 accounts). Once
four values are typed into **Netlify**, it reads **every** customer straight from
Odoo instead — each salesperson's full book, current as of right now. No code
changes, no credentials handed to anyone.

## What to enter in Netlify

Netlify → your site → **Site settings → Environment variables** → add these four:

| Variable | What it is |
|---|---|
| `ODOO_URL` | Your Odoo web address, e.g. `https://fratello.odoo.com` (must be `https`) |
| `ODOO_DB` | The Odoo database name, e.g. `fratello-main-10408462` |
| `ODOO_USERNAME` | The login/email of the integration user the tool signs in as |
| `ODOO_API_KEY` | That user's API key — Odoo → top-right avatar → **Preferences → Account Security → New API Key** |

Then **redeploy** the site (Netlify → Deploys → Trigger deploy). Done.

Until all four are set, the function returns `503` and the tool keeps showing the
frozen sample automatically — it never breaks while you get the values in place.

## How it loads (why it stays fast on a big book)

The tool never pulls the whole database at once. It loads in three stages through
one server function (`/api/odoo/read`):

1. **list** — every account in scope, names/contact/channel only (one fast call).
2. **agg** — 12-month $, last-order date and order count, filled in over the list
   in the background, in batches.
3. **detail** — order history, line items, monthly chart and top products, fetched
   only when you actually open an account.

So a rep with thousands of customers still sees their list immediately.

## Who sees what

- A **sales rep** only ever reads **their own** book — scoping is enforced
  server-side by Odoo salesperson id, not in the browser.
- **Owners / controllers** can read any rep, the house/ecom bucket, or "all".

The rep ↔ Odoo salesperson map lives in `netlify/functions/odoo-read.js`
(`REP_BY_EMAIL` / `FIELD_REP_IDS`). Add a new rep there.

## Read-only — guaranteed

This connection **only ever reads** from Odoo. It can never create, edit, move,
or delete anything. That's enforced three ways:

1. **Named actions only.** The browser asks for `list` / `agg` / `detail` — never
   a model or a method — so it can't ask Odoo to do anything but those reads.
2. **Read-only firewall.** Every Odoo call goes through `kw()`, which throws on
   any method not in `READ_ONLY_METHODS` (`search_read` / `read` / `read_group` /
   `fields_get` / …). A write/create/unlink throws *before* it can reach Odoo, so
   even a future edit can't silently make this destructive.
3. **Recommended belt-and-suspenders.** Give the `ODOO_USERNAME` user *read-only*
   access rights in Odoo, so Odoo's own server would refuse a write either way.

## Schema tolerance

The function asks Odoo which partner fields actually exist (`fields_get`) before
reading, and picks whichever channel field is present — the custom
`x_studio_sales_channel` first, then the sales `team_id`. A differently-configured
Odoo returns data instead of erroring on a field it doesn't have.

## How to confirm it's live

Open the tool. The badge at the top right reads **Live** (not "Preview"), and your
salespeople see their full customer lists — not 15 each.

## Not verifiable before deploy

The live path can't be exercised from CI (the key lives in Netlify, by design). It
needs a one-time check after the env vars are set: confirm the badge reads **Live**,
reps see their full books, and the channel / price-level labels look right (the
`x_studio_sales_channel` / `property_product_pricelist` mappings are best-effort and
may want one tweak once real data is visible).
