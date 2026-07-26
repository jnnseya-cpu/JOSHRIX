# JOSHRIX Studio — API Specification

## Design Principles

- RESTful JSON API following the OpenAPI 3.1 specification
- Base URL: `https://api.joshrix.io/v1`
- Authentication: Bearer JWT (operator sessions) or API key (`x-jx-api-key` header) for programmatic access
- Rate limits per API key: 1,000 req/min (Starter), 5,000 req/min (Pro), 20,000 req/min (Enterprise)
- Every response includes: `status`, `data`, `meta` (pagination), `error` (if applicable), `request_id`
- Webhooks signed with HMAC-SHA256 using a per-webhook secret; signature delivered in the `X-Joshrix-Signature` header

## Request / Response Convention

All mutating endpoints require an `Idempotency-Key` header (ULID); retries with the same key replay the original response for 24h (see GAP-ANALYSIS A2).

```http
POST /v1/forge/initiate HTTP/1.1
Authorization: Bearer eyJ...
Idempotency-Key: 01J8ZK7Q2M...
Content-Type: application/json

{
  "prompt": "Football penalty game with online duels, unlockable boots, stadium purchases, tradeable player cards",
  "game_type": "sports",
  "platforms": ["web", "android"],
  "budget_tier": "standard",
  "monetisation": "freemium",
  "approval_gates": ["concept", "predeploy"]
}
```

```json
{
  "status": "accepted",
  "data": {
    "forge_id": "frg_01J8ZK9A4N...",
    "state": "ESTIMATING",
    "estimated_acu": { "min": 380, "max": 720 },
    "queue_position": 3
  },
  "meta": {},
  "error": null,
  "request_id": "req_01J8ZKA0..."
}
```

### Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `validation_failed` | Body failed schema validation; `error.fields` lists violations |
| 401 | `unauthenticated` | Missing/expired token or invalid API key |
| 402 | `insufficient_acu` | Balance below estimate; response includes top-up link |
| 403 | `forbidden` | Authenticated but lacks scope/role for this resource |
| 404 | `not_found` | Resource does not exist or is outside your tenancy |
| 409 | `idempotency_conflict` | Same key, different request body |
| 409 | `state_conflict` | Action invalid for current forge state (e.g. approving a non-gated cycle) |
| 422 | `policy_rejected` | Content policy rejection; `error.appeal_url` provided |
| 429 | `rate_limited` | Tier limit exceeded; `Retry-After` header set |
| 5xx | `internal` | Logged against `request_id`; safe to retry with the same idempotency key |

## Core Endpoints

### Forge

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/forge/initiate` | JWT/Key | Initiate a new forge cycle; returns `forge_id` and estimated ACU cost |
| GET | `/forge/{forge_id}` | JWT/Key | Forge cycle status, agent progress, and current output |
| POST | `/forge/{forge_id}/approve` | JWT | Operator approval at configured gate (concept, blueprint, pre-deploy) |
| POST | `/forge/{forge_id}/cancel` | JWT | Cancel active forge cycle; partial ACU refund applied |
| GET | `/forge/{forge_id}/report` | JWT/Key | Full forge report: blueprint, QA report, economy design, deployment URLs |
| GET | `/forge` | JWT | Paginated list of operator forge cycles with filters |

### IP Vault & Marketplace

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/ip` | JWT/Key | Operator IP vault: all registered IP records |
| GET | `/ip/{ip_id}` | JWT/Key | Full IP record with certificate, QA report, licence status |
| POST | `/ip/{ip_id}/list` | JWT | Create marketplace listing from IP record |
| GET | `/marketplace` | Public | Browse listings with search, filter, pagination |
| GET | `/marketplace/{listing_id}` | Public | Listing detail page data |
| POST | `/marketplace/{listing_id}/purchase` | JWT | Initiate purchase; returns BitriPay checkout session |

### Operators, Billing & Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/operators/me` | JWT | Profile, tier, ACU balance, KYC status |
| PATCH | `/operators/me` | JWT | Update operator profile |
| GET | `/operators/me/acu` | JWT | ACU balance and ledger history |
| POST | `/operators/me/acu/topup` | JWT | Initiate ACU top-up; returns BitriPay checkout session |
| GET | `/subscriptions/me` | JWT | Current subscription details |
| POST | `/subscriptions/upgrade` | JWT | Initiate plan upgrade; returns BitriPay checkout session |
| GET | `/analytics/forge` | JWT | Forge performance analytics for operator |
| GET | `/analytics/revenue` | JWT | Revenue analytics: sales, royalties, ACU spend |

### Webhooks & Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/webhooks` | Key | Register webhook endpoint |
| GET | `/webhooks` | Key | List registered webhooks |
| DELETE | `/webhooks/{webhook_id}` | Key | Delete webhook |
| POST | `/admin/users/{id}/suspend` | Admin JWT | Suspend operator account |
| POST | `/admin/forge/{id}/terminate` | Admin JWT | Force-terminate forge cycle |
| GET | `/admin/audit-log` | Admin JWT | Paginated audit log with filters |
| GET | `/admin/compliance/flags` | Admin JWT | Active compliance flags with severity filter |

## Webhook Events (BitriPay + Forge Pipeline)

| Event | Trigger | Platform Action |
|---|---|---|
| payment.completed | Successful transaction | Unlock forge cycle / deliver marketplace purchase / top up ACU balance |
| payment.failed | Failed transaction | Alert operator; retry logic; support ticket creation |
| settlement.processed | Royalty/revenue settlement completed | Update operator revenue dashboard; send notification |
| dispute.opened | Consumer initiates dispute | Freeze transaction; notify operator; create compliance ticket |
| dispute.resolved | Dispute outcome confirmed | Execute refund or release funds per resolution |
| refund.processed | Refund completed | Update transaction record; notify consumer; adjust revenue report |
| subscription.renewed | Recurring billing success | Extend operator plan; reset ACU allowance if applicable |
| subscription.failed | Recurring billing failure | Grace-period activation; operator notification; downgrade workflow |
