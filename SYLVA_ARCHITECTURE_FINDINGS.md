
# Sylva Three.js Architecture Findings

## Scope

This report analyzes [MengTo/sylva](https://github.com/MengTo/sylva) as an implementation reference for a procedural Three.js scene, especially the way its 3D forms, shaders, instancing, pointer interaction, and wireframe scan layer are assembled.

The visual design is intentionally out of scope. The goal is to understand the underlying technical architecture and identify patterns that can be adapted to the brain-animation project.

Primary references:

- [Sylva repository](https://github.com/MengTo/sylva)
- [Sylva README](https://github.com/MengTo/sylva/blob/main/README.md)
- [Sylva source: index.html](https://github.com/MengTo/sylva/blob/main/index.html)

## Executive summary

Sylva is not fundamentally a model-viewer scene and its wireframe look is not produced by simply setting material.wireframe = true.

It is a procedural Three.js/WebGL2 experience in which:

1. Catmull-Rom centerlines define the root and arch forms.
2. Each centerline is swept into a custom surface grid using transported tangent/normal frames.
3. The same surface data produces both the solid bark/moss mesh and a sparse wireframe cage.
4. Repeated details such as moss blades, ferns, and flowers are rendered through instancing.
5. Custom ShaderMaterial programs handle lighting, noise, wind, cursor interaction, scan masking, haze, and procedural surface detail.
6. A single animation loop updates the HTML/CSS interface and the WebGL scene.
7. The wireframe is a temporary scan layer driven by shared uniforms, then removed and disposed when the scan finishes.

The most reusable pattern for the brain scene is:

~~~text
authoritative brain geometry
          │
          ├── solid anatomical surface
          ├── sparse topology-derived wire layer
          ├── signal/pathway layer
          └── particle / filament layer

shared uniforms:
  time, pointer, scroll, scan origin, scan radius,
  scan strength, active region, reduced-motion state
~~~

## Repository-level architecture

The project is deliberately compact:

- The complete page lives in one index.html file.
- Three.js r149 is vendored locally in sylva-assets/three.min.js.
- There is no install step or build step.
- Runtime assets are local.
- The README states that the page makes no external network request after loading.
- The HTML/CSS owns the surrounding editorial layout.
- One main WebGL canvas owns the procedural landscape.
- The two liquid-metal controls are isolated in local sandboxed iframes so they can own their own WebGL2 state.

This is useful for understanding the scene, but it is not the ideal file organization for a larger production application. The implementation is logically layered inside the monolithic file rather than physically separated into modules.

## High-level runtime flow

~~~text
HTML/CSS layout
      │
      ├── pointer state for CSS parallax
      ├── navigation / cards / intro transitions
      │
      └── one requestAnimationFrame loop
                │
                ├── UI motion
                ├── CSS parallax
                ├── camera motion
                ├── cursor raycast
                ├── shared shader uniform updates
                ├── scan progression
                ├── particle updates
                └── renderer.render(scene, camera)

procedural limb definitions
      │
      ├── Catmull-Rom centerline
      ├── transported frames
      ├── variable radius / moss functions
      ├── tessellated surface grid
      │
      ├── solid bark/moss BufferGeometry
      ├── instanced moss blades
      ├── instanced ferns / flowers
      └── LineSegments wireframe scan
~~~

The page starts the main animation loop with startTick(). The loop handles both DOM/UI animation and the Three.js render path. This avoids separate clocks drifting out of sync.

The procedural build itself is deferred by two animation frames. That gives the browser time to start the HTML intro transition before the expensive geometry construction and shader compilation begin.

## Scene boot and renderer setup

The scene initializes with a transparent WebGL renderer, capped device pixel ratio, ACES filmic tone mapping, a perspective camera, and a large camera distance.

The important setup choices are:

- The canvas is transparent so the CSS background remains visible behind the scene.
- Device pixel ratio is capped to prevent high-density displays from multiplying the render cost.
- Antialiasing is disabled on smaller configurations.
- ACES tone mapping is used for HDR-like shader values.
- A large camera distance is used with a carefully recalculated field of view.
- The scene is composed against a layout stage rather than treated as an isolated centered model.

## Stage-space composition and responsive layout

Sylva uses a 1600 × 880 reference stage. CSS positions the HTML composition in that coordinate system, and layout() positions the Three.js groups against the same stage.

The layout process:

1. Reads the current hero and stage bounds.
2. Calculates the stage scale factor.
3. Converts stage-space pixel positions into camera/world coordinates.
4. Resizes the renderer.
5. Updates camera aspect and projection.
6. Scales and places the near and far procedural roots against pinned landmarks.
7. Repositions the shadow, glow, scan origin, and particle scale.

This is a strong pattern for a mixed HTML/WebGL hero. The 3D object can remain compositionally attached to text and cards without relying on hard-coded browser viewport coordinates.

For the brain scene, the same idea could pin the brain to a headline, an information panel, or a scroll-defined focal landmark.

## Deterministic procedural generation

Sylva uses a seeded random generator instead of Math.random() for the main procedural landscape. This means the same root, offshoots, moss distribution, ferns, and flowers are generated on every load.

It also uses CPU-side hash/value/fBm-style noise for construction decisions and GPU-side gradient noise/fBm for surface shading.

The distinction is important:

~~~text
CPU noise:
  determines where geometry and instances are created

GPU noise:
  determines how already-created geometry is shaded and animated
~~~

This keeps the generated composition stable while allowing the material appearance to remain dynamic.

## Procedural limb representation

Each root section is represented by a limb object. A limb is defined by:

- a centerline curve;
- a number of samples along the curve;
- a number of radial samples around each cross-section;
- a radius function;
- a moss-volume function;
- optional taper, sink, and blade-size behavior;
- precomputed local frames;
- total curve length.

The core geometry is not built using THREE.TubeGeometry. Instead, Sylva explicitly samples and constructs the surface. This provides direct access to the grid used later by the wireframe and moss placement systems.

## Transported frames and swept surface

For each curve sample, Sylva computes:

- a point on the curve;
- a tangent;
- a normal-like frame vector;
- a binormal.

The frame is propagated along the curve using a transport-like method. This avoids sudden twisting and gives each cross-section a stable local coordinate system.

At a given curve position t and radial angle theta, the surface point is calculated approximately as:

~~~text
centerline position
  + cross-section normal * radius
  + cross-section normal * moss displacement
~~~

The final displacement depends on:

- surface orientation;
- local steepness;
- several noise fields;
- moss coverage;
- local radius;
- lumpiness of the moss cushion.

This is the causal chain that makes the moss appear volumetric rather than like a flat green stripe.

## Surface tessellation

The tessellate() function constructs a grid with dimensions:

~~~text
(segments + 1) × (radialSamples + 1)
~~~

For every grid vertex it stores:

- position;
- normal;
- custom inf data;
- moss coverage/cap information in temporary arrays.

The index buffer connects neighboring grid cells into triangles.

Normals are derived from the actual displaced grid rather than from the idealized tube. That means the shader receives normals that follow the raised, lumpy moss surface.

The custom inf attribute carries information needed by the bark/moss shader, including cross-section position and moss-cap coverage.

The final solid mesh is a regular THREE.Mesh backed by THREE.BufferGeometry, but the geometry itself is authored procedurally.

## Bark and moss material architecture

The solid root uses a custom ShaderMaterial.

The shader combines:

- procedural bark grain;
- cracks and ridges;
- wood/moss material blending;
- contact shadow where moss meets bark;
- custom lighting;
- specular response;
- haze/aerial perspective;
- scan masking;
- alpha masks for the far root;
- wind deformation.

The vertex shader applies small wind offsets. The fragment shader reconstructs surface detail from procedural noise rather than loading a bark texture.

The source is careful not to use a flat haze mix. It uses surface luminance and height to control aerial perspective, which preserves dark regions while still washing out the distant root.

## Moss blade instancing

Sylva can draw tens or hundreds of thousands of moss blades without creating one mesh per blade.

The base blade is a very small custom InstancedBufferGeometry. Per-instance attributes include:

~~~text
offset  - position on the root surface
nrm     - surface normal
rnd     - yaw, length, lean, tone
aux     - clumping / secondary variation
~~~

The instance count is configured through instanceCount.

The vertex shader reconstructs each blade from those attributes. It handles:

- orientation to the surface normal;
- random yaw;
- blade length;
- lean;
- wind;
- cursor displacement;
- local shading inputs.

This is the core repeated-detail pattern worth reusing for neural filaments, surface fibers, signal markers, or particles on the brain.

## Moss placement is derived from the actual surface

Moss blades are not randomly scattered in a loose bounding box.

Sylva samples the same tessellated shell grid used to render the root. It estimates each grid cell's area and moss coverage, builds a cumulative distribution function, then samples cells in proportion to:

~~~text
surface area × moss coverage²
~~~

Each accepted blade is interpolated from the four corners of the selected cell. Its position and normal therefore match the actual displaced surface.

This avoids a common procedural problem where repeated details float above or sink into the base mesh.

The grid is then released after the blades and wireframe have been built, because it is no longer needed for normal rendering. The temporary geometry data is explicitly cleared to reduce memory use.

## Recursive offshoots

The root silhouette is broken up with short recursive offshoots.

The offshoot builder:

1. Chooses a starting surface point.
2. Builds a local direction using the surface normal, tangent, and an up vector.
3. Creates a short curved branch.
4. Tapers its radius toward the end.
5. Optionally creates one more generation of children.

The recursion is intentionally shallow. The offshoots exist to break the silhouette, not to generate a complete tree or botanical simulation.

This is useful for a brain scene if we want controlled branches or lobes without generating an uncontrolled recursive graph.

## The wireframe implementation

### It is not a generic material wireframe

Sylva does not rely on material.wireframe and does not use a full WireframeGeometry for this effect.

It creates a separate THREE.LineSegments object from selected edges of the already-generated surface grid.

### Edge extraction

The buildWire() function reads the temporary grid from each limb and emits two families of line segments:

1. Ring lines around the cross-section at selected curve samples.
2. Longitudinal lines along selected radial positions.

The result is a sparse structural cage rather than every triangle edge.

Conceptually:

~~~text
surface grid
    │
    ├── every Nth cross-section → ring segments
    └── every Mth radial column → lengthwise segments
~~~

This is especially relevant for a brain wireframe because it allows us to control visual density and avoid a noisy triangle soup.

### Wire material state

The wireframe material uses:

- transparent rendering;
- depthWrite disabled;
- depthTest disabled;
- additive blending;
- a high render order.

The disabled depth test lets the scan cage remain visible through the solid form, making it read as a diagnostic or technical overlay.

### Wire shader

The wire shader receives shared uniforms:

~~~text
uScanO  - world-space scan origin
uScanR  - current scan radius
uWire   - overall wire intensity
uTime   - animated scan detail
~~~

The vertex shader passes world position to the fragment shader.

The fragment shader computes distance from the scan origin and derives a bright rim plus a dimmer trailing cage:

~~~glsl
rim   = exp(-pow((d - uScanR) / width, 2.0));
trail = smoothstep(uScanR, uScanR - trailLength, d);
~~~

A time-based sine pattern creates small scan ticks along the line.

The result is not a static wireframe. It is a world-space field evaluated over static line geometry.

## The solid scan/reveal implementation

The same scan is used by the solid materials through the shared unscanned() GLSL helper.

For each rendered fragment, the shader checks whether its world position is beyond the current scan wavefront. If it is, the fragment is discarded.

The solid form is therefore revealed behind the wireframe:

~~~text
scan front
   │
   ├── bright wireframe cage
   ├── delayed solid bark/moss reveal
   └── trailing fade / scan residue
~~~

The front is intentionally wobbled with low-frequency sine functions, so it is not a perfect circular wipe.

Different visual layers use slightly different lag values. That stops the whole object from appearing as one flat 2D mask.

## Wireframe lifecycle and cleanup

The wireframe is only needed during the scan intro.

When the scan completes, Sylva:

1. Removes each wire mesh from its parent.
2. Disposes the wire geometry.
3. Disposes the wire material.
4. Clears the wireMeshes array.

This is a strong pattern for temporary technical overlays and should be preserved in the brain project if the wireframe is only an entrance or transition state.

## Shared uniform architecture

Sylva creates shared uniform objects once:

~~~text
uTime      - global time
uWind      - wind amount
uMouseNear - near-root cursor point
uMouseFar  - far-root cursor point
uScanO     - scan origin
uScanR     - scan radius
uScanOn    - scan enabled flag
uWire      - wire intensity
~~~

These objects are passed by reference into several materials. Updating one value in the main loop updates every shader that uses it.

This avoids separate animation state for the bark, grass, flowers, ferns, particles, and wireframe.

For the brain scene, this should become a deliberate scene-wide uniform registry rather than individual material-local clocks.

Suggested shape:

~~~js
const shared = {
  time: { value: 0 },
  pointer: { value: new THREE.Vector3() },
  scanOrigin: { value: new THREE.Vector3() },
  scanRadius: { value: 0 },
  scanStrength: { value: 0 },
  scrollProgress: { value: 0 },
  activeRegion: { value: -1 }
};
~~~

## Pointer and cursor interaction

Sylva maintains two related pointer representations:

1. Normalized page coordinates for CSS parallax.
2. Hero-local normalized device coordinates for Three.js raycasting.

The pointer is raycast against a simple plane. It is not raycast against every blade, root surface, or particle.

The resulting hit point is converted into each root group's local coordinate space and written to the near/far mouse uniforms.

The grass shader calculates cursor influence per blade:

~~~text
cursor distance
      │
      ├── smooth influence falloff
      ├── tangential push away from cursor
      └── downward displacement along surface normal
~~~

This means the CPU only updates a small amount of state while the GPU moves the entire moss field.

For the brain project, similar interaction can drive:

- a local wireframe highlight;
- deformation or parting of neural filaments;
- a signal pulse around the pointer;
- region selection;
- labels or annotations;
- an active lobe or pathway.

## Animation loop

The page uses one main requestAnimationFrame loop.

The loop:

1. Calculates frame delta time.
2. Updates dock/UI spring values.
3. Updates specular UI effects.
4. Eases pointer values.
5. Publishes CSS custom properties for parallax.
6. Calls renderFrame() when the WebGL scene is ready.

The WebGL frame then:

1. Advances time.
2. Updates camera position and look-at target.
3. Rotates the root groups slightly from pointer state.
4. Advances the scan radius and wire intensity.
5. Updates cursor world/local positions.
6. Emits cursor spray particles.
7. Updates the butterfly state machine.
8. Renders the scene.

The one-loop design ensures the DOM and WebGL animations share the same timing source.

## Camera behavior

The camera is perspective-based, but the scene is composed almost like a 2.5D stage.

The camera has a large distance and the field of view is recalculated from the viewport height. This makes one world-space unit correspond approximately to one stage pixel at the composition plane.

The pointer shifts the camera position subtly and the camera looks at a point offset from its own position. The roots also receive a small amount of rotation from the pointer.

The result is a restrained parallax effect rather than a free-orbit camera.

For the brain scene, this suggests using a camera rig with:

- a stable presentation camera;
- subtle pointer parallax;
- optional scroll-driven depth movement;
- no unconstrained orbit unless the scene is explicitly a viewer.

## Ambient effects and particles

The scene uses simple planes with radial-gradient canvas textures for:

- a root shadow;
- a floor glow;
- soft light pools.

These are cheaper than a full post-processing stack and are positioned at explicit depths.

Ambient pollen uses THREE.Points with a custom shader. Each particle has a seed attribute, and its motion is calculated in the vertex shader from the shared time uniform.

The cursor spray uses a dynamic BufferGeometry, but even there the CPU only respawns particles and updates their birth/velocity attributes. The flight itself is integrated in the vertex shader.

The general pattern is:

~~~text
static or rarely changed particle attributes
        +
shared time uniform
        +
GPU-side motion
~~~

## Performance choices

Important performance decisions include:

- capped device pixel ratio;
- lower antialiasing and geometry density on small screens;
- different near/far blade counts;
- instanced geometry for repeated details;
- GPU-side animation for blades and ambient particles;
- deterministic sampling from an already-created shell grid;
- GPU-side procedural material detail;
- temporary shell-grid memory released after assembly;
- one shared animation loop;
- no per-blade DOM or mesh objects;
- temporary wireframe geometry disposed after the intro;
- static canvas textures for repeated soft sprites;
- an initial render before waiting for the next animation frame;
- reduced-motion handling.

There are also deliberate tradeoffs:

- Many scene objects have frustumCulled = false, likely because their custom deformation, large layout transforms, or procedural bounds make automatic culling unreliable.
- The procedural build happens synchronously and can occupy the main thread during startup.
- The monolithic source is easy to ship but harder to maintain.
- The scene targets WebGL2 and an older vendored Three.js release rather than a modern module-based build.

## Reduced motion and fallback behavior

Sylva checks prefers-reduced-motion: reduce.

When reduced motion is enabled, it suppresses or reduces:

- pointer-driven parallax;
- wind;
- some animation states;
- scan animation;
- dynamic effects such as cursor spray.

The HTML layout remains available if the main Three.js scene cannot initialize. This is a good resilience pattern for a decorative WebGL scene.

## What is genuinely reusable for the brain animation

### Reusable scene architecture

Use:

- one scene;
- one renderer;
- one presentation camera or camera rig;
- one shared animation loop;
- one shared uniform registry;
- separate scene layers for solid geometry, wireframe, signals, and particles;
- explicit cleanup for temporary effects.

### Reusable wireframe approach

Use the brain's actual topology to create a separate wire layer.

For a procedural brain:

~~~text
procedural surface grid
      ├── solid mesh
      └── selected ring / longitudinal / topology edges
~~~

For an imported brain mesh:

~~~text
indexed mesh topology
      ├── solid mesh
      └── selected unique edges → LineSegments
~~~

The selected edges can be filtered by:

- deterministic sampling;
- anatomical region;
- curvature;
- edge length;
- distance to an active signal;
- scan band;
- lobe or pathway membership.

### Reusable scan material

Keep the wireframe geometry static and drive the scan through uniforms:

~~~glsl
distance(worldPosition, scanOrigin)
~~~

Then use a Gaussian-like rim and a trailing falloff to produce the traveling scan front.

The brain surface can use the same scan function with a slightly delayed threshold.

### Reusable instancing approach

Use instanced attributes for:

- neural particles;
- small surface filaments;
- signal nodes;
- region markers;
- repeated anatomical detail.

Do not create a separate mesh for every repeated element.

### Reusable interaction approach

Convert pointer or scroll input into compact scene-wide state. Let materials and vertex shaders interpret that state.

Avoid updating thousands of objects from JavaScript every frame unless the object count is small or the motion is semantically independent.

## What should not be copied literally

The following parts are specific to Sylva and should not be carried over as architectural requirements:

- root centerline coordinates;
- moss-cap heuristics;
- bark noise domain;
- fern and flower placement;
- pollen behavior;
- butterfly flight state machine;
- editorial 1600 × 880 composition values;
- liquid-metal button iframes;
- the single-file source organization;
- the vendored Three.js r149 runtime.

The project should use a modern module structure and the installed Three.js version for the brain scene unless compatibility constraints require otherwise.

## Recommended brain-scene module structure

The conceptual layers from Sylva should be separated into maintainable modules:

~~~text
src/scene/
  renderer.ts
  camera-rig.ts
  shared-uniforms.ts
  animation-loop.ts
  interaction.ts

src/brain/
  brain-data.ts
  brain-geometry.ts
  brain-surface-material.ts
  brain-wireframe.ts
  brain-regions.ts
  signal-paths.ts

src/effects/
  scan-effect.ts
  neural-particles.ts
  ambient-glow.ts

src/ui/
  scroll-state.ts
  labels.ts
  reduced-motion.ts
~~~

If the brain is an imported asset, brain-data.ts should own loading and topology extraction. If it is procedural, brain-geometry.ts should own the source field, surface sampling, and topology creation.

## Suggested causal pipeline for the brain project

~~~text
brain source representation
        │
        ├── authoritative surface / topology
        │
        ├── solid anatomical material
        │       ├── color / region mask
        │       ├── lighting / depth
        │       └── scan reveal
        │
        ├── wireframe layer
        │       ├── sparse topology edges
        │       ├── scan rim
        │       └── additive technical glow
        │
        ├── signal layer
        │       ├── curves / pathways
        │       ├── animated pulses
        │       └── region activation
        │
        └── particle layer
                ├── instanced nodes
                ├── shader-driven motion
                └── pointer / scroll response
~~~

Shared inputs should be explicit:

~~~text
time
deltaTime
pointerLocal
scrollProgress
scanOrigin
scanRadius
scanStrength
activeRegion
reducedMotion
~~~

Each visual layer should consume those values without becoming the owner of unrelated state.

## Final conclusion

The most important Sylva pattern is not a particular shader or geometry primitive. It is the decision to make one authoritative procedural surface feed multiple render representations:

~~~text
one surface/topology source
        ├── solid appearance
        ├── wireframe diagnostics
        ├── surface-attached instances
        ├── interaction coordinates
        └── scan/reveal masks
~~~

For the brain animation, we should preserve that relationship. The brain geometry should be the source of truth, and the solid brain, wireframe, neural signals, and surface particles should all derive from or reference that same source.

That will make the wireframe feel structurally connected to the brain rather than like a separate decorative overlay.

