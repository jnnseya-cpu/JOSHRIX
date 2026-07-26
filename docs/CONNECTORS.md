# JOSHRIX Studio — Third-Party Connector Ecosystem

Plug-and-play API doors. Every connector follows one pattern: an adapter service owned by the nearest domain service, credentials in Secret Manager, health-checked, and swappable behind an internal interface (the BitriPay/Stripe dual-rail in DEVELOPER-GUIDE §10 is the template).

| Category | Why Needed | Connects Into | Data Exchanged | Primary / Fallback |
|---|---|---|---|---|
| Payments | All money movement | `svc-billing` | Checkout sessions, webhooks, settlements | **BitriPay** / Stripe, Adyen, Checkout.com, PayPal |
| Banking-as-a-Service | Operator payout accounts, wallet rails | `svc-billing` settlement engine | Account creation, transfers, balances | Regional BaaS per market / Open Banking (TrueLayer) |
| Open Banking | Account verification, pay-by-bank | `svc-billing` | Account ownership proofs, payment initiation | TrueLayer / Plaid |
| KYC/KYB | Operator and merchant identity | `svc-compliance` | Document + biometric verification results | Sumsub / Persona, Veriff |
| AML Screening | Sanctions, PEP, transaction monitoring | `svc-compliance` | Screening hits, risk ratings | ComplyAdvantage / Refinitiv World-Check |
| Fraud Prevention | Transaction and device risk signals | Fraud Detection Agent | Device fingerprints, risk scores | Internal ML + gateway signals / SEON |
| Email | Transactional and lifecycle mail | Notification engine | Templates, delivery events | SendGrid / Brevo |
| SMS | OTP, critical alerts | Notification engine | Messages, delivery receipts | Twilio / MessageBird |
| WhatsApp | Operator notifications in mobile-money markets | Notification engine | Template messages, session replies | Twilio WhatsApp Business API / 360dialog |
| Push Notifications | Mobile + web app alerts | Notification engine | Device tokens, payloads | FCM / OneSignal |
| Maps | Marketplace regional insights, event locations | `svc-analytics` | Geocoding, region polygons | Google Maps / Mapbox |
| Logistics | Physical merch for franchise titles (Phase 4) | `svc-marketplace` | Shipping rates, tracking | Shippo / EasyPost |
| Accounting | Platform books, operator export | `svc-billing` | Journal entries, invoices | Xero API / QuickBooks |
| Tax | Marketplace VAT/sales tax | `svc-billing` checkout | Tax rates, filings | TaxJar / Avalara |
| CRM | Enterprise sales pipeline | `svc-admin` + Growth agents | Leads, deal stages | HubSpot / Salesforce |
| Analytics | Product analytics | `svc-analytics` | Behavioural events | Mixpanel / Amplitude |
| AI Model Providers | All agent inference | Model router (DEVELOPER-GUIDE §4) | Prompts, completions, embeddings | Anthropic + OpenAI / Gemini, Vertex AI, Cohere, Mistral |
| Cloud Storage | Assets, builds, documents | All services | Objects, signed URLs | Cloudflare R2 / GCS, S3 |
| Authentication | Identity provider | `svc-identity` | Tokens, MFA, SSO (SAML/OIDC) | Firebase Auth / Auth0, Cognito |
| Document Generation | QA reports, IP certificates, licences | `svc-ip`, `svc-compliance` | Rendered PDFs from templates | DocuSeal / PDFMonkey |
| E-Signature | Licensing and enterprise contracts | `svc-ip` | Envelope status, signed docs | DocuSign / Dropbox Sign |
| Customer Support | Case management under the Support Agent | Support stack (GAP-ANALYSIS E3) | Tickets, transcripts | Zendesk API / Intercom |
| Data Enrichment | Enterprise lead and partner vetting | CRM sync | Firmographics | Clearbit / Apollo |
| Currency Exchange | Multi-currency pricing and settlement | `svc-billing` | FX rates (locked at quote time) | Wise Platform / OpenExchangeRates |
| Subscription Billing | Plan lifecycle (if not in-house) | `svc-billing` | Proration, invoicing | Stripe Billing / Chargebee |
| Productivity | Enterprise workspace integrations | Command Centre Automation pack | Calendar, docs export | Google Workspace / Microsoft 365 |

**Connector contract:** each adapter implements `healthcheck()`, `capabilities()`, idempotent operations with external-id mapping tables, webhook ingestion with signature verification, and a sandbox mode wired into the `local`/`staging` environments. Adding a provider is a new adapter, never a change to domain logic.
