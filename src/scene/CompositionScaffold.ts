import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';

import {
  BADGE_MARKER_RADIUS,
  BADGE_MARKER_SPECS,
  BRAIN_PROXY_BOUNDS,
  type BadgeMarkerSpec,
  type CompositionLayout,
  type Vector3Tuple,
} from './compositionSpec';
import type { LogoId } from './types';

function addBoundsCorners(points: Vector3[], min: Vector3Tuple, max: Vector3Tuple): void {
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        points.push(new Vector3(x, y, z));
      }
    }
  }
}

/**
 * Phase 1 scene graph and proxy geometry. These shapes establish framing and depth contracts;
 * they are intentionally replaced by the procedural brain and authored badges in later phases.
 */
export class CompositionScaffold {
  readonly root = new Group();
  readonly brainGroup = new Group();
  readonly badgeGroup = new Group();
  readonly connectionGroup = new Group();
  readonly packetGroup = new Group();

  private readonly markerGroups = new Map<LogoId, Group>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private layout: CompositionLayout = 'wide';

  constructor() {
    this.root.name = 'sceneRoot';
    this.brainGroup.name = 'brainGroup';
    this.badgeGroup.name = 'badgeGroup';
    this.connectionGroup.name = 'connectionGroup';
    this.packetGroup.name = 'packetGroup';

    this.createLighting();
    this.createBrainProxy();
    this.createBadgeMarkers();
    this.root.add(this.connectionGroup, this.brainGroup, this.badgeGroup, this.packetGroup);
    this.setLayout('wide');
  }

  setLayout(layout: CompositionLayout): void {
    this.layout = layout;

    for (const spec of BADGE_MARKER_SPECS) {
      const marker = this.markerGroups.get(spec.id);
      const position = spec.positions[layout];

      marker?.position.set(position[0], position[1], position[2]);
    }

    this.root.updateMatrixWorld(true);
  }

  getLayout(): CompositionLayout {
    return this.layout;
  }

  getSupportPoints(): Vector3[] {
    const points: Vector3[] = [];
    addBoundsCorners(points, BRAIN_PROXY_BOUNDS.min, BRAIN_PROXY_BOUNDS.max);

    for (const spec of BADGE_MARKER_SPECS) {
      const position = spec.positions[this.layout];
      const min: Vector3Tuple = [
        position[0] - BADGE_MARKER_RADIUS,
        position[1] - BADGE_MARKER_RADIUS,
        position[2] - BADGE_MARKER_RADIUS,
      ];
      const max: Vector3Tuple = [
        position[0] + BADGE_MARKER_RADIUS,
        position[1] + BADGE_MARKER_RADIUS,
        position[2] + BADGE_MARKER_RADIUS,
      ];
      addBoundsCorners(points, min, max);
    }

    return points;
  }

  getMarkerWorldPosition(id: LogoId, target = new Vector3()): Vector3 {
    const marker = this.markerGroups.get(id);

    if (marker === undefined) {
      throw new Error(`Unknown badge marker: ${id}`);
    }

    this.root.updateMatrixWorld(true);
    return marker.getWorldPosition(target);
  }

  getMarkerSpec(id: LogoId): BadgeMarkerSpec {
    const spec = BADGE_MARKER_SPECS.find((candidate) => candidate.id === id);

    if (spec === undefined) {
      throw new Error(`Unknown badge marker specification: ${id}`);
    }

    return spec;
  }

  getOwnedGroupNames(): string[] {
    return [
      this.root.name,
      this.brainGroup.name,
      this.badgeGroup.name,
      this.connectionGroup.name,
      this.packetGroup.name,
    ];
  }

  setBrainProxyVisible(visible: boolean): void {
    this.brainGroup.visible = visible;
  }

  setBadgeMarkersVisible(visible: boolean): void {
    this.badgeGroup.visible = visible;
  }

  getVisibility(): { brainProxy: boolean; badgeMarkers: boolean } {
    return {
      brainProxy: this.brainGroup.visible,
      badgeMarkers: this.badgeGroup.visible,
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

  private createLighting(): void {
    const lightingGroup = new Group();
    lightingGroup.name = 'lightingGroup';

    const hemisphere = new HemisphereLight('#8ee9ff', '#02030a', 1.45);
    const key = new DirectionalLight('#b5dfff', 2.6);
    const rim = new DirectionalLight('#6d56ff', 1.5);
    key.position.set(3.5, 4.5, 5);
    rim.position.set(-4, -1, 2.5);
    lightingGroup.add(hemisphere, key, rim);
    this.root.add(lightingGroup);
  }

  private createBrainProxy(): void {
    const lobeGeometry = new SphereGeometry(1, 32, 24);
    const stemGeometry = new CylinderGeometry(0.16, 0.24, 0.72, 18, 1);
    const brainMaterial = new MeshStandardNodeMaterial({
      color: new Color('#0b1725'),
      emissive: new Color('#07111d'),
      emissiveIntensity: 0.65,
      metalness: 0.12,
      roughness: 0.82,
    });

    const leftLobe = new Mesh(lobeGeometry, brainMaterial);
    const rightLobe = new Mesh(lobeGeometry, brainMaterial);
    const stem = new Mesh(stemGeometry, brainMaterial);

    leftLobe.name = 'brainProxyLeft';
    rightLobe.name = 'brainProxyRight';
    stem.name = 'brainProxyStem';
    leftLobe.position.set(-0.66, 0.04, 0);
    rightLobe.position.set(0.66, 0.04, 0);
    leftLobe.scale.set(0.61, 1.18, 0.72);
    rightLobe.scale.set(0.61, 1.18, 0.72);
    leftLobe.rotation.set(0.02, -0.1, 0.035);
    rightLobe.rotation.set(-0.02, 0.1, -0.035);
    stem.position.set(0, -1.14, -0.16);
    stem.rotation.z = 0.02;

    this.brainGroup.add(leftLobe, rightLobe, stem);
    this.geometries.add(lobeGeometry);
    this.geometries.add(stemGeometry);
    this.materials.add(brainMaterial);
  }

  private createBadgeMarkers(): void {
    const coreGeometry = new SphereGeometry(0.22, 20, 14);
    const haloGeometry = new TorusGeometry(0.31, 0.018, 8, 36);
    this.geometries.add(coreGeometry);
    this.geometries.add(haloGeometry);

    for (const spec of BADGE_MARKER_SPECS) {
      const marker = new Group();
      const color = new Color(spec.color);
      const material = new MeshStandardNodeMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.35,
        metalness: 0.28,
        roughness: 0.32,
      });
      const core = new Mesh(coreGeometry, material);
      const halo = new Mesh(haloGeometry, material);

      marker.name = `badgeMarker:${spec.id}`;
      marker.userData = {
        logoId: spec.id,
        depthRole: spec.depthRole,
        direction: spec.direction,
      };
      core.name = `${spec.id}:core`;
      halo.name = `${spec.id}:halo`;
      marker.add(core, halo);
      this.badgeGroup.add(marker);
      this.markerGroups.set(spec.id, marker);
      this.materials.add(material);
    }
  }
}
