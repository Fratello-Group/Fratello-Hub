# Fratello Ops Hub — Vision & Architecture

## What This Is

Fratello Coffee Roasters is building a centralized operational intelligence platform — the **Fratello Ops Hub** — that consolidates the AI-powered tools, dashboards, reports, forms, and workflows our team is developing into a single, role-gated system that becomes foundational to how we run the company.

This is not a theoretical exercise. Every tool in this system originates from a real operator solving a real problem. The architecture exists to give those solutions a permanent home, version control, role-based access, and eventually live data integration with our core systems (Odoo, Shopify, and beyond).

---

## Why This Matters

Our team is already building powerful tools independently — financial dashboards, production planning engines, branded marketing outputs, sales intelligence reports, costing calculators, compliance forms, and more. Right now these live as isolated files on individual machines. If someone leaves, their work walks out the door. If someone builds something brilliant, only they can use it.

The Ops Hub turns personal productivity into organizational infrastructure.

---

## The Three-Layer Architecture

### Layer 1: The Vault (Code & Asset Repository)

**What it is:** A private GitHub organization (`fratello-ops` or similar) where all code, HTML tools, dashboards, prompt templates, skill files, and documentation live — versioned, organized, and backed up.

**Structure:**
```
fratello-ops/

── OPERATIONAL TOOLS (what people use daily) ────────────

├── /finance
│   ├── dashboards/          # Financial reporting dashboards (HTML/React)
│   ├── tools/               # Costing calculators, margin analyzers
│   ├── reports/             # Report templates and generators
│   └── README.md
│
├── /production
│   ├── roasting/            # Green buying, green inventory, roast scheduling, QC
│   ├── packaging/           # Packaging runs, labels, SKU management
│   ├── warehouse/           # Finished goods inventory, fulfillment, shipping
│   ├── planning/            # Cross-cutting production planning & forecasting
│   ├── safety/              # H&S compliance forms, tracking systems
│   └── README.md
│
├── /sales
│   ├── intelligence/        # Sales reports, territory analysis
│   ├── crm/                 # Custom CRM components (future)
│   ├── forecasting/         # Sales forecasting and pipeline tools
│   └── README.md
│
├── /marketing
│   ├── brand/               # Brand voice docs, design skills, style guides
│   ├── catalogs/            # Product catalogs, automated outputs
│   ├── tools/               # Promotion calculators, pricing tools
│   └── README.md
│
├── /hr
│   ├── performance/         # Performance reviews, assessment tools
│   ├── wages/               # Wage assessment, compensation analysis
│   ├── onboarding/          # New hire process, training records
│   ├── policies/            # Employee handbook, HR policies
│   └── README.md
│
├── /operations
│   ├── forms/               # Company-wide forms (fillable, trackable)
│   ├── manuals/             # SOPs, procedures, operational docs
│   ├── legal/               # Contracts, compliance, insurance, supplier agreements
│   └── README.md
│

── SYSTEM INFRASTRUCTURE (what makes the Hub work) ─────

├── /system
│   ├── hub/                 # Portal entry point, navigation, auth
│   ├── components/          # Reusable UI components
│   ├── api/                 # Integration middleware (Odoo, Shopify connectors)
│   ├── design-tokens/       # Fratello brand colors, fonts, spacing
│   ├── skills/              # AI skill files used across departments
│   └── README.md
│
└── /docs
    ├── VISION.md            # This document
    ├── CONTRIBUTING.md      # How to add new tools to the system
    ├── TOOL-REGISTRY.md     # Master list of all tools, owners, status
    └── ARCHITECTURE.md      # Technical architecture decisions
```

The structure splits into two clear sections. **Operational tools** are organized by department — these are the folders where real work lives. **System infrastructure** is the scaffolding that makes the Hub run — portal code, shared components, API connectors, design tokens, and project documentation. These are maintained by whoever is architecting the system, not by department users.

**Production** mirrors the physical flow: raw material enters through roasting (green buying, inventory, scheduling, QC), moves to packaging (runs, labels, SKUs), and ships from warehouse (finished goods, fulfillment). Planning and safety sit at the production root because they span all three.

**HR** is top-level because it touches every department — performance, wages, onboarding, and policies aren't production-specific even though production uses them most.

**Key principle:** Every tool has an owner, a README, and lives in the right folder. No orphan files.

---

### Layer 2: The Hub (Access Portal)

**What it is:** A web-based portal — hosted on GitHub Pages — where team members log in and access role-appropriate tools, dashboards, forms, and documentation.

**Access Tiers:**

| Tier | Who | What They See |
|------|-----|---------------|
| **Tier 1 — Staff** | All employees | Employee handbook, HR forms, safety checklists, general company info, personal tools (timesheets, leave requests) |
| **Tier 2 — Managers** | Department leads | Everything in Tier 1 + department-specific dashboards, planning tools, performance tools, compliance tracking |
| **Tier 3 — Owners** | Chris, Russ | Full access to everything + cross-departmental dashboards, financial reporting, strategic tools, system admin |

**Authentication roadmap:**
- **Phase 1:** Simple password-per-tier (fast to deploy, sufficient for small team)
- **Phase 2:** Google OAuth with domain restriction (Fratello Google Workspace accounts)
- **Phase 3:** Individual accounts with granular permissions (if/when team size demands it)

**Design:**
- Fratello branded (existing brand colors, fonts, logo)
- Mobile-responsive (managers check things from the floor, not just their desk)
- Card-based navigation organized by department/function
- Fast — no framework bloat, static HTML/React served from GitHub Pages

---

### Layer 3: The Nerve System (Data Integration)

**What it is:** The layer that connects Hub tools to live data from Odoo, Shopify, and other systems so dashboards show real numbers, forms write back to the ERP, and reports refresh automatically.

**Integration targets (prioritized):**

| System | API Type | Priority | First Use Case |
|--------|----------|----------|----------------|
| **Odoo** | XML-RPC / JSON-RPC | High | Financial dashboards, inventory, production data |
| **Shopify** | REST / GraphQL | High | E-commerce sales, order data, product catalog |
| **Google Sheets** | Sheets API | Medium | Lightweight data entry, form backends (proven pattern) |
| **Shipping / Logistics** | TBD | Low | Order fulfillment tracking |

**Middleware approach:**
- Google Apps Script as lightweight API proxy (proven pattern from Safeguard Hub)
- Or a small Node.js service on a free-tier host (Vercel, Railway, Render)
- Each integration = a module in `/system/api/` with its own auth handling and data formatting
- Front-end tools consume clean JSON — they never talk to Odoo/Shopify directly

**Sequencing:** This layer is built last. The Vault and Hub must be solid first. The first integration should be whichever data source has the highest immediate value — likely Odoo financial data for the controller's dashboards.

---

## How New Tools Get Added

1. **Build it.** Solve a real problem. Make it work on your machine.
2. **Document it.** Write a short README: what it does, who it's for, what data it needs.
3. **Commit it.** Push to the correct folder in the Vault (GitHub repo).
4. **Register it.** Add an entry to `TOOL-REGISTRY.md` with owner, status, and access tier.
5. **Deploy it.** If it's ready for others, it gets a card in the Hub portal.

Tools don't need to be perfect to enter the Vault. They do need to work and be documented before they go live in the Hub.

---

## Guiding Principles

**Organic over imposed.** The best tools come from operators solving their own problems. The system captures and scales what's already working — it doesn't prescribe from the top.

**Working over polished.** A rough tool that solves a real problem beats a beautiful tool that doesn't. Ship early, refine in place.

**Versioned over disposable.** Everything in the Vault has history. We can roll back, branch, and iterate without fear of losing prior work.

**Role-appropriate over open.** Not everyone needs to see everything. Access tiers keep the experience clean and relevant for each user.

**Data-connected over static.** The endgame is live data. Every tool should be designed with the assumption that it will eventually pull from real systems, even if it starts with manual data.

**Company asset over personal file.** If it's useful, it belongs in the system. If it's in the system, it survives any individual's departure.

---

## Phased Roadmap

### Phase 1 — Foundation (Now)
- [ ] Create private GitHub organization and repo structure
- [ ] Audit all existing tools across the team — catalog what exists
- [ ] Each team member pushes their current tools into the correct folders
- [ ] Write initial READMEs for each department folder
- [ ] Establish TOOL-REGISTRY.md with current inventory

### Phase 2 — The Hub Shell
- [ ] Build the portal landing page (GitHub Pages, Fratello-branded)
- [ ] Implement tier-based access gating
- [ ] Create navigation structure by department
- [ ] Link existing HTML tools as cards/pages within the Hub
- [ ] Mobile-responsive testing

### Phase 3 — Embed and Connect
- [ ] Embed tools directly in Hub (iframes or integrated pages)
- [ ] Build first Odoo API integration (financial data)
- [ ] Build first Shopify API integration (sales/order data)
- [ ] Create shared middleware layer in `/system/api/`
- [ ] Establish data refresh patterns (scheduled vs. on-demand)

### Phase 4 — Harden and Scale
- [ ] Migrate to Google OAuth authentication
- [ ] Add audit logging (who accessed what, when)
- [ ] Automated deployment pipeline (push to main = live on Hub)
- [ ] Process for tool review and quality gating before Hub publication
- [ ] Cross-departmental dashboards pulling from multiple data sources

---

## What This Becomes

In six months, every Fratello manager opens the Ops Hub in the morning and sees their world: live production numbers, sales pipeline, financial position, team performance, compliance status — all in one place, all built by us, all running on our data.

In a year, new hires get onboarded through the Hub. They find their handbook, their forms, their training, and their tools — all in one branded portal.

In two years, we're running a bespoke operational intelligence system that no off-the-shelf SaaS could replicate — because it was built by the people who do the work, for the problems they actually have.

That's the vision. Now we build it.
