# JOSHRIX Studio — AI Agent Operating Model

The hierarchical multi-agent architecture. This is the internal organisation of the production fleet described in [PLATFORM.md](PLATFORM.md): the seven fleet agents are the *stages* of the Forge Protocol; the divisions and specialists below are how those stages are staffed and governed. The Executive Orchestrator is the LangGraph/Temporal orchestration layer specified in [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) §3–4.

## Agent Hierarchy

```
JOSHRIX Executive Orchestrator
│
├── Product and Creative Division
├── Engineering Division
├── Art and Audio Division
├── Quality and Simulation Division
├── Safety and Rights Division
├── Commerce and Publishing Division
└── Growth and Live Operations Division
```

The Orchestrator never passes unstructured prompts between agents. It maintains: a **shared game specification** · **versioned project state** · **dependency graph** · **agent permissions** · **cost limits** · **test requirements** · **decision logs** · **traceability**.

Research into end-to-end game generation supports coordinated planning, generation, automation, and debugging agents over a single general-purpose model.

## Executive Agents

### Executive Orchestrator
**Purpose:** controls the full project and determines which agents may act.
**Inputs:** user request, current project state, budget, subscription limits, platform targets, quality requirements, rights and safety policies.
**Responsibilities:** convert intentions into tasks; select suitable models and tools; estimate cost before execution; create the dependency graph; prevent conflicting changes; route work to specialists; pause when approval is required; retry failed tasks; escalate unresolved problems; maintain completion criteria.

```json
{
  "project_id": "jx_proj_123",
  "objective": "Create a mobile penalty game",
  "target_maturity": "commercial_starter",
  "task_graph": [],
  "estimated_acus": 4200,
  "estimated_provider_cost_gbp": 9.40,
  "risk_level": "medium",
  "approval_gates": [],
  "definition_of_done": []
}
```

### Game Director Agent
The creative director: protects the game's creative vision, identifies contradictions, approves major design decisions, maintains genre coherence, prevents random feature inflation, protects the core player fantasy.

### Technical Director Agent
Selects architecture and engine; defines project structure; approves dependencies; reviews performance; enforces coding standards; manages build compatibility.

### Production Manager Agent
Creates the backlog; sequences tasks; estimates complexity; tracks completion; identifies blockers; detects scope creep; generates milestone reports.

### Cost Governor Agent
Forecasts provider cost; compares model options; enforces ACU limits; caches reusable results; prevents uncontrolled loops; recommends cheaper execution routes; stops non-essential generations. (Runtime enforcement lives in the model router's budget caps — DEVELOPER-GUIDE §4.)

## Product and Design Agents (Product & Creative Division)

### Idea Discovery Agent
Transforms vague concepts into viable directions: asks high-value questions, generates concept variants, detects generic or copied ideas, identifies distinct hooks, suggests suitable scope, scores feasibility.

### Market Opportunity Agent
Uses current market intelligence where authorised. Outputs: genre demand indicators, comparable titles, audience segment, saturation level, differentiation opportunities, monetisation suitability, cultural or regional opportunities. **Constraints:** must not copy protected game designs or present estimates as guaranteed outcomes (the evidence-over-promises principle).

### Game Design Document Agent
Produces a machine-readable and human-readable GDD with required sections: vision, audience, platforms, genre, core loop, meta loop, controls, camera, mechanics, progression, level design, economy, narrative, art, audio, user interface, accessibility, analytics, safety, monetisation, live operations, technical constraints.

### Mechanics Architect Agent
Creates formal, executable mechanic specifications:

```json
{
  "mechanic_id": "penalty_shot",
  "trigger": "player_swipe",
  "inputs": ["swipe_direction", "swipe_velocity", "release_position"],
  "state_requirements": ["ball_ready", "round_active"],
  "outcomes": ["goal", "saved", "missed"],
  "balancing_parameters": {
    "goalkeeper_reaction_ms": 380,
    "shot_accuracy_multiplier": 0.82
  },
  "telemetry_events": ["shot_started", "shot_result"]
}
```

### Level Design Agent
Generates levels; defines pacing; introduces mechanics gradually; places enemies and rewards; analyses navigation; detects impossible paths; adapts difficulty; generates procedural variations.

### Narrative Director Agent
World-building; plot architecture; character arcs; missions; dialogue; branching choices; lore consistency; tone control; localisation readiness.

### Economy Designer Agent
Designs soft and premium currencies, rewards, sinks, sources, upgrade costs, progression pacing, inventory, crafting, and battle pass systems. (Feeds the Economy Agent stage of the Forge Protocol.)

---

*Divisions to be detailed as the specification continues: Engineering, Art and Audio, Quality and Simulation, Safety and Rights, Commerce and Publishing, Growth and Live Operations.*
