# JOSHRIX Studio — Ultra-Realism & 3D Output Pipeline

> **Binding rule: when live AI provider keys are in place, the forge's default output is a real, playable, real-time 3D game with ultrarealistic rendering.** 2D/stylised output happens only when the creator explicitly selects it. The current canvas prototype in `frontend/studio.html` demonstrates the flow; this document specifies what the production pipeline must actually produce.

## 1. The Output Contract

Every game the fleet forges at "Commercial starter" maturity or above must ship with:

| Requirement | Standard |
|---|---|
| **Engine** | Real-time 3D: Three.js (WebGPU renderer, WebGL2 fallback) or Babylon.js — chosen by the Strategic Agent's engine profile. Export tier: Unity/Unreal project generation for AAA-grade commissions (per PLATFORM.md engine strategy). |
| **Rendering** | Physically based rendering (PBR): metallic-roughness workflow, HDR environment (image-based lighting), ACES filmic tone mapping, shadow-mapped dynamic lights. |
| **Post-processing** | Bloom, SSAO (ambient occlusion), depth of field where appropriate, colour grading LUT per game's art direction. |
| **Materials** | Full PBR texture sets per asset: albedo, normal, roughness, metalness, AO — 2K standard, 4K hero assets. |
| **Performance** | 60fps on mid-tier mobile via automatic quality scaling (device-aware tiers per the worldwide-features spec): LOD chains on every mesh, texture down-resolution ladder, poly budgets per tier. |
| **Certification** | The QA Agent's gate gains a **Visual Fidelity score** (see §4). No marketplace listing below threshold. |

## 2. Generation Chain by Asset Class

The Asset Agent orchestrates specialised providers through the AI Gateway (`backend/ai-gateway/`), same fallback discipline as text models — primary → secondary → error, every call metered into ACUs.

| Asset class | Chain | Output |
|---|---|---|
| **Concept art & art direction** | Image model (Imagen / gpt-image / FLUX class) prompted from the blueprint's art-direction brief | Style bible: palette, lighting mood, reference boards |
| **3D models** (characters, props, environments) | Text/image-to-3D (Meshy / Tripo / Rodin class) → auto-retopology → LOD chain (LOD0–LOD3) → glTF 2.0 with PBR materials | Game-ready `.glb` assets |
| **PBR textures & materials** | Image model for albedo + material-map synthesis (normal/roughness/metalness/AO derived), tileable where flagged | 2K/4K texture sets |
| **Skyboxes & environments** | Panoramic/HDRI generation (Blockade-class skybox APIs) + procedural terrain from the Code Agent | HDR environment maps for IBL |
| **Character animation** | Auto-rigging (Mixamo-class) + motion synthesis for locomotion/action sets; blend trees assembled by the Code Agent | Rigged, animated glTF |
| **Audio** | Music generation (licensed-model providers) + SFX synthesis (ElevenLabs SFX class) mixed to a loudness standard | Adaptive music stems + SFX bank |
| **VFX** | Particle system presets (GPU instancing) parameterised by the Asset Agent | Confetti, smoke, magic, weather |

Every generated asset flows through the existing **rights-provenance pipeline** (IP similarity scan, provenance record, licence metadata) before it enters a build — realism never bypasses the Rights agents.

## 3. Engine Profiles (Strategic Agent selection)

| Profile | Stack | When |
|---|---|---|
| **Web 3D (default)** | Three.js r170+, WebGPU with WebGL2 fallback, glTF assets, Draco/Meshopt compression, KTX2 textures | Every 3D game; runs on JOSHRIX Play, PWA, and store wrappers |
| **Mobile 3D** | Same build, quality tier auto-selected: reduced shadow resolution, baked lighting option, LOD bias | PWA install + Android/iOS wrappers |
| **2D stylised** | Phaser-class canvas/WebGL | Only when the creator picks a 2D game type |
| **AAA export** | Generated Unity/Unreal project with the same assets at source resolution | Enterprise commissions, white-label studio deals |

## 4. QA Gate: Visual Fidelity Score

The QA Agent's six certification scores gain a seventh — **Visual Fidelity (0–100)** — measured, not vibes:

- **Realism audit**: automated render comparisons against the style bible; material correctness (no missing normal maps, no unlit meshes); lighting sanity (exposure, shadow acne, banding).
- **Performance audit**: 60fps sustained on the reference device matrix; draw-call and poly budgets per tier; memory ceiling on mobile.
- **Asset integrity**: every mesh has LODs; every texture in the compressed pipeline (KTX2); no placeholder assets in a certified build.
- **Threshold**: < 80 blocks marketplace listing; 80–89 lists as standard; ≥ 90 earns the **"Ultra" badge** shown on the listing card — a marketplace differentiator free games can't fake.

## 5. ACU Pricing (per MONETISATION.md rules)

3D generation costs more provider-side than text; the 4× markup floor and metering rules apply unchanged. Indicative retail metering (admin-tunable, margin-alerted):

| Action | Indicative ACUs |
|---|---|
| Concept art board | 15–30 |
| Game-ready 3D prop (modelled, retopo'd, LOD'd, textured) | 40–90 |
| Hero character (modelled + rigged + animation set) | 150–300 |
| Skybox/HDRI environment | 20–40 |
| Full PBR material set | 10–25 |
| Music track + SFX bank | 30–60 |

The forge estimate shown at blueprint stage must itemise these so creators see where ACUs go; refine passes regenerate only changed assets (delta pricing, per the studio's refine rule).

## 6. Provider Keys (add to environment when going live)

Names only — values live in Secret Manager, never in the repo (see `.env.example`):

```
IMAGE_GEN_API_KEY          # Imagen / gpt-image / FLUX-class provider
MESHY_API_KEY              # text/image-to-3D models
TRIPO_API_KEY              # 3D generation fallback provider
SKYBOX_API_KEY             # panoramic/HDRI environment generation
ELEVENLABS_API_KEY         # SFX / voice
MUSIC_GEN_API_KEY          # licensed music generation provider
```

Gateway rule unchanged: **Claude (`claude-opus-5`) remains the primary brain** for blueprints, code, and orchestration; media providers are tools the Asset Agent calls through the same metered, fallback-capable gateway. All keys server-side only (Vercel env / Cloud Run secrets) — never in client code.

## 7. Where It Runs

Per DEPLOYMENT.md: 3D generation jobs are long-running → **Cloud Run workers**, never Vercel functions. Assets land in Firebase Storage (hot titles promoted to R2/CDN per the platform spec), builds reference them by CDN URL, and Firestore job documents stream per-asset progress to the live forge dashboard — so creators watch models, materials, and animations appear in real time during the forge.
