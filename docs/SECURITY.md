# JOSHRIX Studio — Zero Trust Security Architecture

Every layer of the platform operates under a Zero Trust model: no implicit trust between services, users, or agents; every request authenticated, authorized, and audited.

| Layer | Control | Implementation |
|---|---|---|
| Identity | MFA mandatory; biometric on mobile; risk-based step-up auth | Firebase Auth + Auth0 enterprise; device fingerprinting |
| Network | All internal service communication via mTLS | Istio service mesh on GKE; GCP VPC with private subnets |
| API Security | JWT + API key auth; per-key rate limits; IP whitelist option | Kong Gateway; API key rotation policy; GCP Secret Manager key vault |
| Data Encryption | AES-256 at rest; TLS 1.3 in transit; field-level encryption for PII | GCP CMEK; Firestore encryption; tokenisation for payment data |
| Agent Permissions | Each agent has a least-privilege tool registry; no agent can write to another agent's state without orchestrator approval | LangGraph permission model; AI Governance Agent monitors deviations |
| Audit Trail | Immutable append-only audit log for all user actions, agent decisions, admin operations, and transactions | PostgreSQL append-only table + GCS backup; tamper-evident signing |
| DDoS Protection | Layer 3/4/7 DDoS mitigation | Cloudflare Magic Transit + WAF; GCP Cloud Armor |
| Fraud Detection | Real-time transaction scoring; behavioural anomaly detection | Fraud Detection Agent (custom ML model + payment gateway risk signals) |

## Anti-Hacking Framework

| Attack Vector | Defence | Implementation |
|---|---|---|
| DDoS (L3/4/7) | Edge absorption + rate shaping | Cloudflare Magic Transit + WAF; GCP Cloud Armor; per-key rate limits at Kong |
| SQL Injection | Parameterised queries only | Prisma (no raw SQL without review); WAF rulesets; CI grep-gate on `$queryRawUnsafe` |
| XSS | Output encoding + CSP | React auto-escaping; strict Content-Security-Policy (no inline script); DOMPurify on any rich-text render |
| CSRF | Token binding | SameSite=Strict cookies; double-submit tokens on state-changing browser routes; API is bearer-token (immune by design) |
| Session Hijacking | Short-lived, bound sessions | 15-min JWTs + rotating refresh tokens; token binding to device fingerprint; re-auth for sensitive actions |
| Account Takeover | Risk-based step-up | Anomalous login detection (device/geo/hours) → MFA challenge; credential-hygiene checks on login (HaveIBeenPwned k-anonymity) |
| Credential Stuffing | Rate + reputation | Per-IP and per-account login throttles; bot scores; breached-password rejection at registration |
| API Abuse | Behavioural quotas | Per-key anomaly detection → automatic suspension (see Fraud Detection); scope-minimised keys with IP allowlists |
| Bot Attacks | Managed challenge | Cloudflare Bot Management on marketplace and auth surfaces; invisible challenge before checkout |

## Data Protection (all four states)

- **At rest**: AES-256 via GCP CMEK across Cloud SQL, Firestore, GCS/R2.
- **In transit**: TLS 1.3 external, mTLS internal (Istio).
- **In use**: GCP Confidential Computing (AMD SEV) for KYC document processing and payment tokenisation workloads — memory encrypted even against a compromised host.
- **Tokenisation**: card and mobile-money credentials never touch platform services; gateway tokens only. PII fields carry field-level encryption with per-tenant derived keys, enabling cryptographic erasure for GDPR.

## Compliance Framework

| Domain | Standard / Control | Implementation |
|---|---|---|
| Data Privacy | GDPR (UK/EU); CCPA (US) | Privacy-by-design; data minimisation; right-to-erasure API; DPA with all processors |
| Payment Security | PCI-DSS v4.0 | BitriPay/Stripe handle cardholder data; no raw card data stored on platform; tokenisation |
| Identity Verification | KYC/KYB (FATF standards) | Sumsub document + biometric verification; tiered KYC by transaction volume |
| Anti-Money Laundering | UK MLR 2017; 6AMLD (EU) | ComplyAdvantage screening on onboarding and high-value transactions; SAR workflow |
| Content Compliance | PEGI; ESRB; BBFC; IARC | QA Agent automated pre-classification; operator declaration; IARC API for global rating |
| IP Protection | UK CDPA 1988; US Copyright Act; EU DSM Directive | IP provenance metadata on all forge output; IP certificate per title; trademark pre-clearance |
| Cybersecurity | ISO 27001; SOC 2 Type II (target) | Zero Trust; mTLS; SIEM (Datadog); vulnerability scanning; pen-testing cadence |
| Age Rating Compliance | PEGI; ESRB; App Store requirements | QA Agent mandatory age rating before the deployment authorisation token is issued |

## Fraud Detection Architecture

- Every marketplace transaction receives a real-time fraud score (0–100) from the Fraud Detection Agent using a composite signal model: device fingerprint, IP reputation, behavioural pattern, transaction velocity, account age, and payment method risk.
- Transactions scoring above 70 are held for manual review; above 85 are auto-rejected with operator notification.
- Account takeover protection: anomalous login detection (new device, new geography, off-hours) triggers a step-up MFA challenge.
- API abuse detection: rate-limit anomalies and unusual endpoint access patterns trigger automatic key suspension and an admin alert.
- Seller fraud protection: IP similarity scores flagged by the QA Agent feed into the marketplace seller risk profile.
