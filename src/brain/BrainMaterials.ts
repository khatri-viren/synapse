import {
  AdditiveBlending,
  Box3,
  LineBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  color,
  distance,
  float,
  fract,
  min,
  mix,
  positionWorld,
  sin,
  smoothstep,
  uniform,
} from 'three/tsl';

import type { IntroPhase, QualityTier, SceneDebugSnapshot } from '../scene/types';
import {
  CHOREOGRAPHY_TIMELINE,
  normalizedBeatProgress,
} from '../scene/ChoreographyTimeline';

export const WIRE_PHASE_ATTRIBUTE = 'wireEnergyPhase';
export const WIRE_SELECTION_ATTRIBUTE = 'wireEnergySelection';
export const WIRE_COORDINATE_ATTRIBUTE = 'wireEnergyCoordinate';

const FILL_LAG_WORLD_UNITS = 0.24;
const SCAN_RIM_WIDTH_WORLD_UNITS = 0.12;
const MAX_WOBBLE_WORLD_UNITS = 0.052;
const WIRE_REVEAL_RIM_WIDTH_WORLD_UNITS = 0.1;
const WIRE_REVEAL_EDGE_SOFTNESS_WORLD_UNITS = 0.045;
const WIRE_REVEAL_TRAIL_WORLD_UNITS = 0.46;
const TAU = Math.PI * 2;

function easeOutPower(progress: number): number {
  return 1 - Math.pow(1 - progress, 1.35);
}

/**
 * Owns the shared TSL graph and its small, constant set of uniforms. Geometry
 * attributes provide stable variation; no edge or fragment state is simulated
 * on the CPU during a frame.
 */
export class BrainMaterials {
  readonly fillMaterial = new MeshStandardNodeMaterial({
    metalness: 0.03,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  readonly primaryWireMaterial = new LineBasicNodeMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  readonly ghostWireMaterial = new LineBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  private readonly scanOrigin = uniform(new Vector3(-1.5, -1.5, 0));
  private readonly scanRadius = uniform(0);
  private readonly fillScanEnabled = uniform(1);
  private readonly wireRevealEnabled = uniform(1);
  private readonly wireRevealProgress = uniform(0);
  private readonly wireCenterX = uniform(0);
  private readonly wireFrontDistance = uniform(1.5);
  private readonly energyTime = uniform(0);
  private readonly energyEnabled = uniform(1);
  private maximumScanRadius = 3;
  private maximumWireFrontDistance = 1.5;
  private currentProgress = 0;
  private currentMode: SceneDebugSnapshot['brain']['effect']['mode'] = 'scan';
  private energyRequested = true;

  constructor() {
    // `float()` narrows Three's broad AttributeNode<string> declaration so the
    // fluent arithmetic helpers remain strongly typed in TypeScript.
    const phase = float(attribute<'float'>(WIRE_PHASE_ATTRIBUTE, 'float'));
    const selection = float(attribute<'float'>(WIRE_SELECTION_ATTRIBUTE, 'float'));
    const energyCoordinate = float(attribute<'float'>(WIRE_COORDINATE_ATTRIBUTE, 'float'));
    const scanDistance = distance(positionWorld, this.scanOrigin);
    const wobble = sin(positionWorld.y.mul(7.1).add(positionWorld.x.mul(4.3)))
      .mul(0.033)
      .add(sin(positionWorld.z.mul(9.4).add(positionWorld.y.mul(5.2))).mul(0.019));
    const frontDistance = abs(scanDistance.add(wobble).sub(this.scanRadius));
    const scanRim = smoothstep(float(0), SCAN_RIM_WIDTH_WORLD_UNITS, frontDistance).oneMinus();
    const wireEntrance = smoothstep(float(0), float(0.06), this.wireRevealProgress);

    // The wire reveal has two wavefronts. Distance from the center seam is
    // greatest at the left/right silhouette, so lowering the front distance
    // over time reveals both outer edges first and moves them inward until
    // they meet in the middle. A small world-space wobble keeps the fronts
    // anatomical rather than reading as two rigid CSS wipes.
    const wireDistanceFromCenter = abs(positionWorld.x.sub(this.wireCenterX));
    const wireWobble = sin(positionWorld.y.mul(6.4).add(positionWorld.z.mul(4.7)))
      .mul(0.028)
      .add(sin(positionWorld.y.mul(10.1).sub(positionWorld.z.mul(3.2))).mul(0.014));
    const bilateralDistance = wireDistanceFromCenter.add(wireWobble);
    const wireFrontDelta = abs(bilateralDistance.sub(this.wireFrontDistance));
    const wireScanRim = smoothstep(
      float(0),
      WIRE_REVEAL_RIM_WIDTH_WORLD_UNITS,
      wireFrontDelta,
    ).oneMinus();
    const wireReached = smoothstep(
      this.wireFrontDistance.sub(WIRE_REVEAL_EDGE_SOFTNESS_WORLD_UNITS),
      this.wireFrontDistance.add(WIRE_REVEAL_EDGE_SOFTNESS_WORLD_UNITS),
      bilateralDistance,
    );
    const wireTrail = smoothstep(
      this.wireFrontDistance,
      this.wireFrontDistance.add(WIRE_REVEAL_TRAIL_WORLD_UNITS),
      bilateralDistance,
    ).mul(wireReached);
    const wireRevealMask = clamp(
      wireReached.add(wireScanRim.mul(0.72)),
      float(0),
      float(1),
    );

    const phaseWave = sin(this.energyTime.mul(0.48).add(phase.mul(TAU))).mul(0.5).add(0.5);
    const energyHead = fract(this.energyTime.mul(0.085).add(phase.mul(0.37)));
    const directEnergyDistance = abs(energyCoordinate.sub(energyHead));
    const wrappedEnergyDistance = min(directEnergyDistance, float(1).sub(directEnergyDistance));
    const travelingNode = smoothstep(float(0.022), float(0.082), wrappedEnergyDistance)
      .oneMinus()
      .mul(selection)
      .mul(this.energyEnabled);

    const ambientWireOpacity = float(0.68).add(phaseWave.mul(0.12)).add(travelingNode.mul(0.72));
    const scanningWireOpacity = wireReached
      .mul(0.62)
      .add(wireScanRim.mul(0.72))
      .add(wireTrail.mul(0.12))
      .mul(wireEntrance);
    const primaryOpacity = clamp(
      mix(ambientWireOpacity, scanningWireOpacity, this.wireRevealEnabled),
      float(0),
      float(1),
    );
    const primaryEnergy = clamp(
      wireScanRim.mul(this.wireRevealEnabled).add(travelingNode),
      float(0),
      float(1),
    );
    this.primaryWireMaterial.opacityNode = primaryOpacity;
    this.primaryWireMaterial.colorNode = mix(
      color('#58bfe8'),
      color('#d9fbff'),
      primaryEnergy,
    ).mul(float(1.06).add(primaryEnergy.mul(1.36)));

    // Ghost wires are the through-surface anatomical context. They need to
    // remain subordinate to the primary front-facing wires, but 3–5% opacity
    // makes them disappear once the dense GLB wire layer and dark shell are
    // composited together.
    const ghostOpacity = float(0.12)
      .add(phaseWave.mul(0.035))
      .add(wireScanRim.mul(this.wireRevealEnabled).mul(0.1));
    this.ghostWireMaterial.opacityNode = ghostOpacity.mul(
      mix(
        float(1),
        wireRevealMask.mul(wireEntrance),
        this.wireRevealEnabled,
      ),
    );
    this.ghostWireMaterial.colorNode = mix(
      color('#6f8fd4'),
      color('#b7efff'),
      wireScanRim.mul(this.wireRevealEnabled),
    ).mul(float(1.02).add(wireScanRim.mul(this.wireRevealEnabled).mul(0.42)));

    const fillFront = this.scanRadius.sub(FILL_LAG_WORLD_UNITS).add(wobble);
    this.fillMaterial.maskNode = this.fillScanEnabled
      .lessThan(0.5)
      .or(scanDistance.lessThanEqual(fillFront));
    const shellScanEnergy = scanRim.mul(this.fillScanEnabled).mul(0.34);
    this.fillMaterial.colorNode = mix(color('#060b15'), color('#102d43'), shellScanEnergy);
    this.fillMaterial.emissiveNode = mix(
      color('#03101e'),
      color('#176484'),
      shellScanEnergy,
    );
  }

  setBounds(bounds: Box3): void {
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    this.scanOrigin.value.set(
      bounds.min.x - size.x * 0.1,
      bounds.min.y - size.y * 0.08,
      center.z + size.z * 0.06,
    );

    let farthestDistance = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          farthestDistance = Math.max(
            farthestDistance,
            this.scanOrigin.value.distanceTo(new Vector3(x, y, z)),
          );
        }
      }
    }
    this.maximumScanRadius =
      farthestDistance + FILL_LAG_WORLD_UNITS + MAX_WOBBLE_WORLD_UNITS + 0.08;
    this.wireCenterX.value = center.x;
    this.maximumWireFrontDistance = size.x * 0.5 + MAX_WOBBLE_WORLD_UNITS + 0.08;
    this.wireFrontDistance.value = this.maximumWireFrontDistance;
  }

  update(elapsedSeconds: number, _phase: IntroPhase, quality: QualityTier): void {
    const reducedMotion = quality === 'reduced-motion';
    const fillProgress = reducedMotion
      ? 1
      : normalizedBeatProgress(elapsedSeconds, CHOREOGRAPHY_TIMELINE.brainFill);
    const wireProgress = reducedMotion
      ? 1
      : normalizedBeatProgress(elapsedSeconds, CHOREOGRAPHY_TIMELINE.brainWireReveal);
    const sequenceProgress = reducedMotion
      ? 1
      : normalizedBeatProgress(elapsedSeconds, CHOREOGRAPHY_TIMELINE.brainScan);
    const fillScanActive =
      !reducedMotion && elapsedSeconds < CHOREOGRAPHY_TIMELINE.brainFill.end;
    // Keep the wire reveal graph active before its authored start so both wire
    // layers remain fully hidden while the shell is being established.
    const wireRevealActive =
      !reducedMotion && elapsedSeconds < CHOREOGRAPHY_TIMELINE.brainWireReveal.end;

    this.currentProgress = sequenceProgress;
    this.currentMode = reducedMotion
      ? 'reduced-static'
      : wireRevealActive
        ? 'scan'
        : 'ambient';
    this.wireRevealProgress.value = wireProgress;
    this.scanRadius.value = easeOutPower(fillProgress) * this.maximumScanRadius;
    this.wireFrontDistance.value =
      (1 - easeOutPower(wireProgress)) * this.maximumWireFrontDistance;
    this.fillScanEnabled.value = fillScanActive ? 1 : 0;
    this.wireRevealEnabled.value = wireRevealActive ? 1 : 0;
    this.energyTime.value = reducedMotion ? 0 : elapsedSeconds;
    this.energyEnabled.value =
      this.energyRequested && !reducedMotion && !wireRevealActive ? 1 : 0;
  }

  setEnergyVisible(visible: boolean): void {
    this.energyRequested = visible;
  }

  isEnergyVisible(): boolean {
    return this.energyRequested;
  }

  getDebugSnapshot(selectedEnergySegments: number): SceneDebugSnapshot['brain']['effect'] {
    return {
      mode: this.currentMode,
      scanProgress: this.currentProgress,
      scanRadius: this.scanRadius.value,
      maximumScanRadius: this.maximumScanRadius,
      fillLag: FILL_LAG_WORLD_UNITS,
      scanOrigin: {
        x: this.scanOrigin.value.x,
        y: this.scanOrigin.value.y,
        z: this.scanOrigin.value.z,
      },
      selectedEnergySegments,
      energyNodesVisible: this.energyRequested,
      primaryDepthTest: this.primaryWireMaterial.depthTest,
      ghostDepthTest: this.ghostWireMaterial.depthTest,
      bloomRequired: false,
    };
  }

  dispose(): void {
    this.fillMaterial.dispose();
    this.primaryWireMaterial.dispose();
    this.ghostWireMaterial.dispose();
  }
}
