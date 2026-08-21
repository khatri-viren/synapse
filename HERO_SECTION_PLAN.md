# Hero Section Plan — DOM composition around the neural centerpiece

Status: **proposal, Phase 9+**. Extends `PLAN.md` (phases 0–8) and `Architectural_PLAN.md`.
Prerequisite: this plan **amends a locked constraint**. See §1.5.

---

## Summary

Phases 0–7 delivered a finished visual centerpiece: an anatomical wireframe brain with five
orbiting platform badges, dashed inbound connections, travelling packets, and a single-owner HDR
output pipeline. It is deliberately, explicitly *only* that — a canvas with no copy.

This plan adds the surrounding hero: a liquid-glass nav, a headline that sits **behind the brain in
real depth**, a subheading and CTAs, folding info cards, and an atmospheric particle field — then
puts the whole thing on a scrolling page with the hero pinned.

The governing constraint is inherited, not invented: **one clock, one camera writer, one output
owner, one canvas.** Every addition below is designed to fit that contract rather than sit beside
it.

### Start here

Four things, cheapest first, each of which removes a decision from the critical path:

1. ~~**Decide the DOM stack.**~~ **Settled: vanilla TS + `motion`, no React** (§1.2).
   `npm i motion` is the only install Phase 12 needs.
2. **Open `/glass-probe.html` in real Firefox** (`npm run dev`). The glass question is otherwise
   settled by measurement (§4.2) — `backdrop-filter` does sample the WebGPU canvas, in Chromium and
   Safari, at ~1.6% frame cost. Firefox is the one gap, and the browsers' own `CSS.supports` lies
   about it, so it needs a real look.
3. **Retune the framing** (§3.1, orbit ×0.85 / `safeY` 0.72). One constant and five numbers, no new
   code, immediately visible, and it is a strict improvement to the existing scene even if the hero
   never gets built.
4. **Prototype `TextGeometry`** before committing to the MSDF pipeline (§4.1). If extruded geometry
   holds up at hero scale, an entire build step disappears.

---

## 1. Corrections to the brief

Research changed four of the assumptions this work started from. Each one changes the plan.

### 1.1 Canvas UI is not a component library

The brief named `canvasui.dev` as "want to use for sure". It does not contain what it was picked
for. Verified against its raw registry JSON (`https://canvasui.dev/r/registry.json`, 210 items =
35 components × 6 framework flavors):

- **There is no navbar, dock, card, button, text, or background component in it.** A regex over all
  210 registry item names for `nav|dock|card|button|menu|header|hero|badge|tab|gradient|aurora|beam|orb|noise`
  returns zero matches.
- What it actually is: **35 WebGL2 post-processing effects that distort your live HTML.** The
  mechanism is the experimental **HTML-in-Canvas API** (`ctx.drawElementImage()` +
  `canvas.requestPaint()` + `layoutsubtree="true"`), which paints real interactive DOM into a canvas
  so a fragment shader can refract it. Text stays selectable; links stay clickable.
- **It is Chrome-only, behind a flag, in origin trial** — Chrome 148–150, `chrome://flags/#canvas-draw-element`
  locally, a registered origin-trial token in production. No Firefox or Safari commitment. Stable
  ship is *estimated* late 2026.
- **Each effect instance creates its own WebGL2 context.** We already run one. Browsers cap
  concurrent contexts (~8–16) and evict the oldest.
- Degradation is partial, not graceful: `create*()` detects the missing API and still renders the
  WebGL overlay, but with no page texture to refract — so the effect's entire point is gone for most
  visitors. The HTML stays visible and interactive, which is the safe part.
- It does **not** use `backdrop-filter` anywhere (grepped: zero hits). All optics are shader-computed.
- License: MIT + Commons Clause. Fine for a landing page.

**Verdict: not a foundation.** It cannot supply the nav, the cards, or the glass. Keep it as
optional late-stage progressive enhancement — **one** effect at most (`Glass` or `Glyph Rain`), added
after the hero is complete and behind a capability check, never as something the design depends on.

The one genuinely useful finding: **it ships a first-class vanilla TS flavor.** `createGlass(...)`
is a plain imperative factory. It does not need React — which matters for §1.2.

### 1.2 React is no longer justified — decision reversed, staying vanilla

React was chosen on the premise that both named libraries are React ecosystems. That premise was
half wrong, and the half that was right is cheap to work around:

| Source | Reality |
|---|---|
| **Canvas UI** | Ships vanilla TS as a first-class flavor. 30 of 35 components have **zero** dependencies. React not required at all. |
| **Fancy Components** | React as shipped — but median component is **147 LOC**, and its animation engine is the `motion` package, which **also ships a vanilla API** (`animate`, `stagger`, `inView`, `hover`, `press`, `spring` from `motion`/`motion/dom`). Porting keeps the identical spring engine. `letter-3d-swap` ≈ 80 lines vanilla; `scramble-in` is 150 LOC with zero deps. |
| **Get Layers** | Not a component library at all — a paid prompt/template shop run by Textura.agency. Its site is DOM + CSS + react-spring + Lenis. Nothing to install. |

Against that, adding React means React + React DOM + Tailwind v4 + a JSX build change entering a
codebase whose entire character is hand-owned vanilla TS with explicit single ownership, `dispose()`
on everything, and a `getDebugSnapshot()` on every subsystem. Two idioms would coexist permanently
for an estimated **~400 lines** of portable component code.

**Decision (2026-08-19): stay vanilla, add `motion` only.** It gives the same springs the reference
sites use, works with the existing render loop, and needs no build change. This reverses the earlier
React answer, which had been given on bad information.

What that means concretely, so Phase 12 has no ambiguity:

- **Install exactly one new runtime dependency:** `motion` (13.1.0 current; pulls only `framer-motion`
  + `tslib`). No React, no React DOM, no Tailwind, no JSX, no change to `vite.config.ts` or
  `tsconfig.json`.
- **Import from the package root** — `import { animate, scroll, inView, hover, press, stagger, spring,
  prefersReducedMotion } from 'motion'`. **Verified**, not assumed: the root entry *is* the vanilla one
  (it re-exports `framer-motion/dom`), React lives at `motion/react`, and **there is no `motion/dom`
  subpath** — importing it is a hard build error. All the names above typecheck clean under this
  repo's exact settings (`strict`, `verbatimModuleSyntax`, `moduleResolution: bundler`) using the
  repo's own TypeScript 7.0.2. Also on the root and useful here: `springValue`, `motionValue`,
  `transform`, `mix`, `interpolate`, `wrap`, `clamp`, `progress`, `resize`, and the easing set
  (`easeInOut`, `cubicBezier`, `anticipate`, `backOut`, `steps`). `motion/mini` exists as a smaller
  WAAPI-only build but exports just `animate` and `animateSequence` — not enough for this hero.
- **`prefersReducedMotion` is exported**, so the DOM layer can read the same signal the existing
  `reduced-motion` quality tier already acts on, rather than duplicating a media-query listener.
- **Do not import `frame` / `cancelFrame` / `frameData`.** They are on the root, and they are Motion's
  own ticker. `main.ts` owns the only `requestAnimationFrame` in this app (§3.2, §4.7) — the same
  reason GSAP was rejected. `animate()` driving CSS custom properties is fine; a second scheduler is
  not.
- **Ported components live in `src/ui/`**, the tier `SYLVA_ARCHITECTURE_FINDINGS.md:655–684` already
  proposed and which does not yet exist. Each one follows the house pattern the scene modules use:
  constructor takes its host element, exposes `update(state)` if it needs per-frame data,
  `getDebugSnapshot()`, and `dispose()` that removes every listener it added.
- **Port, don't wrap.** `letter-3d-swap` and `scramble-in` become plain TS classes reading the same
  `motion` springs. Treat the Fancy Components source as reference, not as a dependency.
- **`motion` never owns the ticker.** It animates CSS custom properties and DOM styles; the render
  loop in `main.ts` stays the only `requestAnimationFrame` in the app (§3.2, §4.7). Where a DOM
  animation must stay in sync with the scene, drive it from `CHOREOGRAPHY_TIMELINE` through the CSS
  bridge rather than starting an independent `animate()` timeline.

One consequence worth stating plainly: **`letter-3d-swap` is now a per-glyph DOM technique that the
headline cannot use**, because the headline is geometry in the scene (§2, §4.1). Its per-glyph
entrance is TSL, not CSS. `letter-3d-swap` and `scramble-in` are still worth porting — for the
subhead, the nav labels, and card headings — but they are supporting-copy tools, not the hero type.

### 1.3 The real lesson from Get Layers is a technique, not a component

Get Layers has **no Three.js, no WebGL, no GSAP, no canvas** — 868KB of JS chunks, zero
`WebGLRenderer` or shader code. It is DOM + CSS animated by react-spring and scrolled by Lenis.

Its whole "premium" feel comes from one pattern worth stealing wholesale:

> **One spring drives one CSS custom property, and `calc()` fans that single value across many
> properties.**

```css
.glass-card  { background: rgba(255,255,255, calc(.04 + var(--lift,0) * .04)); }
.card-arrow  { width: calc(var(--lift,0) * 1.35rem); opacity: var(--lift,0); }
.border-glow { opacity: var(--lift,1); }
```

One spring → background lift, an arrow growing from zero width, and a glow ring fading in, all
perfectly in sync and impossible to desynchronise.

**This maps exactly onto what this project needs anyway.** The hero already requires a
render-loop→CSS-variable bridge (§3.2). Once that bridge exists, the same `calc()` fan-out gives the
entire DOM layer its motion for free — no React, no animation library on the critical path.

Three more techniques worth taking:

- **Traveling border glow** — a 1.5px gradient ring via the `mask-composite: xor` trick, with two
  radial-gradient blobs orbiting the rounded-rect perimeter, `t` and `t+0.5` so they sit opposite.
  Paused when off-screen.
- **CTA inset glows** — a hairline top highlight plus warm glow rising from the bottom edge and cool
  glow from the left, where hover deepens offset *and* blur radius together.
- **Drifting radial-gradient backdrop** — two radial gradients whose centres are `calc()`-ed off one
  `--hero-drift` variable, moving in opposition. A two-light-source atmosphere at zero GPU cost — a
  good cheap companion to the WebGL scene rather than a competitor to it.

Also worth weighing: **Layers deliberately does not split its headline per-letter**, and caps display
type at `clamp(1.4rem, 4vw, 3rem)` at weight 300. Restraint is doing a lot of the work there.

### 1.4 The palette is monochromatic — that is the biggest cheap win available

Every colour in the scene is on one cyan axis: `#58bfe8` wires, `#8ee9ff` accent/sky light,
`#b5dfff` key light, `#edf6ff` text, `#05060c` ground. The only exceptions are the five brand badge
colours and a `#6d56ff` indigo rim light.

The reference palette that reads as premium uses **warm/cool opposition** — cool grey accents
(`#e8eaef → #bcc0ca`) against a warm peach highlight (`#ffa582`) and a cool blue glow (`#5e80f066`).

**Recommendation: introduce exactly one restrained warm accent** for CTA glow and card edge
highlights. It costs nothing, and it is the single change most likely to lift the whole composition
out of "technical demo" and into "product hero". The existing indigo rim light already hints that the
scene wants a second axis.

### 1.5 This plan contradicts a locked v1 constraint and needs a formal amendment

Both existing plan docs explicitly forbid what this plan builds:

- `PLAN.md:290` — *"This is a single, pure visual hero canvas; v1 has no copy, CTA, legend, clickable
  logo behavior, scroll narrative, audio, or user-controlled camera."*
- `PLAN.md:15` — *"...no control/UI overlay in production."*
- `Architectural_PLAN.md:250` — *"The hero is visual-only: no headline, CTA, legend, click targets,
  drag controls, or platform detail panels are included in v1."*

Counterweight, from this repo's own research: `SYLVA_ARCHITECTURE_FINDINGS.md:111–126` already
studied precisely this pattern and recommends it — *"a strong pattern for a mixed HTML/WebGL hero...
the same idea could pin the brain to a headline, an information panel, or a scroll-defined focal
landmark."* And `:655–684` proposes a `src/ui/` tier that does not yet exist.

**Action: amend `PLAN.md` §Assumptions explicitly before writing code**, so the constraint is
consciously lifted and dated rather than silently violated.

### 1.6 One discipline warning, kept in writing

`webgl-landing-steering` names the exact failure mode this brief risks: *"Pick one dominant lane;
avoid mixing 3–4 heavy effects in the hero."*

The wish list stacks depth haze + drifting light + particles + 3D text entrance + liquid glass nav +
folding cards **on top of an already bloom-heavy centerpiece**. That is six. The brain is the hero;
everything added must measurably serve it or be cut. §5 sets an explicit budget.

---

## 2. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Scroll model | Scrolling page, hero pinned | `overflow: hidden` + `position: fixed` shell must be reworked. `scrollProgress` becomes a shared input. |
| Headline depth | **Real 3D text in the scene** | True occlusion, real bloom, real parallax. Needs an MSDF atlas build step. **Avoids the transparent-canvas risk entirely** — see §2.1. |
| DOM stack | **Vanilla TS + `motion`** *(reversed 2026-08-19)* | No React/Tailwind/JSX. One dependency. Ported components in `src/ui/`. See §1.2. |
| Headline copy | Draft 3–4 behind `?headline=N` | Judge at real size against the real brain before committing. |

### 2.1 Choosing 3D text removed the plan's biggest risk

Worth making explicit, because it is a real dividend. A DOM headline would have required
`alpha: true` + `scene.background = null`, putting premultiplied alpha through a TSL bloom graph
whose `outputNode` is `sceneColor.add(bloomNode)` — an unverified interaction, and the item that
would most likely have cost a day.

Because the headline is geometry instead, **the canvas stays opaque (`alpha: false`)** and that risk
disappears. The reason is structural, and worth knowing in general: a DOM element cannot be
*partially* occluded by canvas contents. The canvas is one element at one stacking tier — DOM is
either entirely in front of it or entirely behind it. Per-fragment depth interleaving between DOM and
3D does not exist. Real depth requires the text to be in the scene.

---

## 3. Foundation work (must land before any visual work)

### 3.1 The layout contract — `compositionSpec.ts` grows up

`src/scene/compositionSpec.ts` is currently 8 lines: a layout union, a tuple type, and
`COMPOSITION_SAFE_FRAME = { x: 0.78, y: 0.78 }`. It is the natural and near-empty home for a real
shared contract.

**The problem, measured.** `CameraRig.fit()` solves camera Z so every support point — brain bounds
∪ 128 orbit samples × 2 corners per badge — lands inside the safe frame. At 16:9 with the shipped
config:

```
cluster extent (wide): x=±3.22  y=±3.27   brain height 2.55
as shipped   camZ=11.47  viewH=8.81   brain=29.0% of height   cluster=74.3%
```

**Only 11% of viewport height is free at top and bottom.** A nav needs ~6%; a subhead + CTA block
needs ~20%. There is no room.

**The wrong lever** is shrinking the safe frame — it pulls the camera back and shrinks the brain
without tightening the cluster, because the cluster/brain ratio is fixed:

```
safeY=0.66  camZ=13.46  brain=24.7%
safeY=0.58  camZ=15.24  brain=21.8%
safeY=0.50  camZ=17.59  brain=18.9%
safeY=0.42  camZ=20.83  brain=15.9%   ← brain is now a detail, not a hero
```

**The right lever** is tightening the badge orbits, which lets the camera come *in*:

```
orbit ×1.00 @ safeY=0.72  camZ=12.38  brain=26.8%
orbit ×0.85 @ safeY=0.72  camZ=10.61  brain=31.3%   ← recommended
orbit ×0.72 @ safeY=0.72  camZ= 9.07  brain=36.6%
orbit ×0.62 @ safeY=0.72  camZ= 7.89  brain=42.1%
```

**Recommendation: orbit ×0.85, `safeY` 0.72.** The brain grows from 29% → 31% of viewport height
*and* 14% bands open up top and bottom. The fix improves the centerpiece rather than compromising it.

Do not push past ×0.72 without checking clearance: orbit `radiusX` 2.65 × 0.72 = 1.91, minus
`BADGE_ACTOR_RADIUS` 0.42 puts a badge edge at 1.49 against a brain half-width of roughly 1.15.
`BadgeSystem.validateOrbitSafety()` already computes `minimumBrainClearance` — let it arbitrate.

**Deliverable.** Extend `compositionSpec.ts` to a per-layout `HeroLayoutSpec`: the stage rect the 3D
cluster is fit into (with a vertical offset, which the symmetric safe frame cannot express), plus
named DOM bands — `navBand`, `headlineBand`, `supportBand`, `cardGutters`. `CameraRig.fit()` consumes
the stage rect. The *same* constants are emitted as CSS custom properties, so 3D framing and DOM
layout cannot drift. `DebugPanel.ts:155–160` already demonstrates the NDC→CSS bridge pattern:

```ts
this.safeFrameElement.style.setProperty('--safe-frame-width', `${COMPOSITION_SAFE_FRAME.x * 100}%`);
```

Note that DOM bands are permitted to **overlap** the stage — the nav floats over the composition on
glass, which is the point of glass. What must be guaranteed is legibility, not separation.

**Reuse the existing validation machinery for it.** `validateOrbitSafety()` already samples the
orbit period and asserts brain clearance, badge clearance, and distribution safety. Extend it to
assert that **no badge ever enters a DOM keep-out rect** (nav pill, CTA row, card bodies). That turns
a subjective design worry into an automated invariant, in exactly the idiom this codebase already
uses. `BadgeScreenDebugSnapshot` already carries `insideSafeFrame` and `depthRole`.

### 3.2 The screen bridge — one writer, per frame

`SceneController.renderCurrentState()` (`SceneController.ts:541–554`) is the single per-frame
integration point, after `composition.update()` and `cameraRig.update()`, before
`hdrPipeline.render()`. A `ScreenAnchorBridge` publishes CSS custom properties there.

**Do not add a second `requestAnimationFrame`.** Both `main.ts` and
`SYLVA_ARCHITECTURE_FINDINGS.md:92` insist on one loop: *"This avoids separate clocks drifting out of
sync."* This is also why `gsap`/Lenis must never own the ticker — `gsap.ticker.add(...)` plus
`lagSmoothing(0)` takes page rAF ownership away from the renderer.

Published per frame:

- `--brain-x`, `--brain-y`, `--brain-radius` — projected screen-space centre and radius
- `--pointer-x`, `--pointer-y`, `--pointer-strength` — DOM parallax, matching the 3D parallax
- `--intro-progress`, `--scroll-progress` — DOM choreography inputs
- per-badge screen position, for card tethers and callouts

The projection routine already exists: `getBadgeScreenSnapshots()` (`SceneController.ts:556`)
projects every badge to NDC and classifies `depthRole: 'front' | 'behind'`, `insideViewport`,
`insideSafeFrame`. World-position accessors are already public and allocation-free
(`getBadgeActorWorldPosition(id, target?)`, `getBadgeSocketWorldPosition(id, target?)`,
`BrainSystem.getAnchorWorldPose(id, pos, normal)`). The only missing piece is NDC→CSS-pixel
conversion and the publish hook.

Write only on change, and keep the property set small — each write invalidates style.

The coarse channel stays available for non-per-frame work: `onDiagnostics` already fires ~4×/s with
`introPhase`, `quality`, `compositionLayout`, `runtimePhase`, and is the existing precedent for
"scene state drives DOM" (`main.ts:87`).

### 3.3 Scroll shell rework

`html, body, #app { overflow: hidden }` plus `#app { position: fixed; inset: 0 }` must become a
scrolling document with the canvas pinned. Consequences to handle deliberately:

- `resize` handling and the visibility-pause path both assume a fixed viewport.
- `pointermove` is bound to `#scene-canvas`, so **any DOM overlay covering the canvas kills pointer
  parallax.** Hero wrappers need `pointer-events: none`, re-enabled only on nav, CTAs, and cards.
- Add an `IntersectionObserver` pause when the hero scrolls out, alongside the existing
  `visibilitychange` pause.
- `scrollProgress` joins `SceneState` as a shared input, consumed by camera, choreography, and
  particles — never owned by any of them.

### 3.4 Fonts

**Inter is declared in `styles.css:5` but never loaded** — no `@font-face`, no preconnect. It
silently falls back to `system-ui` today. This must be fixed before hero typography is judged, and
the MSDF atlas needs a real font binary as input regardless.

---

## 4. The hero, part by part

### 4.1 Headline — MSDF text in the scene

**Feasibility is verified, not assumed.** Checked directly against the installed
`three@0.185.1` build rather than docs: `fwidth`, `dFdx`, `dFdy`, `smoothstep`, `texture`, and `uv`
are all real TSL exports. MSDF antialiasing needs screen-space derivatives, and `fwidth` is present
— so a hand-rolled MSDF `NodeMaterial` is viable on this stack.

This matters because the usual library route is closed: `troika-three-text` patches GLSL via
`createDerivedMaterial`, and raw GLSL / `ShaderMaterial` / `onBeforeCompile` are all unsupported
under `WebGPURenderer`.

`TextGeometry` + `FontLoader` ship in addons and remain the fallback: true extruded geometry, any
`NodeMaterial`, no atlas, no custom shader. For ~20 glyphs the tessellation cost is acceptable. Worth
prototyping first precisely *because* it is cheap — if it holds up at hero scale, it saves the whole
atlas pipeline.

**Sizing has a strict one-way dependency that is easy to get backwards.** The headline sits behind
the brain (z ≈ −2), so it must be *wider* in world units to fill the same screen width. But if it is
added to `getSupportPoints()`, `CameraRig.fit()` will pull the camera back to contain it and wreck
the framing. So: **`fit()` resolves the camera first; then the headline is scaled from the resulting
frustum half-width at its own z.** Never the reverse. The headline is a consumer of the camera fit,
not an input to it.

**Bloom interaction needs care.** The threshold is scene-referred against fixed exposure 0.9. Adding
large bright geometry shifts what crosses it, and `threejs-bloom`'s gate is explicit: verify the
beauty path with bloom disabled and preserve a readable silhouette. A huge headline behind a
bloom-bleeding brain is exactly where that fails. Decide deliberately whether the type sits above or
below threshold; do not discover it.

**Arrangement.** Two lines with the brain nested in the leading, so both lines stay legible while the
brain occupies the optical centre. Behind a `?headline=N` switch for judging at real size.

**Per-glyph entrance.** One merged `BufferGeometry` with a per-vertex glyph-index attribute, animated
analytically in TSL from the shared time uniform — no per-glyph CPU work, and it stays inside the
one-clock contract. `threejs-procedural-motion-systems` owns seekable transform timelines if the
entrance needs scrubbing.

### 4.2 Nav — liquid glass

**This is hand-built.** Canvas UI cannot supply it (§1.1), and no installed skill covers it —
confirmed against `threejs-choose-skills`, whose explicit-gaps table routes "DOM UI and
accessibility" to the application layer. Nothing in the 67-skill set owns a navbar.

The whole treatment hinged on one question — **does `backdrop-filter` actually sample the pixels of
the accelerated canvas behind it?** **It does. This is now measured, not assumed.**

#### The measurement

Playwright drove a hard-striped WebGL2/WebGPU field (5px black/white bars, so any blur is
unmistakable) under translucent `rgba(255,255,255,.08)` pills, and the screenshots were scored by mean
absolute horizontal neighbour delta in the green channel. The scale calibrates itself: bare field
reads **50.4**, and a pill with *no* `backdrop-filter` reads **46.4** — exactly `50.4 × 0.92`, the 8%
white veil over still-sharp stripes. So **≈46 means not blurring, ≈0 means blurring.**

| Case | Result | Verdict |
|---|---|---|
| Chromium, **WebGPU** canvas | **0.1** vs 50.4 control | **Works** — and cleaner than WebGL |
| Chromium, WebGL2 canvas | 1.3 – 3.2 | Works |
| Chromium, over plain DOM | 0.1 – 3.4 | Works — canvas is not a special case |
| **Real Safari 26.5.2**, `blur()` | **0** vs 25.5 control (2× DPR) | **Works** |
| Real Chrome 151, `backdrop-filter: url(#svgblur)` | 0.2 | Works |
| Real Safari 26.5.2, `backdrop-filter: url(#…)` | 24 vs 25.5 | **Fails** — falls back to no filter |
| `#app { isolation: isolate }`, the project's own CSS | **0** | **Does not break it** |
| Nested inside a second `isolation: isolate` | **0** | Does not break it |
| Ancestor `will-change`, `translateZ(0)`, own `transform` | 2.5 – 5.2 | All fine |
| Ancestor **`opacity: .99`** | **46** | **Breaks it** — the one real trap |
| Playwright's bundled WebKit | 45.6 | False negative; real Safari works |
| Real Firefox 153 | 46.6 over canvas, **46.8 over plain DOM** | Inconclusive — see below |

Four consequences:

- **The nav can be genuinely translucent over the brain**, on Chromium and Safari, with the WebGPU
  canvas specifically confirmed — which is the renderer this project actually uses.
- **`opacity` below 1 on any ancestor kills it** while `transform` and `will-change` do not. That is
  the trap to write down, because an opacity fade-in on a nav wrapper is the most natural thing in the
  world to reach for. Fade the nav's *own* background and border colours, or animate a child; never
  put `opacity` on an ancestor of the glass.
- **Firefox is not established.** It failed equally over canvas *and* over plain DOM, which indicts
  the harness or a pref rather than any canvas-specific limit — a genuine canvas-only failure would
  have blurred the DOM case. Re-test in real Firefox before concluding anything.
- **SVG filter refraction is Chrome-only.** `backdrop-filter: url()` parses everywhere
  (`CSS.supports` says true in all three) but only *renders* in Chrome. Never feature-detect this one
  with `CSS.supports`.

#### Cost: negligible

Measured on an M1 under deliberate GPU load, comparing no glass / pill-sized glass / full-screen glass
/ SVG glass:

| GPU load | none | pill | full-screen | svg |
|---|---|---|---|---|
| light (60fps ceiling) | 16.7ms p50 | 16.7ms | 16.7ms | 16.7ms |
| heavy | 48.1ms p50 · 23.5fps | 48.9ms · 22.6fps | 49.8ms · 21.5fps | 49.4ms · 22.7fps |

At 60fps it is free. Under heavy load a pill-sized blur costs **0.9fps** and even a full-screen blur
costs 2fps. Blur radius is irrelevant — 40px and 12px measure identically.

**This corrects an earlier claim in this plan.** I had written that a large `backdrop-filter`
repainting every frame against a moving 3D scene would be "the most expensive thing in the entire DOM
layer." That was wrong: it is roughly 1.6% of frame time. Cost is not the constraint here — legibility
is.

#### The technique ladder

Still a ladder, but now with the rungs' fates known rather than guessed. Ship the highest rung that
survives in every browser you care about, and let the rungs below it be the fallback:

| | Technique | Status |
|---|---|---|
| **A** | `backdrop-filter: blur(16px) saturate(180%)` + inner/outer specular borders | **Ship this.** Measured working in Chromium (incl. WebGPU) and real Safari, at negligible cost. |
| **B** | `backdrop-filter: url(#liquid)` — SVG `feTurbulence` + `feDisplacementMap` | Chrome-only. Optional flourish behind a *render* test, never a `CSS.supports` test. |
| **C** | No `backdrop-filter` — layered gradient ground + specular borders | The floor. Still design from here up, for Firefox and for `prefers-reduced-transparency`. |
| **D** | Specimen A inside `transform: translateZ(0)` | Safe (3.8). The real hazard is `opacity`, not `transform`. |
| **E** | Sticky specimen A, scrolled | Cheap per the table above. Check visually for banding or a frozen backdrop. |

`glass-probe.html` is still worth five minutes, but its job has shrunk: **confirm real Firefox, and
judge how the thing actually looks.** The core feasibility question is settled.

If real refraction becomes desirable later, the surveyed prior art is `samasante/liquid-glass` (481★,
active, MIT, zero-dependency) and `deepika-builds/liquid-glass` (247★, single file). Both claim
cross-browser refraction via SVG displacement — treat that claim sceptically given the Safari result
above, unless they apply `filter: url()` to a duplicated child rather than `backdrop-filter: url()` to
the pill, which is the one route that would actually work everywhere.

**Legibility is the real risk, not fidelity.** Translucent chrome over a moving, glowing,
high-contrast scene is exactly where contrast fails intermittently — it passes when the brain drifts
left and fails when a bright badge orbits behind the nav. Two mitigations, both cheap: give the pill a
minimum opaque floor so contrast never depends on what is behind it, and reuse the §3.1 keep-out
validation so badges are *provably* never behind the nav in the first place. Both of these matter more
than the material choice, since cost turned out not to be a constraint.

Two accessibility caveats from the same measurement run. `prefers-reduced-transparency` is honoured
only by Chrome (118+); **Safari does not implement it at all**, and Firefox has it behind a
default-off pref (`layout.css.prefers-reduced-transparency.enabled`). So the query is worth respecting
but cannot be relied on — the opaque contrast floor has to be the actual guarantee. And Chrome 151
reports `-webkit-backdrop-filter` as *unsupported*: write the unprefixed property, with the prefixed
form only as an additional declaration for older Safari, never alone.

The specular detail — hairline top highlight, warm glow rising from the bottom edge, cool glow from
the left, hover deepening offset *and* blur radius together — comes from the Layers CTA recipe
(§1.3), driven by one spring into one CSS variable with `calc()` fan-out.

### 4.3 Subheading and CTAs

DOM. Entrance sequenced off `CHOREOGRAPHY_TIMELINE` (§4.7). CTA treatment from the Layers inset-glow
recipe (§1.3) plus the one warm accent (§1.4). `animation-systems` supplies the duration bands
(micro 120–200ms, section entrance 400–800ms, hero 800–1600ms) and stagger (40–90ms).

### 4.4 Folding cards

DOM, CSS 3D transforms, one spring per card driving one `--lift` variable with `calc()` fan-out.
Nothing in the installed skill set owns folding cards; `animation-systems`' one paragraph on
morph/shared-element is the entire available guidance.

Reveal on scroll via `animation-on-scroll` — IntersectionObserver + `animation-play-state`, ~40 lines
of vanilla JS, zero dependencies. It names the pitfall to avoid: elements already in view before the
observer initialises never run.

### 4.5 Atmosphere and particles — in-scene, not a second canvas

**Particles go in the existing scene as a new group in `CompositionScaffold`.** This is the single
most important architectural call in this section, and the reasoning is worth keeping:

A Canvas-2D or DOM particle layer gets no bloom, no depth against the brain, no shared exposure, and
runs a second rAF loop. `pointer-trail-emitter` states it from experience: *"Nothing inside the WebGL
canvas can rise above the page — the canvas is one element at its own stacking tier... The port costs
the post chain: the motes come out as hard points with no bloom, and a wider fainter second copy is
not the same thing."*

So `ambient-section-particles` and `background-grid-webgl` are **the wrong recipes** despite their
names — the first is Canvas-2D-and-DOM-overlay by construction, the second wants to own a camera and
would fight `CameraRig`. Both have harvestable ideas (density scaled by container *area* then
clamped; DPR caps; large-`dt` clamping after tab restore; distance-faded line opacity) but neither
should be followed.

Use the analytic branch only: **immutable spawn records + shared time uniform + motion evaluated in
vertex TSL.** No compute pass, no storage buffers, no compaction. This is also exactly the pattern
`SYLVA_ARCHITECTURE_FINDINGS.md:510` documents from the reference.

Depth-layer it: far dust (slow parallax), mid motes, near sparks. Quality-tiered counts belong in
`qualityProfiles.ts` alongside the existing `connectionSamples` / `packetsPerLink` knobs.

Depth haze via `SkyMesh` + TSL fog — the authored branch, not planetary scattering. Read
`threejs-image-pipeline` **before** editing `HdrRenderPipeline.ts`: it owns compose order and flags
two traps — named `PassNode` attachments clone pass output by default in r185, and rebuilding the
pass is required to reclaim an attachment previously requested via `getTextureNode()`, which this
code already calls.

Consider the CSS drifting-gradient backdrop (§1.3) *instead of* some of this. It costs zero GPU and
may do most of the atmospheric work.

### 4.6 Physics — not needed for v1

The brief mentioned wanting "physics related stuff". Verified: in Fancy Components, physics means
**`matter-js`** in exactly two components (`gravity`, `cursor-attractor-and-gravity`), each pulling
`poly-decomp` for concave body decomposition and `svg-path-commander` to convert SVG paths into
bodies. They are the two largest non-carousel components in the library (510 and 496 LOC). Note that
`elastic-line` sits in their Physics category but is not a physics engine at all — it is a spring on
an SVG control point.

**Recommendation: no physics engine in v1.** Everything the hero actually needs — cards that settle,
magnetic CTA hover, nav pill motion — is spring motion, not rigid-body simulation. One spring per CSS
variable with `calc()` fan-out (§1.3) covers all of it, and `motion`'s vanilla API supplies the same
spring engine the reference sites use.

A real engine is justified only for behaviour springs genuinely cannot express: cards that can be
thrown and **collide with each other**, or letters that fall and pile up. Those are fun, and they are
also a separate feature with its own rAF loop, its own canvas, and its own budget line. If wanted,
scope it as its own phase after the hero is complete — not folded into it.

### 4.7 Motion system — one clock

`CHOREOGRAPHY_TIMELINE` is already declared the single authoritative schedule: *"All visual systems
sample these seconds directly; none advances an independent phase clock."* Current beats:
`brainScan 0→1.25`, `badgeArrival 0.85→2.05`, `linkActivation 1.55→2.85`, `ambientStart 2.85`.

**DOM entrances extend this timeline; they do not run CSS `animation-delay` beside it.** That keeps
the whole hero replayable through the existing `replayIntro()` / `setIntroPhase()` controls, which is
worth far more than it costs.

Choreography order, from the reference and confirmed by `animation-systems`: background/media first,
headline lines second, supporting copy third, CTA last.

Reduced motion extends the existing `reduced-motion` quality tier rather than introducing a parallel
mechanism. It already sets `continuousAnimation: false` and starts at the ambient checkpoint.

---

## 5. Effect budget

Six heavy effects on top of a bloom-heavy centerpiece is the failure mode §1.6 names. Proposed
budget, to be held to:

| Element | Cost | Verdict |
|---|---|---|
| Brain + badges + links + packets | shipped | **The hero.** Everything else serves it. |
| MSDF headline in scene | 1 draw, in existing pass | **Keep** — it is the concept. |
| Particle field, analytic TSL | 1 draw, GPU-side | **Keep** — depth-layered, quality-tiered. |
| Depth haze | node in existing output | **Keep if measurable**, else CSS gradient. |
| CSS drifting gradient | zero GPU | **Keep** — cheapest atmosphere available. |
| Glass nav | **measured: 0.9fps under load** | **Keep.** Cost is a non-issue (§4.2); legibility is the constraint. |
| Folding cards | CSS 3D + one spring | **Keep**, DOM only. |
| Canvas UI effect | **second WebGL2 context** | **Cut from v1.** Optional enhancement later, one effect max. |
| `matter-js` physics | second rAF loop + canvas | **Cut from v1** (§4.6). Springs cover the need. |
| Cursor trail | second system | **Cut.** Not in the brief. |
| Background grid | wants own camera | **Cut.** Not in the brief. |

---

## 6. Skills to load, in order

At implementation time, not now:

1. `threejs-image-pipeline` — **before** touching `HdrRenderPipeline.ts`. Compose order, attachment
   admission, resize/DPR, disposal.
2. `threejs-particles-trails-and-effects` — analytic/immutable-spawn branch only.
3. `animation-systems` — motion tokens and choreography. 187 lines, no waste.
4. `threejs-sky-atmosphere-and-haze` — §1 and the authored branch only. Skip the planetary
   radiometry; there is no sun, planet, or horizon here.
5. `animation-on-scroll` — scroll reveals, zero dependencies.
6. `threejs-bloom` — when the headline or particles start blowing out the glare, or on adding a
   resize/mobile tier (minimum-mip constraint).

Read once and harvest, do not follow: `webgl-landing-steering` (lane discipline),
`cinematic-gsap-lenis-motion-system` (best content, unusable GSAP dependency — take `splitWords`/
`splitLines`, the CSS mask foundation and FOUC guard, the token table, the QA checklist),
`pointer-trail-emitter` (the screen-anchoring and z-order sections), `atmosphere-background` (palette
brief only — ignore its layering model).

Wrong fit despite the name: `beam-glow-states` (React + npm package), `beautiful-shadows` (Tailwind
strings, and explicitly forbids the coloured glow this hero wants), `ambient-section-particles`
(Canvas 2D + DOM overlay), `background-grid-webgl` (second camera writer), plain `threejs` (WebGL-era
advice that contradicts the WebGPU/TSL family).

If scroll should drive the camera rather than only reveal DOM, `build-threejs-scroll-worlds` is the
right owner.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MSDF atlas + TSL material is new code on a stack with no library path | High | TSL derivatives verified present. Prototype `TextGeometry` first — if it holds at hero scale, the atlas is unnecessary. |
| Headline sizing fed into `fit()` instead of derived from it | High | One-way dependency documented in §4.1. Assert camera Z is unchanged by headline presence. |
| Scroll shell rework destabilises resize / pause / parallax | Medium | Land §3.3 alone, verify all four quality tiers, then build on it. |
| Bloom threshold shifts when bright geometry is added | Medium | Verify beauty path with bloom off at every step. |
| Tightened orbits collide with the brain | Medium | `validateOrbitSafety()` arbitrates; do not exceed ×0.72. |
| DOM overlay silently kills pointer parallax | Medium | `pointer-events: none` on wrappers by default; assert parallax in the debug panel. |
| An `opacity` fade-in on a nav ancestor silently kills the glass | Medium | Measured (§4.2): ancestor `opacity: .99` → no blur, while `transform` is fine. Fade the pill's own colours, not an ancestor. |
| Firefox glass behaviour unverified | Medium | Design floor-up from specimen C so Firefox degrades to a solid pill. Confirm in real Firefox; `CSS.supports` is not a valid test. |
| `verbatimModuleSyntax` + `tsc --noEmit` in `build` | Low | Every type import must be `import type`, or the build fails. |
| Effect creep past the §5 budget | Medium | Budget table is the gate. |

---

## 8. Phase gates

Matching the existing `PLAN.md` idiom: each phase ends in a state that can be verified by hand, and
every new subsystem gets a `DebugPanel` toggle and a `getDebugSnapshot()` extension. The established
four-step pattern is: add a method to `SceneController` → forward through `CompositionScaffold` → add
a callback to `DebugPanelActions` → add a `data-debug-*` input and wiring block.

- **Phase 9 — Amendment and layout contract.** Amend `PLAN.md` §Assumptions. Grow
  `compositionSpec.ts` into `HeroLayoutSpec`. Retune orbits to ×0.85 / `safeY` 0.72. Extend
  `validateOrbitSafety()` with DOM keep-out rects. Load Inter properly. *Gate: framing is correct
  and validated with no DOM present.*
- **Phase 10 — Screen bridge and scroll shell.** `ScreenAnchorBridge` publishing from
  `renderCurrentState()`. Scroll document with pinned canvas, `scrollProgress` in `SceneState`,
  IntersectionObserver pause. *Gate: all four quality tiers survive scroll and resize; pointer
  parallax still works.*
- **Phase 11 — Headline in depth.** `TextGeometry` prototype, then MSDF if needed. Sized from the
  resolved frustum. Per-glyph TSL entrance on the shared timeline. *Gate: real occlusion by the
  brain; readable with bloom disabled; camera Z unchanged by its presence.*
- **Phase 12 — DOM hero content.** Nav, subhead, CTAs, cards. One spring per CSS variable with
  `calc()` fan-out. Entrances on the extended timeline. Nav on specimen A, designed floor-up from C
  (§4.2), and **no `opacity` on any ancestor of the glass**. *Gate: `replayIntro()` replays the entire
  hero, DOM included; nav contrast holds with the brightest badge behind the nav.*
- **Phase 13 — Atmosphere.** Particle group, depth haze or CSS gradient. Quality-tiered.
  *Gate: frame budget held on every tier; §5 budget respected.*
- **Phase 14 — Polish and validation.** Warm accent. Reduced-motion pass. Visual capture coverage.
  Extends the not-yet-started Phase 8 release validation.

---

## Appendix — verified reference values

Measured or read from source during planning, so they need not be rediscovered.

**Framing** — FOV 42° vertical, `MIN_CAMERA_DISTANCE` 5, `FIT_PADDING_WORLD_UNITS` 0.55, pointer
offset max `(0.16, 0.10)` position / `(0.018, 0.012)` target, damping `1 - exp(-7.5·dt)`.
Brain height 2.55. `BADGE_ACTOR_RADIUS` 0.42. Wide orbits `radiusX` 2.45–2.80, `radiusY` 2.75–2.85;
compact `radiusX` 1.72–1.82, `radiusY` 3.20–3.26. Layout flips to `compact` at width ≤ 767 or
aspect < 0.85.

**Palette** — ground `#05060c`; text `#edf6ff`; accent `#8ee9ff`; wires and network `#58bfe8`; wire
highlight `#d9fbff`; ghost wires `#6f8fd4`→`#b7efff`; lights sky `#8ee9ff` / key `#b5dfff` / rim
`#6d56ff` / ground `#02030a`; brain shell `#060b15` base, `#102d43` scan-lit. Badge accents:
Instagram `#ff4ecb`, Facebook `#4c8dff`, Shopify `#95d85b`, Slack `#b278ff`, WhatsApp `#25d366`.

**Pipeline** — one `pass(scene, camera)`, `outputNode = sceneColor.add(bloomNode)`, fixed exposure
0.9, Neutral tone mapping → sRGB, `outputConversions: 1`, `temporalAA: false`. Desktop bloom
strength 0.36 / radius 0.22 / threshold 0.38 / resolutionScale 0.35, `dprCap` 1.75.

**Constraints** — `WebGPURenderer` with `alpha: false`; all materials are `*NodeMaterial`; raw GLSL,
`ShaderMaterial`, and `onBeforeCompile` unsupported; no `EffectComposer`; `verbatimModuleSyntax: true`;
`build` runs `tsc --noEmit` first.

**Glass** (§4.2, measured on M1 / Chrome 151 / Safari 26.5.2 / Firefox 153) — `backdrop-filter`
samples WebGPU canvas pixels in Chromium (0.1 vs 50.4 control) and real Safari (0 vs 25.5 @2×).
`isolation: isolate` safe; ancestor `transform` / `will-change` safe; **ancestor `opacity < 1`
breaks it**. `backdrop-filter: url()` renders in Chrome only, though `CSS.supports` reports true
everywhere. Chrome 151 reports `-webkit-backdrop-filter` unsupported. Cost under heavy GPU load:
pill 22.6fps vs 23.5fps baseline, full-screen 21.5fps; blur radius irrelevant.
`prefers-reduced-transparency`: Chrome 118+, Firefox behind a default-off pref, Safari never.
Playwright's bundled WebKit gives a false negative — do not trust it for this.
