import {
  BufferGeometry,
  Color,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  Vector3,
} from 'three/webgpu';

import type { IntroPhase } from './types';

type LinePart = {
  line: LineSegments;
  material: LineBasicNodeMaterial;
};

const NEURAL_CYAN = new Color('#8ee9ff');
const NEURAL_BLUE = new Color('#4c7dff');

function createRing(radius: number, segments: number, color: Color, opacity: number): LinePart {
  const points: Vector3[] = [];

  for (let index = 0; index < segments; index += 1) {
    const currentAngle = (index / segments) * Math.PI * 2;
    const nextAngle = (((index + 1) % segments) / segments) * Math.PI * 2;
    points.push(
      new Vector3(Math.cos(currentAngle) * radius, Math.sin(currentAngle) * radius, 0),
      new Vector3(Math.cos(nextAngle) * radius, Math.sin(nextAngle) * radius, 0),
    );
  }

  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new LineBasicNodeMaterial({
    color,
    transparent: true,
    opacity,
  });

  return {
    line: new LineSegments(geometry, material),
    material,
  };
}

function createCrosshair(color: Color): LinePart {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(-1.65, 0, 0),
    new Vector3(-0.88, 0, 0),
    new Vector3(0.88, 0, 0),
    new Vector3(1.65, 0, 0),
    new Vector3(0, -1.65, 0),
    new Vector3(0, -0.88, 0),
    new Vector3(0, 0.88, 0),
    new Vector3(0, 1.65, 0),
  ]);
  const material = new LineBasicNodeMaterial({
    color,
    transparent: true,
    opacity: 0.16,
  });

  return {
    line: new LineSegments(geometry, material),
    material,
  };
}

function phaseEnergy(elapsedSeconds: number, phase: IntroPhase): number {
  switch (phase) {
    case 'brain-scan':
      return Math.min(1, elapsedSeconds / 1.25);
    case 'badge-arrival':
      return 0.9;
    case 'link-activation':
      return 1;
    case 'ambient':
      return 0.78;
  }
}

/**
 * A deliberately abstract render probe for Phase 0. It validates the renderer, output colour,
 * frame loop and pause behavior without prematurely introducing brain or logo geometry.
 */
export class DiagnosticRig {
  readonly root = new Group();

  private readonly outerRing = createRing(1.16, 72, NEURAL_CYAN, 0.42);
  private readonly innerRing = createRing(0.56, 48, NEURAL_BLUE, 0.28);
  private readonly crosshair = createCrosshair(NEURAL_CYAN);
  private readonly parts: LinePart[] = [this.outerRing, this.innerRing, this.crosshair];

  constructor() {
    this.root.add(this.crosshair.line, this.outerRing.line, this.innerRing.line);
    this.root.position.z = 0;
  }

  update(elapsedSeconds: number, phase: IntroPhase, motionEnabled: boolean): void {
    const energy = phaseEnergy(elapsedSeconds, phase);
    const pulse = motionEnabled ? 0.5 + Math.sin(elapsedSeconds * 2.4) * 0.5 : 0.5;

    this.root.rotation.z = motionEnabled ? elapsedSeconds * 0.13 : 0;
    this.root.rotation.y = motionEnabled ? Math.sin(elapsedSeconds * 0.45) * 0.08 : 0;

    const scanScale = phase === 'brain-scan' ? 0.28 + energy * 0.72 : 1;
    this.outerRing.line.scale.setScalar(scanScale);
    this.innerRing.line.scale.setScalar(0.92 + pulse * 0.08);

    this.outerRing.material.opacity = 0.16 + energy * 0.32;
    this.innerRing.material.opacity = 0.12 + pulse * 0.22;
    this.crosshair.material.opacity = 0.08 + energy * 0.12;
  }

  dispose(): void {
    for (const { line, material } of this.parts) {
      line.geometry.dispose();
      material.dispose();
    }
  }
}
