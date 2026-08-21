import {
  Box3,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
} from 'three/webgpu';
import {
  attribute,
  clamp,
  color,
  float,
  mix,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { CHOREOGRAPHY_TIMELINE, normalizedBeatProgress } from '../scene/ChoreographyTimeline';
import type { QualityTier, SceneState } from '../scene/types';

const FONT_URL = '/fonts/droid_sans_regular.typeface.json';
const HEADLINE_Z = -1.72;
const GLYPH_STAGGER = 0.022;

export const HEADLINE_VARIANTS = [
  ['SIGNALS BECOME', 'INTELLIGENCE'],
  ['FROM SIGNAL', 'TO SENSE'],
  ['MAKE DATA', 'FEEL ALIVE'],
  ['EVERY SIGNAL', 'ONE MIND'],
] as const;

export interface HeadlineDebugSnapshot {
  variant: number;
  copy: readonly [string, string];
  glyphCount: number;
  depth: number;
  worldWidth: number;
  introProgress: number;
  depthTest: boolean;
  bloomRequired: false;
}

function glyphGeometry(font: Font, glyph: string, glyphIndex: number): BufferGeometry | null {
  if (glyph === ' ') return null;

  const source = new TextGeometry(glyph, {
    font,
    size: 1,
    depth: 0.045,
    curveSegments: 5,
    bevelEnabled: false,
  });
  const geometry = source.index === null ? source : source.toNonIndexed();
  if (geometry !== source) source.dispose();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  geometry.setAttribute(
    'headlineGlyphIndex',
    new Float32BufferAttribute(new Float32Array(position.count).fill(glyphIndex), 1),
  );
  return geometry;
}

function buildHeadlineGeometry(font: Font, lines: readonly [string, string]): {
  geometry: BufferGeometry;
  glyphCount: number;
} {
  const geometries: BufferGeometry[] = [];
  let glyphIndex = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const lineGeometries: BufferGeometry[] = [];
    let cursor = 0;

    for (const glyph of line) {
      const geometry = glyphGeometry(font, glyph, glyphIndex);
      glyphIndex += 1;
      if (geometry === null) {
        cursor += 0.43;
        continue;
      }

      const bounds = geometry.boundingBox;
      if (bounds === null) continue;
      const width = Math.max(bounds.max.x - bounds.min.x, 0.12);
      geometry.translate(cursor - bounds.min.x, 0, 0);
      cursor += width + 0.075;
      lineGeometries.push(geometry);
    }

    const lineGeometry = mergeGeometries(lineGeometries, false);
    if (lineGeometry === null) throw new Error('Headline glyph geometry could not be merged.');
    lineGeometry.computeBoundingBox();
    const lineBounds = lineGeometry.boundingBox;
    if (lineBounds === null) throw new Error('Headline line has no bounds.');
    const lineWidth = lineBounds.max.x - lineBounds.min.x;
    lineGeometry.translate(-lineBounds.min.x - lineWidth * 0.5, lineIndex === 0 ? 1.02 : -1.18, 0);
    geometries.push(lineGeometry);
    for (const geometry of lineGeometries) geometry.dispose();
  }

  const geometry = mergeGeometries(geometries, false);
  for (const lineGeometry of geometries) lineGeometry.dispose();
  if (geometry === null) throw new Error('Headline line geometry could not be merged.');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, glyphCount: glyphIndex };
}

/** Real scene geometry: the brain can occlude individual headline fragments through depth. */
export class HeadlineSystem {
  readonly root = new Group();
  readonly ready: Promise<void>;

  private readonly introProgress = uniform(0);
  private readonly material = new MeshStandardNodeMaterial({
    color: new Color('#d8edf5'),
    emissive: new Color('#132b38'),
    emissiveIntensity: 0.16,
    metalness: 0.05,
    roughness: 0.8,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  private readonly copy: readonly [string, string];
  private geometry: BufferGeometry | null = null;
  private glyphCount = 0;
  private worldWidth = 0;
  private currentProgress = 0;

  constructor(private readonly variant: number) {
    this.copy = HEADLINE_VARIANTS[variant] ?? HEADLINE_VARIANTS[0];
    this.root.name = 'headlineSystem:textGeometry';
    this.root.position.z = HEADLINE_Z;

    const glyphIndex = float(attribute<'float'>('headlineGlyphIndex', 'float'));
    const glyphStart = glyphIndex.mul(GLYPH_STAGGER);
    const arrival = smoothstep(glyphStart, glyphStart.add(0.24), this.introProgress);
    this.material.positionNode = positionLocal.add(
      vec3(float(0), arrival.oneMinus().mul(-0.24), float(0)),
    );
    this.material.opacityNode = arrival.mul(0.31);
    this.material.colorNode = mix(color('#829aa5'), color('#e5f5f8'), arrival);
    this.material.emissiveNode = color('#143848').mul(arrival.mul(0.16));
    this.ready = this.load();
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'quality'>): void {
    const progress =
      state.quality === 'reduced-motion'
        ? 1
        : normalizedBeatProgress(state.elapsedSeconds, CHOREOGRAPHY_TIMELINE.headline);
    this.currentProgress = progress;
    this.introProgress.value = progress;
  }

  fitToCamera(camera: PerspectiveCamera): void {
    if (this.geometry?.boundingBox === null || this.geometry?.boundingBox === undefined) return;
    const bounds = this.geometry.boundingBox;
    const localWidth = Math.max(bounds.max.x - bounds.min.x, 0.001);
    const distance = Math.max(camera.position.z - HEADLINE_Z, 0.001);
    const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * distance;
    const targetWidth = halfHeight * camera.aspect * 2 * 0.91;
    const scale = targetWidth / localWidth;
    this.root.scale.setScalar(scale);
    this.worldWidth = localWidth * scale;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  getDebugSnapshot(): HeadlineDebugSnapshot {
    return {
      variant: this.variant,
      copy: this.copy,
      glyphCount: this.glyphCount,
      depth: HEADLINE_Z,
      worldWidth: this.worldWidth,
      introProgress: this.currentProgress,
      depthTest: this.material.depthTest,
      bloomRequired: false,
    };
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material.dispose();
  }

  private async load(): Promise<void> {
    const font = await new FontLoader().loadAsync(FONT_URL);
    const result = buildHeadlineGeometry(font, this.copy);
    this.geometry = result.geometry;
    this.glyphCount = result.glyphCount;
    const mesh = new Mesh(result.geometry, this.material);
    mesh.name = `headline:${this.copy.join(' / ')}`;
    mesh.renderOrder = 0;
    this.root.add(mesh);
  }
}
