# JOSHRIX Studio — API Specification

## Design Principles

- RESTful JSON API following the OpenAPI 3.1 specification
- Base URL: `https://api.joshrix.io/v1`
- Authentication: Bearer JWT (operator sessions) or API key (`x-jx-api-key` header) for programmatic access
- Rate limits per API key: 1,000 req/min (Starter), 5,000 req/min (Pro), 20,000 req/min (Enterprise)
- Every response includes: `status`, `data`, `meta` (pagination), `error` (if applicable), `request_id`
- Webhooks signed with HMAC-SHA256 using a per-webhook secret; signature delivered in the `X-Joshrix-Signature` header

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
