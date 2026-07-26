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
Designs soft and premium currencies, rewards, sinks, sources, upgrade costs, progression pacing, inventory, crafting, battle pass systems, subscription benefits, and offers. (Feeds the Economy Agent stage of the Forge Protocol.)

**Guardrails:** no deceptive pricing · no forced purchases disguised as gameplay · age-sensitive restrictions · probability disclosure for random rewards · spending controls for minors · geographic compliance rules.

### Accessibility Agent
Checks and proposes: remappable controls, subtitles, text scaling, colour-blind modes, reduced motion, contrast, one-handed play, difficulty assists, screen-reader compatibility, audio cues, cognitive accessibility.

## Engineering Agents (Engineering Division)

### Architecture Agent
Selects the correct execution path from engine profiles:

| Profile | Stack |
|---|---|
| Web 2D | Phaser · PixiJS · TypeScript · WebGL/WebGPU where supported |
| Lightweight Web 3D | Three.js · React Three Fiber · Rapier physics |
| Open-source export | Godot · GDScript or C# · native and web export |
| Professional expansion | Unity · Unreal integration · UEFN pipeline |

The platform begins with deterministic web-first formats (fast preview, low deployment friction, direct hosting); Unity, Roblox, and UEFN become controlled integration targets later — the independent project model preserves creator portability rather than depending on a single external ecosystem.

### Gameplay Code Agent
Generates strongly typed code, modular game systems, state machines, input handling, physics integration, scoring, save systems, inventory, dialogue, progression, and multiplayer logic.

**Requirements (hard gates):** no direct production merge · static analysis required · tests required · sandbox execution · dependency allow-list · secret scanning · licence scanning. (Enforced by the supply-chain controls in [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §D1.)

### Scene Construction Agent
Scene hierarchy, object placement, prefabs, collision boundaries, camera setup, lighting, spawn points, navigation meshes, trigger zones.

### UI Engineering Agent
Main menu, pause menu, settings, HUD, inventory, shop, leaderboard, onboarding, accessibility surfaces, consent screens, payment confirmation.

### Backend Agent
Authentication, player profiles, cloud saves, leaderboards, inventory, entitlements, purchases, matchmaking, notifications, moderation, analytics ingestion.

### Multiplayer Agent
Chooses the networking model; creates lobbies; matches players; defines server authority; handles latency, reconnection, and state reconciliation; anti-cheat hooks; spectator support.

**Constraint:** multiplayer is a premium, constrained feature — never presented as one-click capability without infrastructure, load, and security testing.

### Build and Deployment Agent
Development, preview, staging, and production builds; build manifest; checksums; rollback package; release notes.

### Debugging Agent
Runs a closed repair loop:

```
Build → capture compile/runtime errors → classify root cause → propose patch
→ generate tests → apply in isolated branch → rebuild → compare behaviour
→ merge only when gates pass
```

### Performance Agent
Frames per second, memory, CPU, GPU, asset size, loading time, network usage, battery consumption, device compatibility.

## Art, Animation and Audio Agents (Art & Audio Division)

### Art Director Agent
Maintains consistent style, palette, shapes, character proportions, lighting, materials, UI language, and brand identity across every generated asset.

### Character Agent
Character specifications, turnarounds, expressions, equipment, animation requirements, collision dimensions, variants.

### Environment Agent
Backgrounds, tilesets, props, buildings, terrain, weather, lighting profiles.

### Animation Agent
Idle, walk, run, jump, attack, damage, death, celebration, UI transitions.

### Audio Director Agent
Music briefs, adaptive soundtrack direction, SFX palettes, UI sound language, mix and loudness standards, and licensing-safe sourcing for every audio asset.

---

*Divisions to be detailed as the specification continues: Quality and Simulation, Safety and Rights, Commerce and Publishing, Growth and Live Operations.*
