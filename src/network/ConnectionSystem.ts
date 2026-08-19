import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  Material,
  Vector3,
} from 'three/webgpu';
import { color as tslColor } from 'three/tsl';

import type { BadgeSystem } from '../badges/BadgeSystem';
import type { BrainSystem } from '../brain/BrainSystem';
import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import type { LogoId, NetworkLinkDebugSnapshot, SceneState } from '../scene/types';
import {
  CONNECTION_DASH_RATIO,
  CONNECTION_MAX_SAMPLES,
  CONNECTION_ROUTE_SPECS,
  NETWORK_WIRE_COLOR,
  connectionSampleCountForQuality,
  type ConnectionRouteSpec,
} from './connectionConfig';

interface ConnectionCurveState {
  readonly start: Vector3;
  readonly controlA: Vector3;
  readonly controlB: Vector3;
  readonly end: Vector3;
  reveal: number;
  revision: number;
}

interface ConnectionRuntime {
  readonly spec: ConnectionRouteSpec;
  readonly curve: ConnectionCurveState;
  readonly geometry: BufferGeometry;
  readonly positionAttribute: Float32BufferAttribute;
  readonly line: LineSegments;
  sampleCount: number;
  finitePositions: boolean;
}

const tempAnchorNormal = new Vector3();
const tempRouteOffset = new Vector3();
const tempDashStart = new Vector3();
const tempDashEnd = new Vector3();
const tempExpectedVisibleEnd = new Vector3();
const MAXIMUM_LINK_ACTIVATION_DELAY = Math.max(
  ...CONNECTION_ROUTE_SPECS.map((spec) => spec.activationDelay),
);
const LINK_REVEAL_DURATION_SECONDS =
  CHOREOGRAPHY_TIMELINE.linkActivation.duration - MAXIMUM_LINK_ACTIVATION_DELAY;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function minimumJerk(progress: number): number {
  const t = clamp01(progress);
  return t * t * t * (10 + t * (-15 + t * 6));
}

function evaluateCubic(curve: ConnectionCurveState, u: number, target: Vector3): Vector3 {
  const t = clamp01(u);
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;
  return target
    .copy(curve.start)
    .multiplyScalar(inverseSquared * inverse)
    .addScaledVector(curve.controlA, 3 * inverseSquared * t)
    .addScaledVector(curve.controlB, 3 * inverse * tSquared)
    .addScaledVector(curve.end, tSquared * t);
}

export class ConnectionSystem {
  readonly root = new Group();

  private readonly runtimes = new Map<LogoId, ConnectionRuntime>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();

  constructor() {
    this.root.name = 'connectionSystem';
    this.createConnections();
  }

  update(
    state: Pick<SceneState, 'elapsedSeconds' | 'quality'>,
    badgeSystem: BadgeSystem,
    brainSystem: BrainSystem,
  ): void {
    const sampleCount = connectionSampleCountForQuality(state.quality);

    for (const routeSpec of CONNECTION_ROUTE_SPECS) {
      const runtime = this.requireRuntime(routeSpec.id);
      badgeSystem.getSocketWorldPosition(routeSpec.id, runtime.curve.start);
      brainSystem.getAnchorWorldPose(routeSpec.id, runtime.curve.end, tempAnchorNormal);

      tempRouteOffset.set(...routeSpec.routeOffset);
      runtime.curve.controlA
        .lerpVectors(runtime.curve.start, runtime.curve.end, 0.3)
        .add(tempRouteOffset);
      runtime.curve.controlB
        .copy(runtime.curve.end)
        .addScaledVector(tempAnchorNormal, 0.46)
        .addScaledVector(tempRouteOffset, 0.24);
      runtime.curve.reveal =
        state.quality === 'reduced-motion'
          ? 1
          : minimumJerk(
              (state.elapsedSeconds -
                CHOREOGRAPHY_TIMELINE.linkActivation.start -
                routeSpec.activationDelay) /
                LINK_REVEAL_DURATION_SECONDS,
            );
      runtime.curve.revision += 1;
      runtime.sampleCount = sampleCount;
      runtime.line.visible = runtime.curve.reveal > 0.001;
      this.updateDashes(runtime);
    }
  }

  evaluatePosition(id: LogoId, u: number, target: Vector3): Vector3 {
    return evaluateCubic(this.requireRuntime(id).curve, u, target);
  }

  getReveal(id: LogoId): number {
    return this.requireRuntime(id).curve.reveal;
  }

  getDebugSnapshot(): NetworkLinkDebugSnapshot[] {
    return CONNECTION_ROUTE_SPECS.map((spec) => {
      const runtime = this.requireRuntime(spec.id);
      const positions = runtime.positionAttribute;
      const lastVertexIndex = runtime.sampleCount * 2 - 1;

      tempDashStart.set(positions.getX(0), positions.getY(0), positions.getZ(0));
      tempDashEnd.set(
        positions.getX(lastVertexIndex),
        positions.getY(lastVertexIndex),
        positions.getZ(lastVertexIndex),
      );
      evaluateCubic(runtime.curve, runtime.curve.reveal, tempExpectedVisibleEnd);

      const material = runtime.line.material as Material;
      return {
        id: spec.id,
        revision: runtime.curve.revision,
        sampleCount: runtime.sampleCount,
        reveal: runtime.curve.reveal,
        startError: tempDashStart.distanceTo(runtime.curve.start),
        visibleEndError: tempDashEnd.distanceTo(tempExpectedVisibleEnd),
        anchorError:
          runtime.curve.reveal >= 0.999
            ? tempDashEnd.distanceTo(runtime.curve.end)
            : null,
        finitePositions: runtime.finitePositions,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
      };
    });
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }

  private createConnections(): void {
    const vertexCount = CONNECTION_MAX_SAMPLES * 2;

    for (const spec of CONNECTION_ROUTE_SPECS) {
      const geometry = new BufferGeometry();
      const positionAttribute = new Float32BufferAttribute(
        new Float32Array(vertexCount * 3),
        3,
      );
      positionAttribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute('position', positionAttribute);
      geometry.setDrawRange(0, vertexCount);

      const material = new LineBasicNodeMaterial({
        color: new Color(NETWORK_WIRE_COLOR),
        opacity: 0.48,
        transparent: true,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      material.colorNode = tslColor(NETWORK_WIRE_COLOR).mul(1.18);
      const line = new LineSegments(geometry, material);
      line.name = `connectionLink:${spec.id}`;
      line.userData = {
        logoId: spec.id,
        role: 'connectionLink',
        direction: 'platform-to-brain',
        style: 'dashed-wire',
        units: 'composition-world-units',
      };
      line.frustumCulled = false;
      line.renderOrder = 4;
      line.visible = false;
      this.root.add(line);

      this.runtimes.set(spec.id, {
        spec,
        curve: {
          start: new Vector3(),
          controlA: new Vector3(),
          controlB: new Vector3(),
          end: new Vector3(),
          reveal: 0,
          revision: 0,
        },
        geometry,
        positionAttribute,
        line,
        sampleCount: CONNECTION_MAX_SAMPLES,
        finitePositions: true,
      });
      this.geometries.add(geometry);
      this.materials.add(material);
    }
  }

  private updateDashes(runtime: ConnectionRuntime): void {
    const { curve, positionAttribute, sampleCount } = runtime;
    const dashCellLength = 1 / sampleCount;
    const halfGap = dashCellLength * (1 - CONNECTION_DASH_RATIO) * 0.5;
    runtime.geometry.setDrawRange(0, sampleCount * 2);
    runtime.finitePositions = true;

    for (let dashIndex = 0; dashIndex < sampleCount; dashIndex += 1) {
      const cellStart = dashIndex * dashCellLength;
      const cellEnd = (dashIndex + 1) * dashCellLength;
      const normalizedStart = dashIndex === 0 ? 0 : cellStart + halfGap;
      const normalizedEnd =
        dashIndex === sampleCount - 1 ? 1 : cellEnd - halfGap;

      evaluateCubic(curve, curve.reveal * normalizedStart, tempDashStart);
      evaluateCubic(curve, curve.reveal * normalizedEnd, tempDashEnd);

      const vertexIndex = dashIndex * 2;
      positionAttribute.setXYZ(
        vertexIndex,
        tempDashStart.x,
        tempDashStart.y,
        tempDashStart.z,
      );
      positionAttribute.setXYZ(
        vertexIndex + 1,
        tempDashEnd.x,
        tempDashEnd.y,
        tempDashEnd.z,
      );
      runtime.finitePositions &&=
        Number.isFinite(tempDashStart.x) &&
        Number.isFinite(tempDashStart.y) &&
        Number.isFinite(tempDashStart.z) &&
        Number.isFinite(tempDashEnd.x) &&
        Number.isFinite(tempDashEnd.y) &&
        Number.isFinite(tempDashEnd.z);
    }

    positionAttribute.clearUpdateRanges();
    positionAttribute.addUpdateRange(0, sampleCount * 2 * 3);
    positionAttribute.needsUpdate = true;
  }

  private requireRuntime(id: LogoId): ConnectionRuntime {
    const runtime = this.runtimes.get(id);
    if (runtime === undefined) throw new Error(`Unknown connection route: ${id}`);
    return runtime;
  }
}
