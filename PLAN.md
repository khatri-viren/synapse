# Phased Implementation & Manual Verification Plan — Neural Network Hero

## Summary

Create a companion document named `PHASED_IMPLEMENTATION_PLAN.md` alongside [SYLVA_ARCHITECTURE_FINDINGS.md](/Users/khatri_viren/Developer/Projects/brain-animation/SYLVA_ARCHITECTURE_FINDINGS.md). It will be the build checklist for the dark, front-facing neural-network hero: a procedural brain, five branded 3D badges, and inbound data links.

Each phase is a hard gate. Do not begin the next phase until its manual acceptance checks pass and a screenshot or short screen recording is saved as sign-off.

The locked technical direction is:

- Vite + TypeScript + direct Three.js modules, rather than React/R3F, because this is a self-contained visual canvas with one animation owner.
- `WebGPURenderer` in automatic mode, using WebGPU where available and WebGL2 as the renderer fallback. Restrict materials and post-processing to TSL/Node-based APIs: the current Three.js WebGPU renderer does not support the traditional `ShaderMaterial`, `onBeforeCompile`, or legacy `EffectComposer` approach. [Three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer)
- A procedural, stylized brain—not an anatomical reconstruction and not a use of the supplied watermarked brain image.
- Beveled app-badge solids, built from approved SVG brand marks; the supplied Instagram AVIF remains visual reference only.
- Fully opaque dark canvas, HDR bloom, front-facing camera, ambient pointer parallax on desktop, and no control/UI overlay in production.
- Analytic movement and trails: badge orbits, connection curves, and packets are derived from time rather than simulated with persistent particle history.

## Locked interfaces and ownership

Use these internal contracts so no subsystem writes another subsystem’s state:

```ts
type LogoId = 'instagram' | 'facebook' | 'shopify' | 'slack' | 'whatsapp';

type QualityTier = 'desktop' | 'mobile' | 'reduced-motion' | 'fallback';

type IntroPhase =
  | 'brain-scan'
  | 'badge-arrival'
  | 'link-activation'
  | 'ambient';

type SceneState = {
  elapsedSeconds: number;
  quality: QualityTier;
  introPhase: IntroPhase;
  pointerNdc: { x: number; y: number };
  pointerStrength: number;
};

interface SceneController {
  start(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setQualityTier(tier: QualityTier): void;
  setIntroPhase(phase: IntroPhase): void;
  dispose(): void;
}
```

System handoff order:

```text
BrainSystem publishes brain-anchor positions
        ↓
LogoOrbitSystem publishes moving badge sockets
        ↓
ConnectionSystem updates curves between the two
        ↓
PacketSystem samples the same curves and global time
        ↓
SceneController renders one HDR output
```

Add a development-only verification mode, enabled with `?debug=1`, with controls to:

- Force `auto` or WebGL fallback renderer mode.
- Override `desktop`, `mobile`, and `reduced-motion` quality tiers.
- Replay, pause, and jump to any named intro phase.
- Toggle brain fill, primary wires, ghost wires, logo sockets, brain anchors, connections, packets, bloom, and performance statistics.
- Show frame-time percentiles, renderer mode, current quality tier, and current intro phase.

This debug tooling must never appear in the production experience.

## Phase gates

### Phase 0 — Project foundation and diagnostic harness

**Build**

- Set up the direct Three.js TypeScript application shell, opaque full-viewport canvas, renderer lifecycle, resize handling, visibility pause/resume, and cleanup path.
- Add `SceneController` as the only top-level animation-loop and render owner.
- Initialize renderer selection as `auto`, with a development-only forced WebGL fallback mode.
- Add the debug mode and its controls before visual work begins.
- Establish a dark neutral background, fixed color-management policy, and an accessible text description for the canvas.

**Manual verification**

1. Load the page at 1440×900 and 390×844. A dark canvas fills the viewport with no page scrollbars or transparent-canvas artifacts.
2. Confirm the debug overlay reports the active renderer and selected quality tier.
3. Force WebGL mode and reload. The canvas still initializes without console errors.
4. Resize repeatedly, rotate a phone, hide/show the tab, and return. The canvas remains correctly sized and animation timing does not jump.
5. Confirm production mode has no visible debug controls.

**Exit gate:** Browser lifecycle and fallback selection are reliable before any complex geometry is added.

---

### Phase 1 — Composition, camera, and responsive framing

**Build**

- Create the scene hierarchy: `brainGroup`, `badgeGroup`, `connectionGroup`, `packetGroup`, and post-processing output.
- Add the fixed perspective camera and a constrained `CameraRig`; it is the sole writer of camera position and target.
- Use a straight-on brain composition with enough depth for badges to pass in front of and behind it.
- Place a proxy brain volume and five color-coded badge markers in their intended approximate locations.
- Define the final platform-to-brain directionality: Instagram, Facebook, Shopify, Slack, and WhatsApp all send signals inward.

**Manual verification**

1. At desktop width, the brain is centered and dominates the frame without clipping.
2. At mobile width, all five badge markers remain visible and balanced around the brain; none sit under browser safe areas.
3. On desktop pointer movement, the scene shifts only subtly; it must feel like depth, not orbit controls.
4. On touch devices, there is no unstable pointer parallax or draggable camera behavior.
5. Check the camera framing with every marker temporarily placed at the deepest/backmost part of its route.

**Exit gate:** The composition works before real geometry, materials, or animation complicate it.

---

### Phase 2 — Procedural brain topology and anchor contract

**Build**

- Generate a deterministic, stylized two-hemisphere brain from one seeded parametric grid with a clear central fissure.
- Build an indexed opaque dark depth shell and derive the wire geometry directly from the same vertex grid. Do not use `material.wireframe` and do not author an unrelated wire overlay.
- Expose five stable brain anchors, one for each platform link, with positions attached to the brain surface.
- Produce a primary front wire layer for all devices and a lower-intensity ghost/back wire layer for desktop only.
- Keep the supplied brain image as visual reference only; do not use its pixels, watermark, or topology.

**Manual verification**

1. Toggle fill, primary wires, and anchors individually in debug mode.
2. Confirm the wire grid matches the brain silhouette exactly; there should be no broken edges, random diagonal lines, or detached wire mesh.
3. Confirm the central fissure reads clearly from the front camera.
4. Turn on anchor markers and verify all five anchors visibly sit on the brain, not in empty space.
5. Resize and replay the scene; anchors remain stable and no geometry regenerates unpredictably.

**Exit gate:** The brain is a credible, original, front-facing neural object before motion is introduced.

---

### Phase 3 — Wireframe energy, scan reveal, and brain material

**Build**

- Use TSL/Node materials for the brain fill and wire layers.
- Add a scan-based introduction: energized wires reveal first, then the dark brain shell resolves behind them.
- Assign static per-segment phase variation so the wire energy appears distributed without CPU simulation of every edge.
- Add restrained traveling brightness nodes on selected wire paths; keep the majority of the brain calm enough for platform connections to remain legible.
- Preserve depth behavior: wires behind the shell should be naturally occluded, while the desktop ghost layer gives only a faint structural read.

**Manual verification**

1. Replay `brain-scan` ten times. The reveal consistently starts as wire energy and settles into the same ambient brain.
2. Inspect close-up and at full screen: no unstable flicker, harsh line aliasing, or visibly detached glow.
3. Disable bloom: the wire structure must remain readable without relying on post-processing.
4. Confirm the brain looks intentionally wireframed—not like a generic low-poly object with every triangle outlined.

**Exit gate:** The brain itself communicates the visual language before brand elements are added.

---

### Phase 4 — 3D platform badges and layered analytic orbits

**Build**

- Obtain and vet approved SVG assets for Instagram, Facebook, Shopify, Slack, and WhatsApp before shipping. Convert them into beveled, rounded app-badge solids with brand-color accents.
- Do not use the supplied AVIF as a production asset or attempt to infer a 3D logo from it.
- Give each badge a unique, fixed analytic ellipse: radius, inclination, phase offset, angular speed, and limited authored tilt.
- Attach a stable `connectionSocket` to each badge; the connection begins at this socket rather than at the badge origin.
- Keep the objects recognizably branded but subordinate to the brain; no logo should dominate the center of the frame.

**Manual verification**

1. Pause in ambient mode and confirm all five logos are recognizable at desktop and mobile scale.
2. Let the scene run for at least one full orbit cycle. No badge should collide with the brain, intersect another badge, or leave the safe frame.
3. Verify the orbital layering: some badges pass behind the brain and some in front, but the front-facing brain remains the focal point.
4. Toggle badge sockets and verify each socket follows its badge exactly.
5. Confirm no unapproved raster image, watermark, or third-party stock brain asset appears in the render.

**Exit gate:** The branded objects feel like deliberately placed 3D network nodes, not floating icons.

---

### Phase 5 — Connections, animated trails, and inbound data packets

**Build**

- Create five fixed-capacity dynamic connection meshes, each following a cubic Bézier curve from a moving badge socket to its assigned brain anchor.
- Update existing buffer attributes in place; do not re-create geometry every frame.
- Add analytic, inward-moving packets that sample the same curve and global time as the links.
- Use two packets per link on desktop and one packet per link on mobile. Packets must always travel platform → brain.
- Keep connection glow lower than the active packet head so the eye can read flow direction.
- Enable normal depth testing so paths passing behind the brain are occluded naturally.

**Manual verification**

1. Turn on socket and anchor overlays. Every connection must remain attached to both ends while badges orbit.
2. Watch all five links for a full cycle: packets move only toward the brain; none travel outward or reverse unexpectedly.
3. Verify that a link behind the brain disappears behind the shell and returns cleanly in front without popping.
4. Confirm each connection has a distinct, readable route rather than a tangled bundle at the center.
5. Toggle packet visibility. The underlying connection network remains attractive and understandable without packets.

**Exit gate:** The core story—platform information flowing into the brain—is visually unambiguous.

---

### Phase 6 — Choreography, ambient behavior, and motion accessibility

**Build**

- Drive the scene from one authoritative elapsed-time value with these named, replayable phases:

  | Time | Phase | Behavior |
  |---|---|---|
  | 0.00–1.25 s | `brain-scan` | Brain wires energize and reveal the dark shell. |
  | 0.85–2.05 s | `badge-arrival` | Badges enter their established orbital loops. |
  | 1.55–2.85 s | `link-activation` | Connections grow in and the first inbound packets appear. |
  | 2.85 s onward | `ambient` | Slow continuous orbits, wire energy, and inbound packet flow. |

- Add bounded desktop pointer response through `CameraRig`, never direct camera controls.
- Respect `prefers-reduced-motion`: display the completed, static ambient composition with no continuous orbit, scan, packet travel, or pointer response.
- Pause timing while the page is hidden and resume without a large catch-up jump.

**Manual verification**

1. Hard-reload the page and record the first four seconds. The sequence must read brain → platforms → connections → living network.
2. Use debug controls to jump directly to each phase and confirm no phase depends on invisible prior state.
3. Enable reduced motion at OS/browser level and reload. The final composition appears immediately and remains stable.
4. Move the desktop pointer across the screen. The response is restrained and does not cause badges or connections to detach.
5. Switch tabs during the intro and return. Animation resumes smoothly rather than skipping through phases.

**Exit gate:** The scene feels intentional on first load and remains comfortable for motion-sensitive visitors.

---

### Phase 7 — HDR finishing, performance tiers, and non-WebGL fallback

**Build**

- Use one output-owner pipeline: opaque HDR scene → full-scene bloom → fixed exposure → tone mapping → one sRGB display conversion.
- Let wires, packets, and small badge accents exceed bloom threshold; keep the brain shell and badge faces below it.
- Avoid temporal anti-aliasing in v1; it adds motion-history and reset complexity without enough value for this hero.
- Apply fixed startup quality tiers rather than adaptive quality thrashing:

  | Setting | Desktop | Mobile | Reduced motion |
  |---|---:|---:|---:|
  | Brain grid per hemisphere | 56 × 42 | 36 × 28 | 36 × 28 |
  | Ghost/back wire layer | Yes | No | No |
  | Link curve samples | 48 | 32 | 32 |
  | Packets per link | 2 | 1 | 0 |
  | Device pixel ratio | Cap at 1.75 | Cap at 1.0 | Cap at 1.0 |
  | Pointer parallax | Yes | No | No |
  | Continuous animation | Yes | Yes, restrained | No |

- If neither rendering path initializes, show an original static CSS/SVG fallback poster with an accessible description; never fall back to the supplied stock brain image.
- WebGPU is not universally available and requires a secure context where supported, so this fallback and WebGL path are required rather than optional. [MDN: WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

**Manual verification**

1. Compare bloom-on and bloom-off: bloom enhances the signal but does not wash out brand colors or erase wire detail.
2. In desktop mode, monitor a 60-second ambient run: p95 frame time must remain at or under 16.7 ms on the target desktop test machine.
3. In mobile mode, run the same check on iPhone Safari and Android Chrome: p95 frame time must remain at or under 33.3 ms.
4. Force WebGL mode and verify the visual hierarchy, intro, quality tier, and reduced-motion path still work.
5. Simulate renderer initialization failure and verify the static fallback is legible, intentional, and accessible.

**Exit gate:** The hero meets the 60 FPS desktop / 30 FPS mobile target without removing the core visual story.

---

### Phase 8 — Release validation and sign-off

**Build**

- Add deterministic unit coverage for procedural brain generation, finite anchor values, analytic orbit positions, link endpoint attachment, signal direction, quality-tier selection, and reduced-motion state.
- Add visual capture coverage for: brain scan, first activated connection, steady ambient desktop, steady ambient mobile, bloom disabled, reduced motion, and forced WebGL fallback.
- Verify resource disposal when the scene is torn down: geometries, materials, renderer targets, listeners, and animation loop all release cleanly.
- Check approved brand asset provenance before deployment.

**Manual verification**

1. Test current desktop Chrome, iPhone Safari, and Android Chrome at their intended viewport sizes.
2. Capture one sign-off image or video for every preceding phase and record pass/fail plus device/browser.
3. Confirm no warning-level console errors, leaked animation loops after teardown, missing logo assets, visual watermarks, or copied Sylva assets/shaders remain.
4. Test page reload, browser resize, orientation change, visibility change, reduced motion, auto renderer mode, and forced WebGL one final time.
5. Approve the scene only when the brain remains the unmistakable central subject and all five platforms visibly feed it.

## Assumptions and defaults

- This is a single, pure visual hero canvas; v1 has no copy, CTA, legend, clickable logo behavior, scroll narrative, audio, or user-controlled camera.
- The brain is intentionally stylized and symmetric enough to read cleanly from a frontal view; it is not intended as a medical model.
- The five platforms are fixed for v1: Instagram, Facebook, Shopify, Slack, and WhatsApp.
- Brand SVGs must be sourced or approved before implementation; no supplied stock/watermarked imagery enters the final build.
- The architecture borrows Sylva’s useful implementation ideas—shared topology, a temporary energy-reveal layer, and shader/time-driven motion—but uses an original composition, original geometry, and original materials.
