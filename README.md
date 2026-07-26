# JOSHRIX Studio

> **Create Worlds. Build Games. Own the Future.**

JOSHRIX Studio is a creative game-building platform — an operating environment for designing worlds, building games, and owning what you create.

## Brand Identity

| | |
|---|---|
| **Name** | JOSHRIX Studio |
| **Tagline** | Create Worlds. Build Games. Own the Future. |

The name is always written as **JOSHRIX Studio** — "JOSHRIX" in full uppercase, "Studio" in title case. The tagline is always written with all three sentences, each ending in a period.

See [`branding/BRANDING.md`](branding/BRANDING.md) for the full brand guidelines, and [`branding/logo.svg`](branding/logo.svg) for the logo.

## Repository Layout

```
├── README.md              Project overview (this file)
├── branding/
│   ├── BRANDING.md        Brand guidelines: name, tagline, colors, typography
│   └── logo.svg           JOSHRIX Studio wordmark logo
├── docs/
│   ├── INDEX.md           Master document map — start here
│   ├── PLATFORM.md        Platform architecture: agent fleets, modules, payments, stack
│   ├── SECURITY.md        Zero Trust security architecture
│   ├── DATA-MODEL.md      Database schema and index strategy
│   ├── API.md             API endpoints, auth, rate limits, webhooks
│   ├── MONETISATION.md    ACU economy, subscription plans, revenue streams
│   ├── ADMIN.md           Super Admin control centre modules
│   ├── ROADMAP.md         Four-phase developer build roadmap
│   ├── COMPETITIVE.md     Moats, landscape, commercial dominance model
│   ├── DEVELOPER-GUIDE.md Master build document: services, events, CI/CD, SLOs
│   ├── GAP-ANALYSIS.md    Forensic review: gaps + proven-pattern solutions
│   ├── INTELLIGENCE.md    AI data intelligence layer + self-managing fleet
│   ├── CONNECTORS.md      Third-party connector ecosystem catalogue
│   ├── PRODUCT-PRINCIPLES.md  Positioning, five layers, principles, user segments
│   └── AGENT-ARCHITECTURE.md  Hierarchical agent operating model and specialists
├── frontend/              The web app: 20 pages sharing one design system
│   ├── index.html         Landing page
│   ├── studio.html        Forge Studio prototype (Create → Play → Sell, playable game)
│   ├── agent-fleet / worlds / marketplace / ip-registry .html
│   ├── how-it-works / pricing / docs / showcase / enterprise .html
│   ├── about / careers / press / contact .html
│   ├── signup / login / dashboard / profile / admin .html
│   └── assets/            joshrix.css design system, site.js, woff2 fonts
├── backend/
│   ├── README.md          Backend map (spec lives in docs/)
│   └── ai-gateway/        Claude-primary AI gateway reference (fixes Genkit error)
└── shared/
    └── contracts.ts       Shared types: roles, statuses, blueprint schema, ACU constants
```
