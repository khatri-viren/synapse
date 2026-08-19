# Architecture Plan: Neural Network Hero

## Summary

Build a pure, full-viewport 3D hero: an original stylized, front-facing brain sits at the center; Instagram, Facebook, Shopify, Slack, and WhatsApp appear as colorful beveled 3D app badges that travel on layered orbital loops around it. Each badge sends animated, one-way signal packets into its own connection point on the brain.

Use a Vite + TypeScript application with direct Three.js modules rather than React Three Fiber. The workspace is currently empty and the experience is intentionally canvas-only, so direct ownership of the renderer, animation loop, camera, scene graph, and lifecycle will be simpler and more reliable.

Use Three.js `WebGPURenderer` as the renderer abstraction, with WebGPU preferred and its automatic WebGL2 fallback enabled. Keep the scene within the shared TSL/NodeMaterial feature set; do not use `ShaderMaterial`, raw GLSL, WebGPU-only compute, or `EffectComposer`. Three.js documents both the WebGL2 fallback and the fact that `ShaderMaterial`/`onBeforeCompile` are not supported by `WebGPURenderer`. [Three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer) WebGPU itself remains limited-availability and requires HTTPS, so the fallback and a renderer-failure poster state are required. [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

## Core scene architecture

```text
opaque full-screen canvas
  └── SceneController
        ├── Renderer + HDR/post-processing owner
        ├── CameraRig
        ├── BrainSystem
        │     ├── depth/fill shell
        │     ├── primary animated wire layer
        │     └── desktop-only ghost/back-wire layer
        ├── LogoOrbitSystem
        │     └── 5 LogoActor instances
        ├── ConnectionSystem
        │     └── 5 dynamic link tubes + inbound signal packets
        ├── IntroSystem
        │     └── deterministic network-boot state machine
        ├── PointerSystem
        └── Quality/LifecycleSystem
```

Organize the code around three top-level areas:

```text
src/scene/    renderer, camera rig, input, lifecycle, quality tiers
src/brain/    generated brain topology, wire material, surface anchors
src/network/  platform badge assets, orbit actors, links, signal packets
```

Use these public configuration contracts:

```ts
type LogoId = 'instagram' | 'facebook' | 'shopify' | 'slack' | 'whatsapp';

type QualityTier = 'desktop' | 'mobile' | 'reduced-motion' | 'fallback';

type IntroPhase =
  | 'brain-scan'
  | 'badge-arrival'
  | 'link-activation'
  | 'ambient';

type BrainAnchor = {
  hemisphere: 'left' | 'right';
  u: number;
  v: number;
};

type LogoActorConfig = {
  id: LogoId;
  brandColor: string;
  orbit: {
    radiusX: number;
    radiusY: number;
    radiusZ: number;
    phase: number;
    angularSpeed: number;
    inclination: [number, number, number];
  };
  brainAnchor: BrainAnchor;
};

type SceneState = {
  elapsedSeconds: number;
  quality: QualityTier;
  introPhase: IntroPhase;
  pointerNdc: { x: number; y: number };
  pointerStrength: number;
};
```

`CameraRig` is the only writer of camera position, target, and projection. `LogoOrbitSystem` is the only writer of logo transforms. `ConnectionSystem` only reads the published logo socket transforms and brain anchors; it must never move either endpoint itself.

## Geometry, motion, and visual systems

### Brain system

Generate an original stylized brain from two mirrored parametric hemisphere grids, not from the watermarked PNG. The supplied PNG remains a front/topology-density reference only; it must not be shipped, traced, or used as a texture.

The brain generator should:

- Build two stable indexed `BufferGeometry` hemisphere meshes from one fixed seed.
- Apply deterministic object-space lobe, sulcus, and low-frequency noise fields to create a recognizable but intentionally non-anatomical brain silhouette.
- Separate the hemispheres with an authored center fissure.
- Expose stable `BrainAnchor` locations so every logo connection remains attached to the same semantic area through resize, quality changes, and the intro animation.
- Produce one dark, nearly black opaque fill shell for reliable occlusion of logos and trails that pass behind the brain.
- Derive the visible wireframe from the same topology, rather than applying a generic wireframe flag or drawing a disconnected overlay.

Render the visible brain as two wire layers:

1. A depth-tested primary wire layer for the front-facing topology.
2. A low-opacity, desktop-only X-ray/ghost layer for selected back-facing edges, making the form feel volumetric without overwhelming the silhouette.

Give each wire segment a deterministic phase attribute. A NodeMaterial uses global time, segment phase, and the network boot state to vary emission intensity along the topology. The animation should read as electricity moving through the existing wireframe, not as every line independently flickering.

Add a small, bounded set of brighter signal nodes that travel across selected topological edge chains. Do not simulate every mesh edge and do not use particle history buffers for this effect.

### Platform badge system

Create exactly five logical logo actors:

- Instagram
- Facebook
- Shopify
- Slack
- WhatsApp

Each actor is a code-generated beveled app badge:

- Rounded, extruded tile body with a shallow bevel.
- Brand glyph created from a vetted SVG path, loaded into a Three.js shape and extruded slightly above the tile.
- Darker sidewalls and a controlled material response so the object reads as 3D without becoming a reflective distraction.
- Brand color applied primarily to the glyph and restrained tile accents; the wider scene remains deep blue-black.

The supplied Instagram AVIF is reference-only, not a production 3D asset. Before implementation, place approved SVG brand marks in the asset pipeline. The brand glyph source must be organization-approved or sourced under terms appropriate for the final use.

Each badge has a named `connectionSocket` at its inward-facing edge. That socket, not the badge origin, drives the corresponding brain link.

### Orbit and pointer behavior

Use five fixed, inclined elliptical orbit paths with deliberately staggered phase, speed, radius, and depth. The paths must create controlled front/behind passes while keeping all badges recognizable.

Each logo actor uses closed-form motion:

```text
elapsed seconds + actor phase
  -> inclined ellipse position
  -> authored tilt
  -> camera-aware front-facing orientation
```

No physics engine, collisions, or recurrent simulation is needed.

Use a constrained perspective camera in a straight-on frontal composition. It must not expose drag-orbit controls. Pointer movement subtly offsets the camera rig and slightly raises nearby logo/trail energy; the camera remains the only writer of camera state.

For touch devices, remove pointer parallax and use the authored ambient pose only.

### Connection and signal system

Create one connection link per logo actor. Each link is a dynamic but fixed-capacity tube/ribbon mesh, not a history trail.

For every frame:

```text
BrainSystem publishes anchor pose
  -> LogoOrbitSystem publishes badge/socket poses
  -> ConnectionSystem evaluates each cubic Bézier link
  -> signal packets evaluate position from the same time and curve parameter
  -> renderer consumes the resulting geometry/material state
```

Every link should:

- Start at the logo’s `connectionSocket`.
- End at its stable brain anchor.
- Use an authored cubic Bézier route that bows away from the brain before returning to the surface.
- Be depth-tested, so it disappears correctly when routed behind the opaque brain shell.
- Carry a subtle static emissive body plus 2–3 bright packets moving only from platform to brain.
- Use per-link phase offsets so packets do not arrive simultaneously.
- Reveal progressively during the intro, then remain continuously active during ambient mode.

Because all paths are analytic, compute tube samples and packet positions from elapsed time. Do not store evolving trail histories, run GPU compute, or allocate per-frame geometry objects.

### Network-boot choreography

Use one deterministic intro timeline:

| Time | Phase | Observable result |
|---|---|---|
| 0.0–1.25s | `brain-scan` | A scan field reveals the brain wireframe from center outward; primary wires energize before ghost wires. |
| 0.85–2.05s | `badge-arrival` | Badges ease from their initial orbit positions into their assigned elliptical paths. |
| 1.55–2.85s | `link-activation` | The five connection tubes draw toward their brain anchors and first inbound packets launch. |
| 2.85s onward | `ambient` | Layered orbits, wire energy, subtle pointer response, and continuous inbound signals run indefinitely. |

The intro state machine owns phase boundaries and event timing. All animation derives from a single elapsed-seconds clock so the intro can be replayed deterministically and will not vary with refresh rate.

## Rendering, quality, and lifecycle

Use one opaque HDR scene pass and one post-processing owner:

```text
scene-linear HDR scene
  -> full-scene bloom
  -> fixed exposure
  -> tone map
  -> one sRGB output conversion
```

Use full-scene bloom rather than a selective emissive MRT. Keep brain wires, link tubes, and signal packets above the bloom threshold; keep badge surfaces below it. This produces controlled glow without a second scene traversal or attachment.

Use fixed exposure because the scene is art-directed and has no lighting conditions that justify auto-exposure. Do not add temporal anti-aliasing in v1; its reset and motion-vector requirements do not justify the complexity for this hero. Use MSAA on the desktop tier and a capped device pixel ratio.

Select a fixed tier at startup; do not implement adaptive DPR in v1.

| Tier | Rendering behavior |
|---|---|
| Desktop | Target 60 fps. Full brain topology, primary + ghost wires, all five dynamic tubes, 2–3 packets per link, full bloom, subtle pointer parallax. |
| Mobile | Target 30 fps. Lower brain/wire density, no ghost wires, fewer packet instances, reduced bloom resolution, DPR capped at 1, no touch parallax. |
| Reduced motion | No scan or continuous orbit. Render a deterministic static composition with all badges, links, and the brain visible; retain only essential visual state. |
| Renderer failure | Replace the canvas with a static branded fallback image/gradient and accessible textual description. |

Support current iOS Safari and Android Chrome in the mobile tier. Validate both native WebGPU and the WebGL2 fallback path. The scene must be served over HTTPS in production so WebGPU can initialize where supported.

Dispose all Three.js geometry, materials, post nodes, event listeners, renderer resources, and the animation loop when the scene is unmounted or replaced.

## Validation and acceptance plan

### Deterministic logic checks

- The brain generator produces finite vertices, valid indices, consistent normals, and identical topology for a fixed seed and quality tier.
- Every `BrainAnchor` resolves to a stable world-space point and normal.
- Each logo actor returns to the same analytic orbit pose for the same elapsed time.
- Every connection link begins exactly at its badge socket and ends at its assigned brain anchor.
- Signal packet `u` values progress only from logo to brain and wrap without visible jumps.
- No logo, tube, or packet retains stale transforms after resize, quality-tier replacement, or intro restart.

### Visual checks

Capture fixed scenes at:

- Initial brain scan.
- First active link reveal.
- Fully ambient desktop composition.
- Fully ambient mobile composition.
- Reduced-motion composition.
- Bloom disabled, to confirm that the wireframe and connection hierarchy remain readable without glow.
- A badge passing behind the brain, to confirm correct depth occlusion.
- A badge passing in front of the brain, to confirm it remains legible and its link stays attached.

### Runtime checks

- Desktop sustained p95 frame time meets the selected 60 fps target on the defined desktop test machine.
- Mobile sustained p95 frame time meets the selected 30 fps target on current iOS Safari and Android Chrome.
- Native WebGPU and forced WebGL2 fallback render the same scene structure and quality-tier behavior.
- Resize, DPR changes, tab hide/show, intro replay, and repeated scene teardown/recreation do not leak listeners or GPU resources.
- The WebGL2 fallback and reduced-motion modes never invoke WebGPU-only compute or renderer-specific material APIs.

## Assumptions and locked defaults

- The hero is visual-only: no headline, CTA, legend, click targets, drag controls, or platform detail panels are included in v1.
- The brain is an original stylized procedural object, not an anatomical reconstruction and not a reuse of the watermarked reference.
- The visual direction is dark neural space: deep blue-black background, cool cyan/indigo brain and signal emission, and restrained official color accents on the five badges.
- Signals always flow from platforms toward the brain.
- The logo count is fixed at five in v1.
- The first implementation uses Vite + TypeScript + direct Three.js modules, `WebGPURenderer`, TSL/NodeMaterials, and a WebGL2-compatible feature subset.
- The existing Sylva research informs the shared-topology approach: one brain geometry is the authoritative source for the dark fill shell, wireframe, anchors, scan state, and surface-connected signals; it is not a visual or code copy of Sylva.
