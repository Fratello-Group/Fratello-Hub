# Contributing to the Fratello Ops Hub

This guide explains how to add new tools, dashboards, forms, or any other resource to the Hub.

---

## The Process

### 1. Build It

Solve a real problem. Make it work on your machine. It doesn't need to be perfect — it needs to work.

### 2. Document It

Write a short README alongside your tool that answers:
- **What does it do?** (one or two sentences)
- **Who is it for?** (Staff / Manager / Owner)
- **What data does it need?** (manual entry, Google Sheet, Odoo, Shopify)
- **Who owns it?** (your name)

### 3. Put It in the Right Folder

Every tool belongs in a department folder:

| If your tool is about... | Put it in... |
|--------------------------|-------------|
| Financial reports, costing, margins | `/finance/` |
| Roasting, green coffee, QC | `/production/roasting/` |
| Packaging, labels, SKUs | `/production/packaging/` |
| Shipping, warehouse, fulfillment | `/production/warehouse/` |
| Production planning, forecasting | `/production/planning/` |
| Safety, H&S compliance | `/production/safety/` |
| Sales reports, pipeline, CRM | `/sales/` |
| Brand, catalogs, promotions | `/marketing/` |
| Performance, wages, onboarding | `/hr/` |
| Policies, handbook | `/hr/policies/` |
| Forms, SOPs, legal | `/operations/` |
| Shared components, integrations | `/system/` |

### 4. Register It

Add an entry to [TOOL-REGISTRY.md](TOOL-REGISTRY.md) following the template there.

### 5. Deploy It

Once registered, the tool gets a card in the Hub portal.

---

## File Naming

- **Code files:** Lowercase with hyphens: `margin-calculator.html`
- **Documents:** Spaces are fine: `Employee Handbook.pdf`
- **No underscores** in final deliverable names

---

## Code Standards

- HTML/CSS/JS or vanilla React — no build step required
- Mobile-responsive — managers check things from the production floor
- Include loading states and error handling
- Import `/system/design-tokens/tokens.css` for brand consistency
- Comment your code — someone else will maintain this

---

## Questions?

Ask Chris.
