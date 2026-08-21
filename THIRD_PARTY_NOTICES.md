# Third-party notices

This file records the third-party software, fonts, references, and assets currently identified in
`Synapse`. It is a practical project notice, not a replacement for the linked license text.
The upstream license is authoritative if its terms change.

## Project license status

Original Synapse source code is licensed under the [MIT License](LICENSE). The MIT License applies
only to original project code and does not override the separate terms for third-party fonts,
software, references, or assets listed below.

## Fonts

### Satoshi — Indian Type Foundry / Fontshare

- Used by: the DOM hero headings, navigation, and supporting UI text.
- Runtime delivery: the official Fontshare CSS endpoint in `index.html`.
- License: [ITF Free Font License (FFL)](https://www.fontshare.com/licenses/itf-ffl).
- Source: [Fontshare Satoshi](https://www.fontshare.com/fonts/satoshi).

Fontshare describes Satoshi as a closed-source Fontshare font. The FFL permits personal and
commercial use, but restricts modifying or redistributing the font files and prohibits public font
serving without prior written consent. The project therefore does not bundle a Satoshi `.woff2`
file; it uses Fontshare’s own hosted delivery. Do not add the removed local font back to `public/`
without written permission from the licensor.

### Inter — Google Fonts / The Inter Project

- Used as the primary fallback when Satoshi is unavailable.
- Runtime delivery: Google Fonts stylesheet in `index.html`.
- License: [SIL Open Font License 1.1](https://openfontlicense.org/).
- Source: [Inter on Google Fonts](https://fonts.google.com/specimen/Inter).

### Droid Sans typeface data

- Used by: `src/headline/HeadlineSystem.ts` for extruded scene-space headline geometry.
- Asset: `public/fonts/droid_sans_regular.typeface.json`.
- Source implementation: [Three.js font examples](https://github.com/mrdoob/three.js/tree/dev/examples/fonts).
- Typeface family: Droid Sans by Ascender / the Open Handset Alliance.
- License reference to investigate: [Droid Sans package information](https://fontinfo.opensuse.org/fonts/DroidSansRegular.html).

The exact JSON file contains embedded source metadata from Ascender, including an Ascender EULA URL
and a restriction describing personal/business use. Other Droid Sans distributions are described as
Apache-2.0, but that does not by itself prove that this exact converted JSON is cleared for
redistribution. Preserve the metadata and this notice, and confirm the source license before shipping
the repository publicly. If it cannot be confirmed, replace the asset with typeface data generated
from a clearly licensed font.

### Removed Fontshare files

The repository previously contained local `Satoshi`, `Switzer`, and `Gambarino` font files. They
were removed from the shipped project because they are Fontshare closed-source fonts and the current
implementation did not need the unused Switzer or Gambarino files. The app now uses the Fontshare
hosted Satoshi stylesheet and system/Inter fallbacks.

## Runtime and build dependencies

These licenses apply to the npm packages listed in `package.json` and to their code included in a
production bundle:

| Package | Version | License | Notice |
| --- | ---: | --- | --- |
| `three` | 0.185.1 | MIT | [three.js license](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| `motion` | 13.1.0 | MIT | [motion package](https://github.com/motiondivision/motion) |
| `meshoptimizer` | 1.1.1 | MIT | [meshoptimizer license](https://github.com/zeux/meshoptimizer/blob/master/LICENSE) |
| `simple-icons` | 16.28.0 | CC0-1.0 | [simple-icons license](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md) |

`simple-icons` supplies the platform marks used to construct the badge visuals. Brand names and
marks remain the property of their respective owners; this project does not claim affiliation or
endorsement.

## Inspiration and reference material

### ColorFlow — ls.graphics

- Reference: [ColorFlow](https://colorflow.ls.graphics/).
- Site terms: [ls.graphics Terms of Service](https://www.ls.graphics/terms-of-service).
- Project use: visual inspiration for the color-field study and an independent CSS recreation at
  `public/experiments/colorflow-replica.html`.
- Licensing decision: no ColorFlow source code, exported image, or site asset is redistributed.

The ls.graphics terms identify site materials and products as protected content and restrict
reproduction, redistribution, and derivative tools without permission. The previously bundled
`public/colorFlow.webp` had no provenance or license record and has been removed. The production hero
now uses authored CSS gradients instead. The replica is an independent implementation of a visual
idea, not a copy of ColorFlow’s source code or downloadable assets.

### Sylva — Meng To

- Reference: [MengTo/sylva](https://github.com/MengTo/sylva).
- Project use: architectural inspiration documented in
  `docs/research/SYLVA_ARCHITECTURE_FINDINGS.md`.
- Licensing decision: no Sylva code, artwork, shaders, or assets are copied or redistributed.

Sylva’s README states that no license is granted for reuse or redistribution of its original code,
design, or artwork. Only general implementation ideas are discussed in the project’s research notes;
the brain geometry, materials, composition, and scene code here are authored independently.

## 3D assets

### Brain — dcreamp / Sketchfab

- Source: [Brain by dcreamp on Sketchfab](https://sketchfab.com/3d-models/brain-c51b432b0b5046c1b4268061b9214feb).
- Model ID: `c51b432b0b5046c1b4268061b9214feb`.
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
- Local files: `src/new_brain/source/Brain.glb` and the optimized derivative
  `src/new_brain/runtime/Brain.runtime.glb`.
- Required attribution: **“Brain” by dcreamp, via Sketchfab**, linked to the source above and
  licensed under CC BY 4.0.

The same attribution is also recorded in [`LICENSES/CC-BY-4.0.md`](LICENSES/CC-BY-4.0.md).

The runtime GLB is an optimized derivative of the downloaded model. Keep this attribution and the
CC BY 4.0 link in the repository and in any redistribution that includes the model. The brain asset
is not covered by the project’s source-code license: do not describe the GLB as MIT-licensed or
relicense it as part of the project. The original uploader is responsible for having the rights to
grant the listed license; retain the Sketchfab source URL and the license page as provenance.

An untracked file named `public/Screenshot 2026-08-21 at 4.34.12 PM.png` is also present in the
workspace. It appears to be a capture of this project’s hero rather than an upstream site asset, but
it is intentionally left outside this audit’s ownership assumptions. Keep it only if the project
owner created or otherwise has permission to redistribute the image; otherwise remove it before
publishing.
