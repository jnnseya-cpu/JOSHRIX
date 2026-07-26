# JOSHRIX Studio — AI Data Intelligence Layer

The central intelligence architecture. Every engine below is an implemented system with a named substrate — not an aspiration.

| Engine | Substrate | Implementation |
|---|---|---|
| Data Lake | GCS + Cloudflare R2 (Parquet, Iceberg tables) | Raw event archive, forge artifacts, agent logs; lifecycle-tiered storage; the training corpus for the data flywheel |
| Data Warehouse | BigQuery | Star schemas over forge outcomes, revenue, player telemetry; dbt-managed transforms; the source for all analytics APIs |
| Vector Database | Pinecone (namespace-per-tenant, see GAP-ANALYSIS A6) | Agent memory, market intelligence embeddings, IP similarity search, marketplace recommendations |
| Knowledge Graph | PostgreSQL + pgRouting graph tables (Phase 1) → dedicated graph store when query patterns demand | Entities: operators, titles, genres, mechanics, assets, licences, market niches; edges power Idea Agent reasoning ("mechanics that co-occur with high LTV in genre X") |
| Event Streaming | Pub/Sub (all domains) + Kafka (high-volume player telemetry) | The platform's nervous system; every engine below consumes streams, none polls databases |
| Real-Time Analytics | BigQuery streaming inserts + materialised views; Redis counters for sub-second dashboards | Forge Studio live meters, admin revenue command centre, marketplace trending |
| Predictive Intelligence | Vertex AI pipelines: niche saturation forecasting, forge success prediction, demand forecasting for GPU capacity | Feeds Idea Agent market viability scores and the admission controller's capacity planning |
| Behavioural Intelligence | Event-sequence models over operator and player streams | Churn risk scoring, feature adoption analysis, anomaly detection input for the Fraud and Security agents |
| Recommendation Engine | Two-tower retrieval (Pinecone) + ranking model | Marketplace discovery ("players who bought X"), template suggestions in Forge Studio, cross-sell into the Upsell Engine |
| Decision Intelligence | Decision records + eval harness (GAP-ANALYSIS E1) | Every automated commercial decision (dynamic price, queue priority, model routing) logs its inputs, policy version, and outcome for audit and reinforcement |

## The Behaviour-Learning System

Improves games **without manipulating players unfairly**.

### Event Collection
Standard event taxonomy: `game_opened` · `session_started` · `tutorial_started` · `tutorial_completed` · `level_started` · `level_failed` · `level_completed` · `item_viewed` · `item_purchased` · `offer_rejected` · `ad_started` · `ad_completed` · `player_churn_signal` · `player_returned` · `error_encountered` · `support_requested`.

### Player Behaviour Profile
The system infers only non-sensitive behavioural characteristics: preferred session length, difficulty tolerance, genre preference, exploration tendency, social preference, progression speed, likely churn, preferred control style. **It must not infer protected characteristics or exploit psychological vulnerabilities.**

### Player Segmentation
Example segments: new-and-confused · new-and-progressing · engaged non-payer · socially engaged · high-skill · churn risk · returning · content-complete · potential advocate.

### Adaptive Difficulty
**Inputs:** failure streak, completion speed, input accuracy, resource use, previous difficulty preference.
**Adjustable outputs:** enemy speed, hint frequency, checkpoints, reward size, tutorial prompts, matchmaking band.
**Restrictions:** never secretly alter paid competitive outcomes · never penalise non-paying players · never misrepresent randomness · always provide an option to disable personalisation.

### Churn Prediction
Features: declining session frequency, tutorial abandonment, repeated failure, reduced session length, unclaimed rewards, social disconnection, negative support sentiment, purchase reversal.

```json
{
  "player_id": "anonymous_or_pseudonymous_id",
  "churn_probability_7d": 0.68,
  "drivers": ["repeated_level_failure", "declining_session_frequency"],
  "recommended_intervention": "offer_optional_hint_and_new_route"
}
```

### Reinforcement-Learning Experimentation
**Constrained contextual bandits initially — not uncontrolled reinforcement learning.**
Approved use cases: tutorial sequence, home-screen arrangement, non-monetary reward timing, recommended game content, difficulty assistance.
Restricted use cases: **price discrimination and child monetisation are prohibited.**

## Commercial Engines (Revenue Layer Consumers)

- **Dynamic Pricing Engine** — Revenue Optimisation Agent adjusts ACU top-up pricing, marketplace featured-slot pricing, and priority-queue pricing within admin-set floors/ceilings; every change is a logged decision record with rollback.
- **CLV Engine** — BigQuery cohort LTV models per acquisition channel and tier; back-tested calibration per GAP-ANALYSIS E1.
- **Churn Prevention Engine** — behavioural risk scores trigger the retention playbook: Chief-of-Staff nudges, win-back offers, save-desk routing at cancellation.
- **Upsell / Cross-Sell Engine** — usage-threshold triggers (ACU exhaustion patterns → tier upgrade; deployed title telemetry → LiveOps add-on; marketplace sales → IP Certification Premium).

## Self-Managing Platform Fleet (complete roster)

In addition to the governance fleet in [PLATFORM.md](PLATFORM.md):

| Agent | Function | Implementation |
|---|---|---|
| Bug Detection Agent | Continuous code scanning, defect and regression identification | Semgrep/CodeQL sweeps + production error clustering (Sentry signals) filed as triaged tickets with reproduction traces |
| Auto-Repair Agent | Patches issues, repairs services, redeploys components | Executes pre-approved runbooks only (restart, rollback, scale, cache flush); novel fixes go to humans as prepared PRs — never auto-merged |
| Infrastructure Optimisation Agent | Compute, storage, bandwidth, and cloud spend optimisation | Rightsizing recommendations from utilisation percentiles; spot/committed-use planning; egress anomaly alerts; monthly spend report against ACU margin targets |
| Release Management Agent | Releases, deployments, rollbacks | Owns the progressive rollout policy (10→50→100%), watches SLO burn during deploys, executes auto-rollback, maintains the release calendar and freeze windows |
| AI Governance Agent | AI behaviour, instructions, permissions, policy enforcement | Audits agent runs against tool registries and policy versions; drift metrics between policy model and QA outcomes; kill-switch per agent class |
