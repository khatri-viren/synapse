import {
  BufferGeometry,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Shape,
} from 'three/webgpu';
import { color as tslColor } from 'three/tsl';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

import type { BadgeVectorAsset } from './badgeAssets';
import type { BadgeOrbitSpec } from './badgeConfig';

export interface BadgeVisualResources {
  visual: Group;
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
}

export const BADGE_SIZE = 0.7;
export const BADGE_CORNER_RADIUS = 0.17;
const BADGE_DEPTH = 0.12;
const MARK_MAX_SIZE = 0.55;
const MARK_PLATE_CLEARANCE = 0.012;
const HIGH_GLOW_WHITE_MARK_LOGOS = new Set(['instagram', 'facebook', 'shopify']);
const HIGH_GLOW_WHITE_MARK_INTENSITY = 1.14;

function roundedRectangle(size: number, radius: number): Shape {
  const half = size * 0.5;
  const shape = new Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return shape;
}

function centerGeometryOnDepth(geometry: BufferGeometry): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;

  if (bounds !== null) {
    geometry.translate(0, 0, -(bounds.min.z + bounds.max.z) * 0.5);
  }
}

function material(
  color: string,
  options: { emissiveIntensity: number; metalness: number; roughness: number },
): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity: options.emissiveIntensity,
    metalness: options.metalness,
    roughness: options.roughness,
  });
}

function markMaterial(color: string, glowIntensity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    color: new Color(color),
    toneMapped: false,
  });
  material.colorNode = tslColor(color).mul(glowIntensity);
  return material;
}

function createMarkGeometry(
  path: string,
  viewBoxSize: number,
  minimumFrontZ: number,
): ExtrudeGeometry[] {
  const document = new SVGLoader().parse(
    `<svg viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" /></svg>`,
  );
  const scale = MARK_MAX_SIZE / viewBoxSize;

  return document.paths.flatMap((svgPath) =>
    svgPath.toShapes().map((shape) => {
      const geometry = new ExtrudeGeometry(shape, {
        depth: 0.024,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.004,
        bevelThickness: 0.004,
        curveSegments: 8,
        steps: 1,
      });
      geometry.translate(-viewBoxSize * 0.5, -viewBoxSize * 0.5, 0);
      geometry.scale(scale, -scale, 1);
      geometry.computeBoundingBox();
      const minimumMarkZ = geometry.boundingBox?.min.z ?? 0;
      geometry.translate(0, 0, minimumFrontZ - minimumMarkZ);
      return geometry;
    }),
  );
}

export function createBadgeVisual(
  spec: BadgeOrbitSpec,
  asset: BadgeVectorAsset,
): BadgeVisualResources {
  const visual = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const plateGeometry = new ExtrudeGeometry(roundedRectangle(BADGE_SIZE, BADGE_CORNER_RADIUS), {
    depth: BADGE_DEPTH,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 10,
    steps: 1,
  });
  centerGeometryOnDepth(plateGeometry);
  plateGeometry.computeBoundingBox();
  const plateFrontZ = plateGeometry.boundingBox?.max.z ?? BADGE_DEPTH * 0.5;
  const plateMaterial = material(spec.plateColor, {
    emissiveIntensity: 0.46,
    metalness: 0.38,
    roughness: 0.28,
  });
  const plate = new Mesh(plateGeometry, plateMaterial);
  const edgeGeometry = new EdgesGeometry(plateGeometry, 28);
  const edgeMaterial = new LineBasicNodeMaterial({
    color: new Color(spec.accentColor),
    opacity: 0.62,
    transparent: true,
  });
  edgeMaterial.colorNode = tslColor(spec.accentColor).mul(1.2);
  const edgeAccent = new LineSegments(edgeGeometry, edgeMaterial);
  plate.name = `${spec.id}:plate`;
  plate.userData = { role: 'badgePlate', logoId: spec.id };
  edgeAccent.name = `${spec.id}:edgeAccent`;
  edgeAccent.userData = { role: 'badgeEdgeAccent', logoId: spec.id };
  visual.add(plate, edgeAccent);
  geometries.add(plateGeometry);
  geometries.add(edgeGeometry);
  materials.add(plateMaterial);
  materials.add(edgeMaterial);

  for (const [layerIndex, layer] of asset.layers.entries()) {
    const glowIntensity =
      layer.color === '#ffffff' && HIGH_GLOW_WHITE_MARK_LOGOS.has(spec.id)
        ? HIGH_GLOW_WHITE_MARK_INTENSITY
        : 1;
    const layerMaterial = markMaterial(layer.color, glowIntensity);
    materials.add(layerMaterial);

    for (const [shapeIndex, geometry] of createMarkGeometry(
      layer.path,
      asset.viewBoxSize,
      plateFrontZ + MARK_PLATE_CLEARANCE,
    ).entries()) {
      const mark = new Mesh(geometry, layerMaterial);
      mark.name = `${spec.id}:mark:${layerIndex}:${shapeIndex}`;
      mark.userData = { role: 'badgeMark', logoId: spec.id, layerIndex };
      visual.add(mark);
      geometries.add(geometry);
    }
  }

  visual.name = `${spec.id}:visual`;
  visual.rotation.set(...spec.authoredTilt);
  return { visual, geometries, materials };
}
