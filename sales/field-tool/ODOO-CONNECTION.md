# Sales-Hub ↔ Odoo connection — configuration record

**Status: CONFIGURED in Netlify on 2026-06-30 by Chris. This does not need redoing.**

The Sales-Hub field tool reads accounts live from Odoo through a server function
(`netlify/functions/odoo-read.js`). It authenticates with **four environment
variables stored in Netlify** — NOT in this repo, NOT in any chat session, and
NOT in the sandbox. They live on Netlify's servers permanently and persist across
deploys and across time. **They never need re-entering each conversation.**

(Netlify location: site **fratello-ops-hub** → **Project configuration** →
**Environment variables**.)

## The four variables (entered 2026-06-30)

| Key | Value | Secret? |
|---|---|---|
| `ODOO_URL` | `https://fratello.odoo.com` | no |
| `ODOO_DB` | `Fratello` | no |
| `ODOO_USERNAME` | `chris@fratellocoffee.com` | no |
| `ODOO_API_KEY` | *stored in Netlify only — deliberately NOT written here* | **YES** |

The API key is a secret and is never recorded in this repo. If it is ever lost,
generate a new one in Odoo (profile picture → My Profile → **Account Security** →
**New API Key**) and paste it into the `ODOO_API_KEY` Netlify variable.

> If Odoo ever returns "authentication failed," the usual culprit is `ODOO_DB`.
> Try `fratello` (lowercase) or the long technical name (e.g. `fratello-main-…`),
> which you can confirm at https://www.odoo.com/my/databases. It's a one-variable
> edit + redeploy, no code change.

## If the four ever go missing — re-add them (plain steps)

1. Open **https://app.netlify.com** and sign in.
2. Click the site **fratello-ops-hub**.
3. Left sidebar: **Project configuration** → **Environment variables**.
4. Top-right: click **Add a variable**.
5. In the **Key** box type the name (e.g. `ODOO_URL`); in the **Values** box paste
   the value from the table above; leave everything else as-is; click **Create
   variable**.
6. Repeat for each of the four. For `ODOO_API_KEY`, generate a fresh key in Odoo
   first (see above).
7. Netlify → **Deploys** → **Trigger deploy** so the functions pick up the values.

## Note for any future Claude session
The config above is the source of truth. If the user asks why the tool shows the
sample (75) accounts, or about Odoo/Netlify setup: walk them through it with
**basic, click-by-click** steps (open app.netlify.com → fratello-ops-hub →
Project configuration → Environment variables → Add a variable → Key/Values →
Create). **Never** ask the user to paste the API key into chat. These variables
are already set and should not need re-entering.
