# JOSHRIX Studio — Backend

The backend is specified end-to-end in the docs; this directory holds runnable reference code.

| Piece | Where |
|---|---|
| **AI Gateway** (Claude primary → Gemini → OpenAI, cost hook) | [`ai-gateway/`](ai-gateway/) — fixes the prototype's Genkit `plugin is not a function` error; see its README |
| Service decomposition, events, forge state machine, CI/CD, SLOs | [`../docs/DEVELOPER-GUIDE.md`](../docs/DEVELOPER-GUIDE.md) |
| MVP collections, app routes, dashboards, security checklist | [`../docs/APP-BUILD-SPEC.md`](../docs/APP-BUILD-SPEC.md) |
| Database schema + ERD + TypeScript contracts | [`../docs/DATA-MODEL.md`](../docs/DATA-MODEL.md) and [`../shared/contracts.ts`](../shared/contracts.ts) |
| REST endpoints, auth, rate limits, webhooks | [`../docs/API.md`](../docs/API.md) |

**Secrets:** all keys come from environment variables only (`../.env.example` lists the names). Never commit keys; anything pasted into a chat or prompt is compromised — rotate it.
