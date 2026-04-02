# Architecture Decisions

Technical decisions and patterns for the Fratello Hub. Updated as the system evolves.

**Last updated:** April 2026

---

## Hosting

**Decision:** GitHub Pages (static site hosting)
**Why:** Free, reliable, deploys on push to main, no server management. The entire team can push updates through Git without needing DevOps knowledge.

---

## Front-End Stack

**Decision:** Pure HTML/CSS/JS or vanilla React (`React.createElement`, no JSX/Babel)
**Why:** No build step means any team member can edit and deploy without a development environment. Tools are self-contained HTML files that work anywhere.

---

## API Integration Pattern

**Decision:** Middleware layer — front-end tools never call Odoo/Shopify/external APIs directly
**Why:** API credentials must stay server-side. A lightweight middleware (Google Apps Script or Node.js on Vercel/Railway) handles authentication, rate limiting, and data formatting. Front-end tools consume clean JSON endpoints.

**Pattern:**
```
[Hub Tool] → [Middleware API] → [Odoo / Shopify / Sheets]
   HTML         Apps Script        External System
               or Node.js
```

---

## Authentication (Phased)

| Phase | Method | Status |
|-------|--------|--------|
| Phase 1 | Simple password-per-tier | Current |
| Phase 2 | Google OAuth with Fratello domain restriction | Planned |
| Phase 3 | Individual accounts with granular permissions | Future |

---

## Design System

**Decision:** Shared design tokens in `/system/design-tokens/`
**Why:** All tools should look like Fratello. A single source of truth for colors, fonts, and spacing ensures visual consistency without requiring every tool builder to memorize the brand guide.

---

## File Organization

**Decision:** Department-first folder structure with system infrastructure separated
**Why:** Operators find their tools by department, not by technology. System code (portal, components, APIs) is separated because it's maintained by the system architect, not department users.

---

## Future Decisions

_Decisions to be documented as they're made:_
- Database choice (if/when static files aren't sufficient)
- CI/CD pipeline configuration
- Monitoring and error tracking
- Backup and disaster recovery
