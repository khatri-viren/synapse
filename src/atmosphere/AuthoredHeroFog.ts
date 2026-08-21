import {
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { attribute, clamp, float, uniform } from 'three/tsl';

import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import { qualityProfileFor } from '../scene/qualityProfiles';
import type { QualityTier, SceneState } from '../scene/types';

type FogLayerSpec = {
  z: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  driftSpeed: number;
  phase: number;
  lowerColor: string;
  upperColor: string;
};

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

/**
 * Camera-facing local haze layers. The authored domain is the bounded hero
 * stage: a brain-centered dome that is narrow around the subject, flares toward
 * the support copy and CTAs, then continues beyond the hero floor.
 *
 * Each sheet participates in normal scene depth testing. Opaque badge meshes
 * in front of a sheet remain crisp; badges behind it receive that sheet's
 * haze, and can accumulate additional haze behind the nearer sheets.
 */
const FOG_LAYER_SPECS: readonly FogLayerSpec[] = [
  {
    z: -1.7,
    y: -2.97,
    width: 18,
    height: 4.96,
    opacity: 0.56,
    driftSpeed: 0.011,
    phase: 0.35,
    lowerColor: '#07131c',
    upperColor: '#244352',
  },
  {
    z: 0,
    y: -2.48,
    width: 15.5,
    height: 4.35,
    opacity: 0.68,
    driftSpeed: -0.009,
    phase: 2.2,
    lowerColor: '#08151f',
    upperColor: '#294c5d',
  },
  {
    z: 1.65,
    y: -2.12,
    width: 13.1,
    height: 3.57,
    opacity: 0.8,
    driftSpeed: 0.007,
    phase: 4.15,
    lowerColor: '#08131c',
    upperColor: '#315462',
  },
] as const;

export interface AuthoredHeroFogDebugSnapshot {
  branch: 'authored-local-depth-planes';
  spatialDomain: 'bounded-hero-stage';
  layerCount: number;
  layerDepths: number[];
  depthTest: true;
  depthWrite: false;
  densityProfile: 'brain-centered-flared-dome';
  animated: boolean;
  visible: boolean;
}

/** Three interpolated-density draws on desktop, two mobile/reduced, none in fallback. */
export class AuthoredHeroFog {
  readonly root = new Group();

  private readonly introProgress = uniform(0);
  private readonly geometries: PlaneGeometry[] = [];
  private readonly layers: Mesh[] = [];
  private readonly materials: MeshBasicNodeMaterial[] = [];
  private quality: QualityTier;
  private requestedVisible = true;

  constructor(initialQuality: QualityTier) {
    this.quality = initialQuality;
    this.root.name = 'authoredHeroFog:depthLayers';

    for (const [index, spec] of FOG_LAYER_SPECS.entries()) {
      const geometry = this.createGeometry(spec);
      const material = this.createMaterial(spec);
      const layer = new Mesh(geometry, material);
      layer.name = `heroFogLayer:${index}:z${spec.z}`;
      layer.position.set(0, spec.y, spec.z);
      layer.frustumCulled = false;
      layer.userData = {
        role: 'authoredHeroFog',
        depth: spec.z,
        densityProfile: 'brain-centered-flared-dome',
      };
      this.geometries.push(geometry);
      this.layers.push(layer);
      this.materials.push(material);
      this.root.add(layer);
    }

    this.applyQuality(initialQuality);
  }

  setQualityTier(quality: QualityTier): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality(quality);
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'quality'>): void {
    this.introProgress.value =
      state.quality === 'reduced-motion'
        ? 1
        : Math.min(
            Math.max(
              (state.elapsedSeconds - CHOREOGRAPHY_TIMELINE.atmosphere.start) /
                CHOREOGRAPHY_TIMELINE.atmosphere.duration,
              0,
            ),
            1,
          );

    for (const [index, layer] of this.layers.entries()) {
      const spec = FOG_LAYER_SPECS[index];
      if (spec === undefined) continue;
      layer.position.x =
        state.quality === 'reduced-motion'
          ? 0
          : Math.sin(state.elapsedSeconds * spec.driftSpeed * TAU + spec.phase) * 0.085;
    }
  }

  setVisible(visible: boolean): void {
    this.requestedVisible = visible;
    this.root.visible = visible;
  }

  getDebugSnapshot(): AuthoredHeroFogDebugSnapshot {
    const activeLayers = this.layers.filter((layer) => layer.visible);

    return {
      branch: 'authored-local-depth-planes',
      spatialDomain: 'bounded-hero-stage',
      layerCount: activeLayers.length,
      layerDepths: activeLayers.map((layer) => layer.position.z),
      depthTest: true,
      depthWrite: false,
      densityProfile: 'brain-centered-flared-dome',
      animated:
        this.quality !== 'reduced-motion' &&
        qualityProfileFor(this.quality).continuousAnimation,
      visible: this.root.visible,
    };
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createMaterial(spec: FogLayerSpec): MeshBasicNodeMaterial {
    const fogColor = new Color(spec.lowerColor).lerp(new Color(spec.upperColor), 0.62);
    const material = new MeshBasicNodeMaterial({
      color: fogColor,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const density = float(attribute<'float'>('fogDensity', 'float'));
    material.opacityNode = clamp(
      density.mul(spec.opacity).mul(this.introProgress),
      float(0),
      float(0.86),
    );
    return material;
  }

  private createGeometry(spec: FogLayerSpec): PlaneGeometry {
    // A small amount of extra tessellation keeps the precomputed alpha contour
    // smooth without adding fragment work, textures, or another fog draw.
    const geometry = new PlaneGeometry(spec.width, spec.height, 40, 18);
    const uvAttribute = geometry.getAttribute('uv');
    const positionAttribute = geometry.getAttribute('position');
    const densities = new Float32Array(uvAttribute.count);

    for (let index = 0; index < uvAttribute.count; index += 1) {
      const u = uvAttribute.getX(index);
      const v = uvAttribute.getY(index);
      const supportBand =
        smoothstepNumber(0.18, 0.32, v) *
        (1 - smoothstepNumber(0.6, 0.76, v));
      const broadBillow = Math.sin(u * TAU * 2 + spec.phase) * 0.5 + 0.5;
      const fineBillow =
        Math.sin(u * TAU * 4 - spec.phase * 1.7 + v * 3.2) * 0.5 + 0.5;
      const billow = broadBillow * 0.68 + fineBillow * 0.32;
      // Bell-shaped silhouette from the user's green contour: the fog is
      // narrow beside the brain and progressively flares toward the hero floor.
      const taper = smoothstepNumber(0.08, 0.92, v);
      const halfWidth = 0.44 - taper * 0.28;
      const edgeWobble = 1 + (billow - 0.5) * 0.08;
      positionAttribute.setX(
        index,
        positionAttribute.getX(index) * (halfWidth / 0.44) * edgeWobble,
      );
      const horizontalEnvelope =
        smoothstepNumber(0, 0.3, u) *
        (1 - smoothstepNumber(0.7, 1, u));
      const liftedHeight = v + billow * 0.075;
      const heightDensity = 1 - smoothstepNumber(0.06, 0.96, liftedHeight);
      const crownDensity =
        smoothstepNumber(0.55, 0.68, v) *
        (1 - smoothstepNumber(0.78, 0.96, v));
      const upperFeather = 1 - smoothstepNumber(0.62, 1, v);
      const verticalDensity = clamp01(
        heightDensity * 0.28 + supportBand * 0.92 + crownDensity * 0.34,
      );
      const cloudyDensity = 0.58 + billow * 0.42;
      densities[index] = clamp01(
        verticalDensity * cloudyDensity * horizontalEnvelope * upperFeather,
      );
    }

    geometry.setAttribute('fogDensity', new Float32BufferAttribute(densities, 1));
    positionAttribute.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private applyQuality(quality: QualityTier): void {
    const activeLayerCount = qualityProfileFor(quality).fogLayers;
    const firstActiveIndex = this.layers.length - activeLayerCount;

    for (const [index, layer] of this.layers.entries()) {
      layer.visible = index >= firstActiveIndex;
    }
    this.root.visible = this.requestedVisible;
  }
}
