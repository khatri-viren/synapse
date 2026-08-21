import {
  Box3,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  BRAIN_ANCHOR_SPECS,
  BRAIN_RUNTIME_URL,
  BRAIN_SEED,
  BRAIN_SOURCE_REVISION,
  BRAIN_TARGET_HEIGHT,
  brainWireProfileForQuality,
  type BrainAnchorSpec,
  type BrainWireProfile,
} from './brainConfig';
import {
  BrainMaterials,
  WIRE_COORDINATE_ATTRIBUTE,
  WIRE_PHASE_ATTRIBUTE,
  WIRE_SELECTION_ATTRIBUTE,
} from './BrainMaterials';
import type { LogoId, QualityTier, SceneDebugSnapshot, SceneState } from '../scene/types';
import { qualityProfileFor } from '../scene/qualityProfiles';

const ANCHOR_MARKER_OFFSET = 0.026;
const SUPPORT_MARGIN = 0.04;
const WIRE_SURFACE_OFFSET = 0.006;
const LOCAL_FORWARD = new Vector3(0, 0, 1);

interface AnchorBinding {
  spec: BrainAnchorSpec;
  topologicalFeatureId: string;
  vertexIndex: number;
  localPosition: Vector3;
  localNormal: Vector3;
  marker: Group;
}

interface BrainValidation {
  finitePositions: boolean;
  validIndices: boolean;
  nonDegenerateTriangles: boolean;
}

type BrainLayerVisibility = Omit<
  SceneDebugSnapshot['visibility'],
  | 'badgeActors'
  | 'badgeSockets'
  | 'badgeOrbitGuides'
  | 'connections'
  | 'packets'
  | 'headline'
  | 'atmosphere'
>;
type AssetState = SceneDebugSnapshot['brain']['assetState'];

interface WireLayerResult {
  geometry: BufferGeometry;
  selectedEnergySegments: number;
}

function disposeLoadedMaterial(material: Material | Material[]): void {
  for (const candidate of Array.isArray(material) ? material : [material]) {
    candidate.dispose();
  }
}

function validateGeometry(geometry: BufferGeometry): BrainValidation {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  let finitePositions = positions !== undefined;
  let validIndices = indices !== null && indices.count % 3 === 0;
  let nonDegenerateTriangles = validIndices;

  if (positions === undefined || indices === null) {
    return { finitePositions, validIndices, nonDegenerateTriangles: false };
  }

  for (let index = 0; index < positions.count; index += 1) {
    finitePositions &&=
      Number.isFinite(positions.getX(index)) &&
      Number.isFinite(positions.getY(index)) &&
      Number.isFinite(positions.getZ(index));
  }

  for (let offset = 0; offset < indices.count; offset += 3) {
    const a = indices.getX(offset);
    const b = indices.getX(offset + 1);
    const c = indices.getX(offset + 2);
    validIndices &&= a < positions.count && b < positions.count && c < positions.count;
    nonDegenerateTriangles &&= a !== b && b !== c && c !== a;
  }
  return { finitePositions, validIndices, nonDegenerateTriangles };
}

function topologySignature(geometry: BufferGeometry): string {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  if (positions === undefined || indices === null) return 'unavailable';

  let hash = 0x811c9dc5;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  const update = (value: number): void => {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (let index = 0; index < positions.count; index += 1) {
    for (const value of [positions.getX(index), positions.getY(index), positions.getZ(index)]) {
      view.setFloat32(0, value, true);
      update(view.getUint32(0, true));
    }
  }
  for (let index = 0; index < indices.count; index += 1) update(indices.getX(index));
  return hash.toString(16).padStart(8, '0');
}

function addOffsetPosition(target: number[], x: number, y: number, z: number): void {
  const length = Math.hypot(x, y, z);
  const scale = length > 1e-6 ? WIRE_SURFACE_OFFSET / length : 0;
  target.push(x + x * scale, y + y * scale, z + z * scale);
}

function selectOffsets(offsets: readonly number[], budget: number): number[] {
  if (budget <= 0) return [];
  if (offsets.length <= budget) return [...offsets];

  const selected = new Array<number>(budget);
  const seedOffset = (BRAIN_SEED % 997) / 997;
  for (let index = 0; index < budget; index += 1) {
    const normalized = (index + 0.5 + seedOffset) / budget;
    selected[index] = offsets[Math.min(offsets.length - 1, Math.floor(normalized * offsets.length))];
  }
  return selected;
}

function deterministicUnit(value: number, salt: number): number {
  let hash = (value ^ BRAIN_SEED ^ salt) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Owns the optimized GLB geometry, its derived wire representations, and all
 * semantic surface anchors. The former procedural brain is not a runtime fallback.
 */
export class BrainSystem {
  readonly root = new Group();
  readonly fillGroup = new Group();
  readonly primaryWireGroup = new Group();
  readonly ghostWireGroup = new Group();
  readonly anchorGroup = new Group();
  readonly ready: Promise<void>;

  private readonly brainMaterials = new BrainMaterials();
  private readonly generatedGeometries = new Set<BufferGeometry>();
  private readonly wireGeometries = new Set<BufferGeometry>();
  private readonly anchorGeometries = new Set<BufferGeometry>();
  private readonly anchorMaterials = new Set<Material>();
  private readonly anchorBindings = new Map<LogoId, AnchorBinding>();

  private quality: QualityTier;
  private wireProfile: BrainWireProfile;
  private sourceGeometry: BufferGeometry | null = null;
  private sourceMeshCount = 0;
  private topologyHash = 'loading';
  private validation: BrainValidation = {
    finitePositions: false,
    validIndices: false,
    nonDegenerateTriangles: false,
  };
  private primaryWireSegments = 0;
  private ghostWireSegments = 0;
  private selectedEnergySegments = 0;
  private generationCount = 0;
  private ghostRequested = true;
  private assetState: AssetState = 'loading';
  private disposed = false;

  constructor(initialQuality: QualityTier) {
    this.quality = initialQuality;
    this.wireProfile = brainWireProfileForQuality(initialQuality);

    this.root.name = 'brainSystem:glb';
    this.fillGroup.name = 'brainFill:glb';
    this.primaryWireGroup.name = 'brainPrimaryWires:derived';
    this.ghostWireGroup.name = 'brainGhostWires:derived';
    this.anchorGroup.name = 'brainAnchors:glb';
    this.anchorGroup.visible = false;
    this.root.add(this.fillGroup, this.ghostWireGroup, this.primaryWireGroup, this.anchorGroup);
    this.createAnchorMarkers();
    this.syncGhostVisibility();
    this.ready = this.loadAsset();
  }

  setQualityTier(quality: QualityTier): void {
    const nextProfile = brainWireProfileForQuality(quality);
    const profileChanged =
      nextProfile.edgeThresholdDegrees !== this.wireProfile.edgeThresholdDegrees ||
      nextProfile.primarySegmentBudget !== this.wireProfile.primarySegmentBudget ||
      nextProfile.ghostSegmentBudget !== this.wireProfile.ghostSegmentBudget;
    this.quality = quality;
    this.wireProfile = nextProfile;
    if (profileChanged && this.sourceGeometry !== null) this.rebuildWireGeometry();
    this.syncGhostVisibility();
  }

  setFillVisible(visible: boolean): void {
    this.fillGroup.visible = visible;
  }

  setPrimaryWiresVisible(visible: boolean): void {
    this.primaryWireGroup.visible = visible;
  }

  setGhostWiresVisible(visible: boolean): void {
    this.ghostRequested = visible;
    this.syncGhostVisibility();
  }

  setAnchorsVisible(visible: boolean): void {
    this.anchorGroup.visible = visible;
  }

  setEnergyNodesVisible(visible: boolean): void {
    this.brainMaterials.setEnergyVisible(visible);
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'introPhase' | 'quality'>): void {
    this.brainMaterials.update(state.elapsedSeconds, state.introPhase, state.quality);
  }

  getVisibility(): BrainLayerVisibility {
    return {
      brainFill: this.fillGroup.visible,
      primaryWires: this.primaryWireGroup.visible,
      ghostWires: this.ghostWireGroup.visible,
      brainAnchors: this.anchorGroup.visible,
      wireEnergyNodes: this.brainMaterials.isEnergyVisible(),
    };
  }

  getSupportPoints(): Vector3[] {
    const bounds = this.sourceGeometry?.boundingBox?.clone() ??
      new Box3(new Vector3(-1.15, -1.3, -0.95), new Vector3(1.15, 1.3, 0.95));
    bounds.min.addScalar(-SUPPORT_MARGIN);
    bounds.max.addScalar(SUPPORT_MARGIN);
    const points: Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) points.push(new Vector3(x, y, z));
      }
    }
    return points;
  }

  getAnchorWorldPose(id: LogoId, targetPosition: Vector3, targetNormal: Vector3): void {
    const binding = this.anchorBindings.get(id);
    if (binding === undefined) throw new Error(`Unknown brain anchor: ${id}`);
    this.root.updateWorldMatrix(true, false);
    targetPosition.copy(binding.localPosition).applyMatrix4(this.root.matrixWorld);
    targetNormal.copy(binding.localNormal).transformDirection(this.root.matrixWorld);
  }

  getDebugSnapshot(): SceneDebugSnapshot['brain'] {
    this.root.updateWorldMatrix(true, true);
    const positions = this.sourceGeometry?.getAttribute('position');
    const indices = this.sourceGeometry?.getIndex();
    return {
      assetState: this.assetState,
      sourceRevision: `${BRAIN_SOURCE_REVISION}:${BRAIN_SEED.toString(16)}`,
      topologySignature: this.topologyHash,
      generationCount: this.generationCount,
      quality: this.quality,
      density: { ...this.wireProfile },
      sourceMeshCount: this.sourceMeshCount,
      hemisphereCount: 2,
      totalVertices: positions?.count ?? 0,
      totalTriangles: indices === null || indices === undefined ? 0 : indices.count / 3,
      primaryWireSegments: this.primaryWireSegments,
      ghostWireSegments: this.ghostWireSegments,
      effect: this.brainMaterials.getDebugSnapshot(this.selectedEnergySegments),
      validation: { ...this.validation },
      anchors: BRAIN_ANCHOR_SPECS.map((spec) => {
        const binding = this.anchorBindings.get(spec.id);
        if (binding === undefined) throw new Error(`Missing brain anchor binding: ${spec.id}`);
        const worldPosition = new Vector3();
        const worldNormal = new Vector3();
        this.getAnchorWorldPose(spec.id, worldPosition, worldNormal);
        return {
          id: spec.id,
          binding: { hemisphere: spec.hemisphere, x: spec.x, y: spec.y },
          topologicalFeatureId: binding.topologicalFeatureId,
          worldPosition: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
          worldNormal: { x: worldNormal.x, y: worldNormal.y, z: worldNormal.z },
          surfaceError: 0,
        };
      }),
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const geometry of this.generatedGeometries) geometry.dispose();
    for (const geometry of this.wireGeometries) geometry.dispose();
    for (const geometry of this.anchorGeometries) geometry.dispose();
    for (const material of this.anchorMaterials) material.dispose();
    this.generatedGeometries.clear();
    this.wireGeometries.clear();
    this.brainMaterials.dispose();
  }

  private async loadAsset(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(BRAIN_RUNTIME_URL);
      const meshes: Mesh[] = [];
      gltf.scene.traverse((object) => {
        const candidate = object as unknown as Mesh;
        if (candidate.isMesh === true) meshes.push(candidate);
      });
      if (meshes.length !== 1) {
        throw new Error(`Expected one optimized brain mesh; received ${meshes.length}.`);
      }

      const loadedMesh = meshes[0];
      const geometry = loadedMesh.geometry.clone();
      loadedMesh.geometry.dispose();
      disposeLoadedMaterial(loadedMesh.material as unknown as Material | Material[]);
      this.normalizeGeometry(geometry);
      this.validation = validateGeometry(geometry);
      if (!Object.values(this.validation).every(Boolean)) {
        geometry.dispose();
        throw new Error('Optimized brain GLB failed runtime topology validation.');
      }
      if (this.disposed) {
        geometry.dispose();
        return;
      }

      this.sourceGeometry = geometry;
      this.sourceMeshCount = meshes.length;
      this.topologyHash = topologySignature(geometry);
      this.generatedGeometries.add(geometry);
      if (geometry.boundingBox === null) throw new Error('Normalized brain has no bounds.');
      this.brainMaterials.setBounds(geometry.boundingBox);
      const fill = new Mesh(geometry, this.brainMaterials.fillMaterial);
      fill.name = 'Brain.runtime.glb:fill';
      fill.renderOrder = 1;
      this.fillGroup.add(fill);
      this.rebuildWireGeometry();
      this.updateAnchorBindings();
      this.assetState = 'ready';
    } catch (error) {
      this.assetState = 'error';
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Brain GLB could not be initialized: ${message}`);
    }
  }

  private normalizeGeometry(geometry: BufferGeometry): void {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (bounds === null) throw new Error('Brain GLB does not provide finite bounds.');
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    if (!(size.y > 0)) throw new Error('Brain GLB has an invalid vertical extent.');
    const scale = BRAIN_TARGET_HEIGHT / size.y;
    const normalization = new Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(new Matrix4().makeRotationY(-Math.PI / 2))
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    geometry.applyMatrix4(normalization);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  private rebuildWireGeometry(): void {
    if (this.sourceGeometry === null) return;
    for (const geometry of this.wireGeometries) geometry.dispose();
    this.wireGeometries.clear();
    this.primaryWireGroup.clear();
    this.ghostWireGroup.clear();

    const edges = new EdgesGeometry(this.sourceGeometry, this.wireProfile.edgeThresholdDegrees);
    const positions = edges.getAttribute('position');
    const bounds = this.sourceGeometry.boundingBox;
    const dividerZ = bounds === null ? 0 : bounds.min.z + (bounds.max.z - bounds.min.z) * 0.43;
    const primaryOffsets: number[] = [];
    const ghostOffsets: number[] = [];
    for (let offset = 0; offset < positions.count; offset += 2) {
      const midpointZ = (positions.getZ(offset) + positions.getZ(offset + 1)) * 0.5;
      (midpointZ >= dividerZ ? primaryOffsets : ghostOffsets).push(offset);
    }

    const createLayer = (
      offsets: readonly number[],
      budget: number,
      energySelectionRate: number,
      salt: number,
    ): WireLayerResult => {
      const selected = selectOffsets(offsets, budget);
      const layerPositions: number[] = [];
      const phases: number[] = [];
      const selections: number[] = [];
      const coordinates: number[] = [];
      const sourceBounds = this.sourceGeometry?.boundingBox;
      if (sourceBounds === null || sourceBounds === undefined) {
        throw new Error('Brain bounds are required to derive wire energy attributes.');
      }
      const size = sourceBounds.getSize(new Vector3());
      let selectedEnergySegments = 0;
      for (const offset of selected) {
        const phase = deterministicUnit(offset, salt);
        const energySelected = deterministicUnit(offset, salt ^ 0x9e3779b9) < energySelectionRate ? 1 : 0;
        selectedEnergySegments += energySelected;
        const appendVertex = (vertexOffset: number): void => {
          const x = positions.getX(vertexOffset);
          const y = positions.getY(vertexOffset);
          const z = positions.getZ(vertexOffset);
          addOffsetPosition(layerPositions, x, y, z);
          phases.push(phase);
          selections.push(energySelected);
          coordinates.push(
            fract(
              ((y - sourceBounds.min.y) / Math.max(size.y, 1e-6)) * 0.72 +
                ((x - sourceBounds.min.x) / Math.max(size.x, 1e-6)) * 0.28,
            ),
          );
        };
        appendVertex(offset);
        appendVertex(offset + 1);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(layerPositions, 3));
      geometry.setAttribute(WIRE_PHASE_ATTRIBUTE, new Float32BufferAttribute(phases, 1));
      geometry.setAttribute(WIRE_SELECTION_ATTRIBUTE, new Float32BufferAttribute(selections, 1));
      geometry.setAttribute(WIRE_COORDINATE_ATTRIBUTE, new Float32BufferAttribute(coordinates, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return { geometry, selectedEnergySegments };
    };

    const energySelectionRate = this.quality === 'desktop' ? 0.075 : this.quality === 'mobile' ? 0.05 : 0;
    const primaryLayer = createLayer(
      primaryOffsets,
      this.wireProfile.primarySegmentBudget,
      energySelectionRate,
      0x51f15e,
    );
    const ghostLayer = createLayer(ghostOffsets, this.wireProfile.ghostSegmentBudget, 0, 0xa11ce);
    const primaryGeometry = primaryLayer.geometry;
    const ghostGeometry = ghostLayer.geometry;
    edges.dispose();
    this.primaryWireSegments = primaryGeometry.getAttribute('position').count / 2;
    this.ghostWireSegments = ghostGeometry.getAttribute('position').count / 2;
    this.selectedEnergySegments = primaryLayer.selectedEnergySegments;
    this.wireGeometries.add(primaryGeometry);
    this.wireGeometries.add(ghostGeometry);

    const primary = new LineSegments(primaryGeometry, this.brainMaterials.primaryWireMaterial);
    const ghost = new LineSegments(ghostGeometry, this.brainMaterials.ghostWireMaterial);
    primary.name = 'Brain.runtime.glb:primaryWires';
    ghost.name = 'Brain.runtime.glb:ghostWires';
    primary.renderOrder = 3;
    ghost.renderOrder = 2;
    this.primaryWireGroup.add(primary);
    this.ghostWireGroup.add(ghost);
    this.generationCount += 1;
    this.syncGhostVisibility();
  }

  private createAnchorMarkers(): void {
    const sphereGeometry = new SphereGeometry(0.032, 12, 8);
    const ringGeometry = new TorusGeometry(0.058, 0.008, 6, 18);
    const pinGeometry = new BufferGeometry();
    pinGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0.12], 3));
    this.anchorGeometries.add(sphereGeometry);
    this.anchorGeometries.add(ringGeometry);
    this.anchorGeometries.add(pinGeometry);

    for (const spec of BRAIN_ANCHOR_SPECS) {
      const marker = new Group();
      const color = new Color(spec.color);
      const markerMaterial = new MeshBasicNodeMaterial({ color });
      const pinMaterial = new LineBasicNodeMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false,
      });
      const sphere = new Mesh(sphereGeometry, markerMaterial);
      const ring = new Mesh(ringGeometry, markerMaterial);
      const pin = new LineSegments(pinGeometry, pinMaterial);
      marker.name = `brainAnchor:${spec.id}`;
      marker.userData = { anchorId: spec.id, ...spec };
      sphere.position.z = ANCHOR_MARKER_OFFSET;
      ring.position.z = ANCHOR_MARKER_OFFSET;
      marker.add(pin, ring, sphere);
      this.anchorGroup.add(marker);
      this.anchorMaterials.add(markerMaterial);
      this.anchorMaterials.add(pinMaterial);
      this.anchorBindings.set(spec.id, {
        spec,
        topologicalFeatureId: `${BRAIN_SOURCE_REVISION}:pending`,
        vertexIndex: -1,
        localPosition: new Vector3(),
        localNormal: new Vector3(0, 0, 1),
        marker,
      });
    }
  }

  private updateAnchorBindings(): void {
    if (this.sourceGeometry === null || this.sourceGeometry.boundingBox === null) return;
    const positions = this.sourceGeometry.getAttribute('position');
    const normals = this.sourceGeometry.getAttribute('normal');
    const bounds = this.sourceGeometry.boundingBox;
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());

    for (const binding of this.anchorBindings.values()) {
      const targetX = center.x + binding.spec.x * size.x * 0.5;
      const targetY = center.y + binding.spec.y * size.y * 0.5;
      let bestIndex = -1;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let index = 0; index < positions.count; index += 1) {
        const normalZ = normals.getZ(index);
        if (normalZ < 0.12 || positions.getZ(index) < center.z) continue;
        const dx = (positions.getX(index) - targetX) / size.x;
        const dy = (positions.getY(index) - targetY) / size.y;
        const depthPenalty = ((bounds.max.z - positions.getZ(index)) / size.z) * 0.018;
        const normalPenalty = (1 - normalZ) * 0.012;
        const cost = dx * dx + dy * dy + depthPenalty + normalPenalty;
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = index;
        }
      }
      if (bestIndex < 0) throw new Error(`Could not bind ${binding.spec.id} to the GLB surface.`);
      binding.vertexIndex = bestIndex;
      binding.localPosition.set(
        positions.getX(bestIndex),
        positions.getY(bestIndex),
        positions.getZ(bestIndex),
      );
      binding.localNormal.set(normals.getX(bestIndex), normals.getY(bestIndex), normals.getZ(bestIndex)).normalize();
      binding.topologicalFeatureId = `${BRAIN_SOURCE_REVISION}:vertex:${bestIndex}`;
      binding.marker.position.copy(binding.localPosition);
      binding.marker.quaternion.setFromUnitVectors(LOCAL_FORWARD, binding.localNormal);
    }
  }

  private syncGhostVisibility(): void {
    this.ghostWireGroup.visible =
      this.ghostRequested && qualityProfileFor(this.quality).ghostWires;
  }
}
