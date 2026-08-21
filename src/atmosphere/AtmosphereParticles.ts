import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  PointsNodeMaterial,
  Sphere,
  Vector3,
} from 'three/webgpu';
import {
  attribute,
  clamp,
  color,
  float,
  mix,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import { qualityProfileFor } from '../scene/qualityProfiles';
import type { QualityTier, SceneState } from '../scene/types';

const PARTICLE_SEED = 0x51a9e7;

function randomUnit(index: number, salt: number): number {
  let value = (index ^ PARTICLE_SEED ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

export interface AtmosphereDebugSnapshot {
  seed: number;
  particleCount: number;
  representation: 'immutable-spawn + analytic-vertex-TSL';
  depthTest: boolean;
  depthWrite: boolean;
  visible: boolean;
}

/** One draw, immutable spawn records, and analytic TSL motion sampled from the shared clock. */
export class AtmosphereParticles {
  readonly root = new Group();

  private readonly time = uniform(0);
  private readonly scrollProgress = uniform(0);
  private readonly introProgress = uniform(0);
  private readonly material = new PointsNodeMaterial({
    color: new Color('#8ee9ff'),
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
    size: 1,
    sizeAttenuation: true,
  });
  private geometry: BufferGeometry | null = null;
  private points: Points | null = null;
  private quality: QualityTier;
  private requestedVisible = true;
  private count = 0;

  constructor(initialQuality: QualityTier) {
    this.quality = initialQuality;
    this.root.name = 'atmosphereParticles:analytic';

    const phase = float(attribute<'float'>('particlePhase', 'float'));
    const layer = float(attribute<'float'>('particleLayer', 'float'));
    const amplitude = float(attribute<'float'>('particleAmplitude', 'float'));
    const timePhase = this.time.mul(mix(float(0.08), float(0.24), layer)).add(phase.mul(Math.PI * 2));
    const drift = vec3(
      sin(timePhase).mul(amplitude),
      sin(timePhase.mul(0.73).add(phase.mul(3.1))).mul(amplitude.mul(0.72)),
      sin(timePhase.mul(0.51).add(phase.mul(5.7))).mul(amplitude.mul(0.46)),
    );
    this.material.positionNode = positionLocal
      .add(drift)
      .add(vec3(float(0), this.scrollProgress.mul(layer).mul(-0.32), float(0)));
    const pulse = sin(timePhase.mul(1.7)).mul(0.5).add(0.5);
    this.material.opacityNode = clamp(
      mix(float(0.08), float(0.32), pulse)
        .mul(mix(float(0.55), float(1), layer))
        .mul(smoothstep(float(0), float(1), this.introProgress)),
      float(0),
      float(0.46),
    );
    this.material.colorNode = mix(color('#5d7698'), color('#9eefff'), layer).mul(
      mix(float(0.62), float(1.18), pulse),
    );
    this.rebuild(initialQuality);
  }

  setQualityTier(quality: QualityTier): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.rebuild(quality);
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'scrollProgress' | 'quality'>): void {
    this.time.value = state.quality === 'reduced-motion' ? 0 : state.elapsedSeconds;
    this.scrollProgress.value = state.scrollProgress;
    this.introProgress.value =
      state.quality === 'reduced-motion'
        ? 1
        : Math.min(Math.max((state.elapsedSeconds - CHOREOGRAPHY_TIMELINE.atmosphere.start) /
              CHOREOGRAPHY_TIMELINE.atmosphere.duration, 0), 1);
  }

  setVisible(visible: boolean): void {
    this.requestedVisible = visible;
    this.root.visible = visible;
  }

  isVisible(): boolean {
    return this.requestedVisible;
  }

  getDebugSnapshot(): AtmosphereDebugSnapshot {
    return {
      seed: PARTICLE_SEED,
      particleCount: this.count,
      representation: 'immutable-spawn + analytic-vertex-TSL',
      depthTest: this.material.depthTest,
      depthWrite: this.material.depthWrite,
      visible: this.root.visible,
    };
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material.dispose();
  }

  private rebuild(quality: QualityTier): void {
    this.geometry?.dispose();
    this.points?.removeFromParent();
    const count = qualityProfileFor(quality).atmosphereParticles;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const layers = new Float32Array(count);
    const amplitudes = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const layer = index % 3 / 2;
      const radius = 2.4 + randomUnit(index, 0x11) * 4.8 + layer * 0.8;
      const angle = randomUnit(index, 0x22) * Math.PI * 2;
      const height = (randomUnit(index, 0x33) * 2 - 1) * (2.4 + layer * 1.5);
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = (randomUnit(index, 0x44) * 2 - 1) * 3.8 - layer * 0.5;
      phases[index] = randomUnit(index, 0x55);
      layers[index] = layer;
      amplitudes[index] = 0.06 + randomUnit(index, 0x66) * (0.12 + layer * 0.14);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('particlePhase', new Float32BufferAttribute(phases, 1));
    geometry.setAttribute('particleLayer', new Float32BufferAttribute(layers, 1));
    geometry.setAttribute('particleAmplitude', new Float32BufferAttribute(amplitudes, 1));
    geometry.boundingSphere = new Sphere(new Vector3(), 9);
    const points = new Points(geometry, this.material);
    points.name = `atmospherePoints:${quality}`;
    points.renderOrder = 0;
    this.geometry = geometry;
    this.points = points;
    this.count = count;
    this.root.add(points);
    this.root.visible = this.requestedVisible;
  }
}
