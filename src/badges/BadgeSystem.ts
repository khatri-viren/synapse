import {
  Box3,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  Line,
  LineBasicNodeMaterial,
  Material,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';

import type { CompositionLayout } from '../scene/compositionSpec';
import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import type {
  BadgeOrbitValidationSnapshot,
  BadgeRuntimeDebugSnapshot,
  LogoId,
  SceneDebugSnapshot,
  SceneState,
} from '../scene/types';
import { BADGE_VECTOR_ASSETS } from './badgeAssets';
import {
  BADGE_ACTOR_RADIUS,
  BADGE_ORBIT_SPECS,
  type BadgeOrbitSpec,
} from './badgeConfig';
import {
  BADGE_CORNER_RADIUS,
  BADGE_SIZE,
  createBadgeVisual,
} from './BadgeGeometry';

type BadgeActor = {
  root: Group;
  visual: Group;
  socket: Group;
  socketHelper: Mesh;
};

const ORBIT_GUIDE_SAMPLES = 128;
const ORBIT_GUIDE_OPACITY = 0.18;
const BADGE_ARRIVAL_STAGGER_SECONDS = 0.065;
const BADGE_ARRIVAL_ACTOR_DURATION_SECONDS =
  CHOREOGRAPHY_TIMELINE.badgeArrival.duration -
  BADGE_ARRIVAL_STAGGER_SECONDS * (BADGE_ORBIT_SPECS.length - 1);
const BADGE_CLOSE_GROUP_DISTANCE = 1.25;
const MAXIMUM_SAME_SIDE_COUNT = 3;
const MAXIMUM_BEHIND_COUNT = 2;
const MAXIMUM_OCCLUDED_COUNT = 2;
const MAXIMUM_CLOSE_GROUP_SIZE = 2;
const BADGE_SOCKET_PROTRUSION = 0.055;
const BADGE_SOCKET_STEM_LENGTH = 0.095;
const BADGE_PLANE_NORMAL = new Vector3(0, 0, 1);
const tempOrbitPoint = new Vector3();
const tempOrbitCenter = new Vector3();
const tempOrbitEuler = new Euler();
const tempSocketDirection = new Vector3();
const tempSocketLocalDirection = new Vector3();
const tempSocketLocalPoint = new Vector3();
const tempInverseVisualQuaternion = new Quaternion();
const tempSocketLocalQuaternion = new Quaternion();

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function minimumJerk(progress: number): number {
  const t = clamp01(progress);
  return t * t * t * (10 + t * (-15 + t * 6));
}

function roundedRectangleSignedDistance(x: number, y: number): number {
  const innerHalfExtent = BADGE_SIZE * 0.5 - BADGE_CORNER_RADIUS;
  const qx = Math.abs(x) - innerHalfExtent;
  const qy = Math.abs(y) - innerHalfExtent;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    BADGE_CORNER_RADIUS
  );
}

function roundedRectangleBoundaryDistance(directionX: number, directionY: number): number {
  let insideDistance = 0;
  let outsideDistance = BADGE_SIZE;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const candidate = (insideDistance + outsideDistance) * 0.5;
    const signedDistance = roundedRectangleSignedDistance(
      directionX * candidate,
      directionY * candidate,
    );

    if (signedDistance <= 0) {
      insideDistance = candidate;
    } else {
      outsideDistance = candidate;
    }
  }

  return (insideDistance + outsideDistance) * 0.5;
}

function createSocketStemGeometry(): CylinderGeometry {
  const geometry = new CylinderGeometry(0.014, 0.021, BADGE_SOCKET_STEM_LENGTH, 12, 1);
  geometry.rotateZ(-Math.PI * 0.5);
  geometry.translate(-BADGE_SOCKET_STEM_LENGTH * 0.5, 0, 0);
  return geometry;
}

function createSocketCollarGeometry(): TorusGeometry {
  const geometry = new TorusGeometry(0.032, 0.008, 8, 16);
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-BADGE_SOCKET_PROTRUSION, 0, 0);
  return geometry;
}

function largestCloseGroupSize(positions: readonly Vector3[]): number {
  const visited = new Array<boolean>(positions.length).fill(false);
  let largestGroup = 0;

  for (let start = 0; start < positions.length; start += 1) {
    if (visited[start]) continue;

    const pending = [start];
    visited[start] = true;
    let groupSize = 0;

    while (pending.length > 0) {
      const currentIndex = pending.pop();
      if (currentIndex === undefined) break;
      const current = positions[currentIndex];
      if (current === undefined) continue;
      groupSize += 1;

      for (let candidateIndex = 0; candidateIndex < positions.length; candidateIndex += 1) {
        if (visited[candidateIndex]) continue;
        const candidate = positions[candidateIndex];
        if (candidate === undefined) continue;
        const screenDistance = Math.hypot(
          current.x - candidate.x,
          current.y - candidate.y,
        );
        if (screenDistance < BADGE_CLOSE_GROUP_DISTANCE) {
          visited[candidateIndex] = true;
          pending.push(candidateIndex);
        }
      }
    }

    largestGroup = Math.max(largestGroup, groupSize);
  }

  return largestGroup;
}

export function evaluateBadgeOrbit(
  spec: BadgeOrbitSpec,
  layout: CompositionLayout,
  elapsedSeconds: number,
  target: Vector3,
): Vector3 {
  const theta =
    spec.phaseOffset +
    spec.orbitDirection * spec.angularSpeed * elapsedSeconds;
  return evaluateBadgeOrbitAtAngle(
    spec,
    layout,
    theta,
    target,
  );
}

function evaluateBadgeOrbitAtAngle(
  spec: BadgeOrbitSpec,
  layout: CompositionLayout,
  theta: number,
  target: Vector3,
): Vector3 {
  const orbit = spec.layouts[layout];
  tempOrbitEuler.set(...orbit.rotation);
  return target
    .set(orbit.radiusX * Math.cos(theta), orbit.radiusY * Math.sin(theta), 0)
    .applyEuler(tempOrbitEuler)
    .add(tempOrbitCenter.set(...orbit.center));
}

function createOrbitGeometry(spec: BadgeOrbitSpec, layout: CompositionLayout): BufferGeometry {
  const points: Vector3[] = [];

  for (let index = 0; index <= ORBIT_GUIDE_SAMPLES; index += 1) {
    const theta = (index / ORBIT_GUIDE_SAMPLES) * Math.PI * 2;
    points.push(evaluateBadgeOrbitAtAngle(spec, layout, theta, new Vector3()));
  }

  return new BufferGeometry().setFromPoints(points);
}

export class BadgeSystem {
  readonly root = new Group();
  readonly ready = Promise.resolve();

  private readonly actorGroup = new Group();
  private readonly orbitGuideGroup = new Group();
  private readonly actors = new Map<LogoId, BadgeActor>();
  private readonly orbitGuides = new Map<LogoId, Line>();
  private readonly orbitGeometries = new Map<LogoId, Record<CompositionLayout, BufferGeometry>>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly socketGeometry = new SphereGeometry(0.038, 12, 8);
  private readonly socketStemGeometry = createSocketStemGeometry();
  private readonly socketCollarGeometry = createSocketCollarGeometry();
  private layout: CompositionLayout = 'wide';
  constructor() {
    this.root.name = 'badgeSystem';
    this.actorGroup.name = 'badgeActors';
    this.orbitGuideGroup.name = 'badgeOrbitGuides';
    this.orbitGuideGroup.visible = false;
    this.root.add(this.orbitGuideGroup, this.actorGroup);
    this.geometries.add(this.socketGeometry);
    this.geometries.add(this.socketStemGeometry);
    this.geometries.add(this.socketCollarGeometry);
    this.createActors();
  }

  setLayout(layout: CompositionLayout): void {
    this.layout = layout;

    for (const spec of BADGE_ORBIT_SPECS) {
      const guide = this.orbitGuides.get(spec.id);
      const geometries = this.orbitGeometries.get(spec.id);

      if (guide !== undefined && geometries !== undefined) {
        guide.geometry = geometries[layout];
      }
    }
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'introPhase' | 'quality'>): void {
    const choreographyTime =
      state.quality === 'reduced-motion'
        ? CHOREOGRAPHY_TIMELINE.ambientStart
        : state.elapsedSeconds;
    for (const [badgeIndex, spec] of BADGE_ORBIT_SPECS.entries()) {
      const actor = this.requireActor(spec.id);
      const arrival =
        state.quality === 'reduced-motion'
          ? 1
          : minimumJerk(
              (state.elapsedSeconds -
                CHOREOGRAPHY_TIMELINE.badgeArrival.start -
                badgeIndex * BADGE_ARRIVAL_STAGGER_SECONDS) /
                BADGE_ARRIVAL_ACTOR_DURATION_SECONDS,
            );
      evaluateBadgeOrbit(spec, this.layout, choreographyTime, tempOrbitPoint);
      actor.root.position.copy(tempOrbitPoint);
      const entryExpansion = 1 + (1 - arrival) * 0.12;
      actor.root.position.x *= entryExpansion;
      actor.root.position.y *= entryExpansion;
      actor.root.position.z -= (1 - arrival) * 0.28;
      actor.root.visible = arrival > 0.001;
      actor.root.scale.setScalar(Math.max(arrival, 0.001));

      actor.visual.rotation.z =
        spec.authoredTilt[2] +
        Math.sin(choreographyTime * 0.45 + spec.phaseOffset) * 0.025;

      const radialLength = Math.hypot(tempOrbitPoint.x, tempOrbitPoint.y);
      if (radialLength > 0.0001) {
        tempSocketDirection.set(
          -tempOrbitPoint.x / radialLength,
          -tempOrbitPoint.y / radialLength,
          0,
        );
        tempInverseVisualQuaternion.copy(actor.visual.quaternion).invert();
        tempSocketLocalDirection
          .copy(tempSocketDirection)
          .applyQuaternion(tempInverseVisualQuaternion)
          .setZ(0)
          .normalize();

        const boundaryDistance = roundedRectangleBoundaryDistance(
          tempSocketLocalDirection.x,
          tempSocketLocalDirection.y,
        );
        tempSocketLocalPoint
          .copy(tempSocketLocalDirection)
          .multiplyScalar(boundaryDistance + BADGE_SOCKET_PROTRUSION)
          .applyQuaternion(actor.visual.quaternion);
        actor.socket.position.copy(tempSocketLocalPoint);

        tempSocketLocalQuaternion.setFromAxisAngle(
          BADGE_PLANE_NORMAL,
          Math.atan2(tempSocketLocalDirection.y, tempSocketLocalDirection.x),
        );
        actor.socket.quaternion
          .copy(actor.visual.quaternion)
          .multiply(tempSocketLocalQuaternion);
      }
    }

    this.root.updateMatrixWorld(true);
  }

  getSupportPoints(): Vector3[] {
    const points: Vector3[] = [];

    for (const spec of BADGE_ORBIT_SPECS) {
      for (let index = 0; index < ORBIT_GUIDE_SAMPLES; index += 1) {
        const theta = (index / ORBIT_GUIDE_SAMPLES) * Math.PI * 2;
        evaluateBadgeOrbitAtAngle(spec, this.layout, theta, tempOrbitPoint);
        points.push(
          new Vector3(
            tempOrbitPoint.x - BADGE_ACTOR_RADIUS,
            tempOrbitPoint.y - BADGE_ACTOR_RADIUS,
            tempOrbitPoint.z - BADGE_ACTOR_RADIUS,
          ),
          new Vector3(
            tempOrbitPoint.x + BADGE_ACTOR_RADIUS,
            tempOrbitPoint.y + BADGE_ACTOR_RADIUS,
            tempOrbitPoint.z + BADGE_ACTOR_RADIUS,
          ),
        );
      }
    }

    return points;
  }

  getActorWorldPosition(id: LogoId, target = new Vector3()): Vector3 {
    return this.requireActor(id).root.getWorldPosition(target);
  }

  getSocketWorldPosition(id: LogoId, target = new Vector3()): Vector3 {
    return this.requireActor(id).socket.getWorldPosition(target);
  }

  getDebugSnapshot(): BadgeRuntimeDebugSnapshot[] {
    return BADGE_ORBIT_SPECS.map((spec) => {
      const actorWorld = this.getActorWorldPosition(spec.id);
      const socketWorld = this.getSocketWorldPosition(spec.id);
      const asset = BADGE_VECTOR_ASSETS[spec.id];

      return {
        id: spec.id,
        label: spec.label,
        actorWorld: { x: actorWorld.x, y: actorWorld.y, z: actorWorld.z },
        socketWorld: { x: socketWorld.x, y: socketWorld.y, z: socketWorld.z },
        socketDistance: actorWorld.distanceTo(socketWorld),
        angularSpeed: spec.angularSpeed,
        phaseOffset: spec.phaseOffset,
        orbitPeriodSeconds: (Math.PI * 2) / Math.abs(spec.angularSpeed),
        orbitInclination: [...spec.layouts[this.layout].rotation],
        artworkSource: asset.artworkSource,
        artworkSourceUrl: asset.artworkSourceUrl,
        brandGuidanceUrl: asset.brandGuidanceUrl,
      };
    });
  }

  validateOrbitSafety(brainBounds: Box3): BadgeOrbitValidationSnapshot {
    const maximumPeriodSeconds = Math.max(
      ...BADGE_ORBIT_SPECS.map((spec) => (Math.PI * 2) / Math.abs(spec.angularSpeed)),
    );
    const sampleStepSeconds = 1 / 60;
    const sampleCount = Math.ceil(maximumPeriodSeconds / sampleStepSeconds) + 1;
    const firstFullScaleSecond = CHOREOGRAPHY_TIMELINE.badgeArrival.end;
    const positions = BADGE_ORBIT_SPECS.map(() => new Vector3());
    const brainCenter = brainBounds.getCenter(new Vector3());
    const brainRadii = brainBounds
      .getSize(new Vector3())
      .multiplyScalar(0.5)
      .addScalar(BADGE_ACTOR_RADIUS);
    const minimumBrainRadius = Math.min(brainRadii.x, brainRadii.y, brainRadii.z);
    let finitePositions = true;
    let minimumBrainClearance = Number.POSITIVE_INFINITY;
    let minimumBadgeClearance = Number.POSITIVE_INFINITY;
    let maximumSameSideCount = 0;
    let maximumBehindCount = 0;
    let maximumOccludedCount = 0;
    let maximumCloseGroupSize = 0;
    let minimumBrainClearanceAt: BadgeOrbitValidationSnapshot['minimumBrainClearanceAt'] = {
      badgeId: BADGE_ORBIT_SPECS[0].id,
      elapsedSeconds: 0,
    };
    let minimumBadgeClearanceAt: BadgeOrbitValidationSnapshot['minimumBadgeClearanceAt'] = {
      badgeIds: [BADGE_ORBIT_SPECS[0].id, BADGE_ORBIT_SPECS[1].id],
      elapsedSeconds: 0,
    };

    for (let sample = 0; sample < sampleCount; sample += 1) {
      const elapsedSeconds =
        firstFullScaleSecond + Math.min(sample * sampleStepSeconds, maximumPeriodSeconds);

      for (const [index, spec] of BADGE_ORBIT_SPECS.entries()) {
        const position = positions[index];
        if (position !== undefined) {
          evaluateBadgeOrbit(spec, this.layout, elapsedSeconds, position);
        }
      }

      for (const [index, spec] of BADGE_ORBIT_SPECS.entries()) {
        const position = positions[index];

        if (position === undefined) {
          continue;
        }

        finitePositions &&=
          Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
        const normalizedBrainDistance = Math.hypot(
          (position.x - brainCenter.x) / brainRadii.x,
          (position.y - brainCenter.y) / brainRadii.y,
          (position.z - brainCenter.z) / brainRadii.z,
        );
        const brainClearance = (normalizedBrainDistance - 1) * minimumBrainRadius;
        if (brainClearance < minimumBrainClearance) {
          minimumBrainClearance = brainClearance;
          minimumBrainClearanceAt = { badgeId: spec.id, elapsedSeconds };
        }
      }

      let leftCount = 0;
      let rightCount = 0;
      let upperCount = 0;
      let lowerCount = 0;
      let behindCount = 0;
      let occludedCount = 0;

      for (const position of positions) {
        leftCount += position.x < brainCenter.x ? 1 : 0;
        rightCount += position.x >= brainCenter.x ? 1 : 0;
        lowerCount += position.y < brainCenter.y ? 1 : 0;
        upperCount += position.y >= brainCenter.y ? 1 : 0;
        behindCount += position.z < brainCenter.z ? 1 : 0;
        const projectedBrainDistance = Math.hypot(
          (position.x - brainCenter.x) / brainRadii.x,
          (position.y - brainCenter.y) / brainRadii.y,
        );
        occludedCount += projectedBrainDistance < 1 ? 1 : 0;
      }

      maximumSameSideCount = Math.max(
        maximumSameSideCount,
        leftCount,
        rightCount,
        upperCount,
        lowerCount,
      );
      maximumBehindCount = Math.max(maximumBehindCount, behindCount);
      maximumOccludedCount = Math.max(maximumOccludedCount, occludedCount);
      maximumCloseGroupSize = Math.max(
        maximumCloseGroupSize,
        largestCloseGroupSize(positions),
      );

      for (let left = 0; left < positions.length; left += 1) {
        const leftPosition = positions[left];
        if (leftPosition === undefined) continue;

        for (let right = left + 1; right < positions.length; right += 1) {
          const rightPosition = positions[right];
          if (rightPosition === undefined) continue;
          const badgeClearance = leftPosition.distanceTo(rightPosition) - BADGE_ACTOR_RADIUS * 2;
          if (badgeClearance < minimumBadgeClearance) {
            minimumBadgeClearance = badgeClearance;
            minimumBadgeClearanceAt = {
              badgeIds: [BADGE_ORBIT_SPECS[left].id, BADGE_ORBIT_SPECS[right].id],
              elapsedSeconds,
            };
          }
        }
      }
    }

    return {
      sampleRateHz: 60,
      sampleCount,
      sampleDurationSeconds: maximumPeriodSeconds,
      finitePositions,
      minimumBrainClearance,
      minimumBadgeClearance,
      minimumBrainClearanceAt,
      minimumBadgeClearanceAt,
      maximumSameSideCount,
      maximumBehindCount,
      maximumOccludedCount,
      maximumCloseGroupSize,
      brainCollisionFree: minimumBrainClearance >= 0,
      badgeCollisionFree: minimumBadgeClearance >= 0,
      distributionSafe:
        maximumSameSideCount <= MAXIMUM_SAME_SIDE_COUNT &&
        maximumBehindCount <= MAXIMUM_BEHIND_COUNT &&
        maximumOccludedCount <= MAXIMUM_OCCLUDED_COUNT &&
        maximumCloseGroupSize <= MAXIMUM_CLOSE_GROUP_SIZE,
    };
  }

  setActorsVisible(visible: boolean): void {
    this.actorGroup.visible = visible;
  }

  setSocketsVisible(visible: boolean): void {
    for (const actor of this.actors.values()) {
      actor.socketHelper.visible = visible;
    }
  }

  setOrbitGuidesVisible(visible: boolean): void {
    this.orbitGuideGroup.visible = visible;
  }

  getVisibility(): Pick<
    SceneDebugSnapshot['visibility'],
    'badgeActors' | 'badgeSockets' | 'badgeOrbitGuides'
  > {
    return {
      badgeActors: this.actorGroup.visible,
      badgeSockets: [...this.actors.values()].some((actor) => actor.socketHelper.visible),
      badgeOrbitGuides: this.orbitGuideGroup.visible,
    };
  }

  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }

    for (const material of this.materials) {
      material.dispose();
    }
  }

  private createActors(): void {
    for (const spec of BADGE_ORBIT_SPECS) {
      const actor = new Group();
      const socket = new Group();
      const visualResources = createBadgeVisual(spec, BADGE_VECTOR_ASSETS[spec.id]);
      const socketMaterial = new MeshStandardNodeMaterial({
        color: new Color(spec.plateColor),
        emissive: new Color(spec.plateColor),
        emissiveIntensity: 0.68,
        metalness: 0.4,
        roughness: 0.25,
      });
      const socketStem = new Mesh(this.socketStemGeometry, socketMaterial);
      const socketCollar = new Mesh(this.socketCollarGeometry, socketMaterial);
      const socketHelper = new Mesh(this.socketGeometry, socketMaterial);
      const guideMaterial = new LineBasicNodeMaterial({
        color: new Color(spec.accentColor),
        opacity: ORBIT_GUIDE_OPACITY,
        transparent: true,
      });
      const wideGeometry = createOrbitGeometry(spec, 'wide');
      const compactGeometry = createOrbitGeometry(spec, 'compact');
      const guide = new Line(wideGeometry, guideMaterial);

      actor.name = `badgeActor:${spec.id}`;
      actor.userData = { logoId: spec.id, role: 'badgeActor' };
      socket.name = `connectionSocket:${spec.id}`;
      socket.userData = {
        logoId: spec.id,
        role: 'connectionSocket',
        units: 'composition-world-units',
      };
      socketStem.name = `connectionSocketStem:${spec.id}`;
      socketStem.userData = { logoId: spec.id, role: 'connectionSocketStem' };
      socketCollar.name = `connectionSocketCollar:${spec.id}`;
      socketCollar.userData = { logoId: spec.id, role: 'connectionSocketCollar' };
      socketHelper.name = `connectionSocketHelper:${spec.id}`;
      socketHelper.visible = false;
      socket.add(socketStem, socketCollar, socketHelper);
      actor.add(visualResources.visual, socket);
      this.actorGroup.add(actor);

      guide.name = `badgeOrbitGuide:${spec.id}`;
      guide.userData = { logoId: spec.id, role: 'orbitGuide' };
      this.orbitGuideGroup.add(guide);

      this.actors.set(spec.id, {
        root: actor,
        visual: visualResources.visual,
        socket,
        socketHelper,
      });
      this.orbitGuides.set(spec.id, guide);
      this.orbitGeometries.set(spec.id, { wide: wideGeometry, compact: compactGeometry });
      this.geometries.add(wideGeometry);
      this.geometries.add(compactGeometry);
      this.materials.add(socketMaterial);
      this.materials.add(guideMaterial);
      for (const geometry of visualResources.geometries) {
        this.geometries.add(geometry);
      }
      for (const ownedMaterial of visualResources.materials) {
        this.materials.add(ownedMaterial);
      }
    }
  }

  private requireActor(id: LogoId): BadgeActor {
    const actor = this.actors.get(id);

    if (actor === undefined) {
      throw new Error(`Unknown badge actor: ${id}`);
    }

    return actor;
  }
}
