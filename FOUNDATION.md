# LRP Foundation Notes

**Project:** LRP — Lighting Render & Post-Processing  
**Purpose:** A lightweight, extensible Blockbench lighting/rendering foundation.

> This file is a development reference, not executable code.
> It records what we currently understand before new systems are implemented.

---

## 1. Development philosophy — DUFP

A feature working once is not enough to call the system finished.

The foundation must be understood, stable, and capable of being extended, modified, and improved without becoming the fundamental obstacle.

### Development loop

```text
UNDERSTAND
    ↓
DESIGN FOUNDATION
    ↓
IMPLEMENT THE SMALLEST TEST
    ↓
TEST
    ↓
TRY TO BREAK IT
    ↓
UNDERSTAND THE FAILURE
    ↓
IMPROVE THE FOUNDATION
    ↓
REPEAT
```

### Core rule

**If the foundation is the reason we cannot improve the product, the product is not finished.**

---

## 2. Plugin loader rules

The loader must stay extremely small.

### Current intended structure

```text
lrp.js
  ↓
Plugin.register('lrp', {...})
  ↓
Blockbench loads plugin
  ↓
onload()
  ↓
Feature modules are initialized only when needed
```

### Important loader principles

- Plugin ID: `lrp`
- Main plugin file: `lrp.js`
- Version must be changed when the plugin implementation changes.
- Do not put rendering experiments directly into the loader.
- Do not install render hooks, camera listeners, animation loops, or heavy resources during basic plugin registration.
- Keep startup deterministic and cheap.
- Every feature must have a clear initialization and cleanup boundary.
- Never depend on an old copy of a plugin remaining in memory after an update.
- Avoid duplicate registration of actions, listeners, hooks, materials, lights, and render resources.

### JavaScript comment syntax

Single-line note:

```js
// This is a note for developers.
```

Multi-line note:

```js
/*
  This is a longer developer note.
  It is ignored by JavaScript at runtime.
*/
```

JSDoc-style documentation:

```js
/**
 * Describes a function, parameter, return value, or system.
 */
```

For large architectural notes, use this Markdown file instead of filling executable files with comments.

---

## 3. Blockbench rendering foundation

Blockbench's preview uses **Three.js/WebGL**.

The preview creates a `THREE.WebGLRenderer` and cameras. The main scene is available through:

```js
Canvas.scene
```

The preview objects are represented through Blockbench's existing scene/rendering system.

### Important principle

LRP should work with the existing Blockbench rendering pipeline wherever practical instead of immediately replacing the renderer.

---

## 4. Native Blockbench lighting path

Blockbench has native lighting state that is separate from a conventional freely positioned Three.js light.

Important native values include:

```js
Canvas.global_light_color
Canvas.global_light_side
```

Native shading passes information into shader uniforms such as:

```glsl
uniform bool SHADE;
uniform vec3 LIGHTCOLOR;
uniform int LIGHTSIDE;
```

The native texture shaders calculate a stylized lighting value from the model normal.

Conceptually:

```text
model normal
    ↓
normal transformed into scene orientation
    ↓
LIGHTSIDE orientation adjustment
    ↓
Blockbench lighting equation
    ↓
scalar light value
    ↓
fragment shader
    ↓
texture color × lighting × LIGHTCOLOR
    ↓
final pixel
```

This is **not the same thing as simply adding a Three.js DirectionalLight**.

Therefore, before changing native shading, trace exactly where the value enters the rendering pipeline.

---

## 5. Native shader access points we have traced

### Vertex shader concepts

Blockbench's texture vertex shader uses:

```glsl
attribute float highlight;
uniform bool SHADE;
uniform int LIGHTSIDE;
varying float light;
varying float lift;
```

It calculates a lighting scalar from the transformed normal.

Important constants currently observed in the native shader:

```glsl
float AMBIENT = 0.5;
float XFAC = -0.15;
float ZFAC = 0.05;
```

If shading is disabled:

```glsl
light = 1.0;
```

Highlight data also affects `lift`.

### Fragment shader concepts

The texture fragment shader uses:

```glsl
uniform bool SHADE;
uniform bool EMISSIVE;
uniform vec3 LIGHTCOLOR;
```

The ordinary path combines texture color with `light`, `LIGHTCOLOR`, and `lift`.

The emissive path is handled separately.

Alpha below the native cutoff is discarded:

```glsl
if (color.a < 0.01) discard;
```

### LRP rule

Do not modify these native shaders blindly.

If LRP eventually needs shader control, first determine:

1. Which material is being rendered.
2. Which shader is active.
3. Which uniforms/attributes are available.
4. Where Blockbench creates the material.
5. When the material is replaced or rebuilt.
6. How the change can be removed cleanly.

---

## 6. Blockbench scene/environment system

Blockbench preview scenes can contain:

```text
light_color
light_side
cubemap
fog
fov
```

A scene's cubemap can become the visible background:

```js
Canvas.scene.background = this.cubemap;
```

The preview scene also updates:

```js
Canvas.global_light_color
Canvas.global_light_side
```

These are separate concepts:

```text
VISIBLE ENVIRONMENT
        │
        └── Canvas.scene.background

NATIVE STYLIZED LIGHTING
        │
        ├── Canvas.global_light_color
        └── Canvas.global_light_side
```

Do not assume that changing the visible skybox automatically changes every lighting path.

---

## 7. PBR/material environment path

Blockbench's PBR material system uses:

```js
THREE.MeshStandardMaterial
```

Important observed material properties include:

```js
envMapIntensity
map
normalMap
bumpMap
normalScale
emissiveMap
```

Blockbench also uses a PMREM-generated environment texture when the preview scene is active:

```js
const g = new THREE.PMREMGenerator(Preview.selected.renderer);
material.envMap = g.fromScene(Canvas.scene, 0.0, 100, 1024).texture;
```

This establishes an important distinction:

```text
Native stylized shading
        ≠
PBR environment reflections
```

PBR materials can receive an environment map through `material.envMap`.

Therefore, an LRP environment/sky system should eventually distinguish between:

1. What the camera sees.
2. What PBR materials reflect.
3. What direct lights illuminate.
4. What ambient/environment lighting contributes.

---

## 8. PBR texture channels already understood

Blockbench's material grouping recognizes channels including:

```text
color
normal
height
mer
```

The native system can use:

```text
color  → albedo/map
normal → normalMap
height → bumpMap when no normal map exists
mer    → metallic/emissive/roughness-related material data
```

LRP should not recreate Blockbench's PBR material system unless a concrete limitation requires it.

Prefer using the native material system where possible.

---

## 9. Native Three.js lights

Blockbench's canvas also contains native light objects, including an ambient light and directional light setup.

Known conceptual structure:

```text
AmbientLight
Directional lights
        ↓
Canvas.scene
        ↓
Blockbench rendering
```

However, the existence of native Three.js lights does not mean every Blockbench material uses them in the same way. Material/shader behavior must be traced before relying on them.

---

## 10. LRP lighting architecture — proposed, not implemented

Do **not** treat this as existing code.

The eventual architecture may resemble:

```text
LRP Controller
      │
      ├── Lighting
      │     ├── Direct light
      │     ├── Environment light
      │     └── Light controls
      │
      ├── Environment
      │     ├── Sky/background
      │     └── Reflection environment
      │
      ├── Material bridge
      │     └── Use Blockbench PBR materials
      │
      └── Post-processing
            ├── Bloom
            ├── Tone mapping
            └── Future effects
```

Each subsystem must remain independently testable.

---

## 11. First lighting experiment

The first implementation should be intentionally tiny.

### Do NOT start with

- Full custom renderer
- Full lighting engine
- Shadows
- Bloom
- Volumetric effects
- Complex post-processing
- Large shader replacement
- Multiple interacting lights
- Large UI system

### First experiment target

Prove **one controlled lighting/environment change** through a small, isolated path.

Preferred test boundary:

```text
LRP test
   ↓
one controlled input
   ↓
one known Three.js/Blockbench rendering target
   ↓
one visible change
   ↓
clean restoration
```

The experiment should be small enough that an error can be traced to the test itself instead of requiring investigation of the entire Blockbench renderer.

---

## 12. Test requirements for every new feature

Before calling a feature successful:

```text
LOAD
  ↓
INITIALIZE
  ↓
OBSERVE RESULT
  ↓
TOGGLE / CHANGE
  ↓
OBSERVE RESULT
  ↓
CLEAN UP
  ↓
RESTORE ORIGINAL STATE
  ↓
REPEAT
  ↓
TRY TO BREAK IT
```

Test at minimum:

- First plugin load.
- Reload/reload-equivalent behavior.
- Feature disabled.
- Feature enabled.
- Repeated enable/disable.
- Existing Blockbench scene.
- New Blockbench scene.
- Material changes.
- Preview changes.
- Cleanup/unload.
- Console errors.
- Resource leaks or duplicated objects.
- Mobile performance impact.

---

## 13. Failure classification

When something breaks, first classify the failure.

```text
                 FAILURE
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
     FEATURE PROBLEM     FOUNDATION PROBLEM
          │                   │
          ↓                   ↓
Fix isolated logic     Reconsider architecture
```

Do not repeatedly patch a feature if evidence indicates the foundation is wrong.

If an approach fails repeatedly:

**STOP → OBSERVE → QUESTION → TRACE → UNDERSTAND → CHANGE APPROACH.**

---

## 14. Mobile safety principles

Mobile is an important deployment environment, but the previous dedicated mobile-optimization feature has intentionally been removed for now.

LRP should still be designed with mobile safety in mind:

- Avoid unnecessary render loops.
- Avoid large per-frame allocations.
- Avoid repeatedly rebuilding materials.
- Avoid repeatedly generating PMREM/environment maps.
- Avoid large render targets unless explicitly required.
- Avoid installing duplicate listeners.
- Release temporary GPU resources when appropriate.
- Keep experiments reversible.
- Prefer one small measurable change over many simultaneous changes.

Mobile optimization can become a dedicated feature later after the lighting foundation is understood.

---

## 15. Important access/reference map

### Blockbench scene

```js
Canvas.scene
```

### Native global lighting state

```js
Canvas.global_light_color
Canvas.global_light_side
```

### Preview renderer

```js
Preview.selected.renderer
```

### Preview camera

```js
Preview.selected.camera
```

### PBR material

```js
THREE.MeshStandardMaterial
```

### PBR environment map

```js
material.envMap
material.envMapIntensity
```

### Environment generation

```js
THREE.PMREMGenerator
```

### Preview scene background

```js
Canvas.scene.background
```

These are **known access points**, not a license to modify them without tracing their lifecycle.

---

## 16. What we still need to trace

Before building advanced lighting, investigate the exact lifecycle of:

- Preview creation/destruction.
- Material creation/replacement.
- PBR material updates.
- PMREM generation and disposal.
- Scene selection/unselection.
- Native light creation and updates.
- Shader/material assignment to meshes.
- Renderer lifecycle.
- Preview render lifecycle.
- How plugins can safely add/remove scene objects.
- How plugin unload restores every modified state.

Unknowns are recorded here instead of being guessed.

---

## 17. Current status

**Loader:** Minimal foundation implemented.  
**Mobile optimizer:** Removed.  
**Lighting engine:** Not implemented.  
**Post-processing:** Not implemented.  
**PBR replacement system:** Not planned; use Blockbench's native system where practical.  
**First lighting experiment:** Pending.

---

## 18. Golden rule

> **Understand the system before depending on it. Build the smallest experiment that can prove what we think we understand.**

A successful result is evidence.

It is not automatically proof that our understanding is correct.
