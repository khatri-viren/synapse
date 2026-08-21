import { Vector3, type PerspectiveCamera } from 'three/webgpu';

import type { CompositionScaffold } from '../scene/CompositionScaffold';
import { CHOREOGRAPHY_TIMELINE } from '../scene/ChoreographyTimeline';
import { LOGO_IDS, type SceneState } from '../scene/types';

const tempPoint = new Vector3();

/** Publishes the small, immutable screen-state surface consumed by CSS. */
export class ScreenAnchorBridge {
  private readonly published = new Map<string, string>();
  private brainSupportPoints: Vector3[] | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  update(camera: PerspectiveCamera, composition: CompositionScaffold, state: SceneState): void {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    this.brainSupportPoints ??= composition.getBrainSupportPoints();
    for (const point of this.brainSupportPoints) {
      tempPoint.copy(point).project(camera);
      const x = (tempPoint.x * 0.5 + 0.5) * bounds.width;
      const y = (-tempPoint.y * 0.5 + 0.5) * bounds.height;
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
    }

    this.write('--brain-x', `${((minimumX + maximumX) * 0.5).toFixed(2)}px`);
    this.write('--brain-y', `${((minimumY + maximumY) * 0.5).toFixed(2)}px`);
    this.write(
      '--brain-radius',
      `${(Math.max(maximumX - minimumX, maximumY - minimumY) * 0.5).toFixed(2)}px`,
    );
    this.write('--pointer-x', state.pointerNdc.x.toFixed(4));
    this.write('--pointer-y', state.pointerNdc.y.toFixed(4));
    this.write('--pointer-strength', state.pointerStrength.toFixed(4));
    this.write(
      '--intro-progress',
      Math.min(Math.max(state.elapsedSeconds / CHOREOGRAPHY_TIMELINE.cards.end, 0), 1).toFixed(4),
    );
    this.write('--scroll-progress', state.scrollProgress.toFixed(4));
    this.write('--hero-drift', (state.elapsedSeconds * 0.018 + state.scrollProgress * 0.2).toFixed(4));

    for (const id of LOGO_IDS) {
      composition.getBadgeActorWorldPosition(id, tempPoint).project(camera);
      this.write(`--badge-${id}-x`, `${((tempPoint.x * 0.5 + 0.5) * bounds.width).toFixed(2)}px`);
      this.write(`--badge-${id}-y`, `${((-tempPoint.y * 0.5 + 0.5) * bounds.height).toFixed(2)}px`);
    }
  }

  dispose(): void {
    for (const property of this.published.keys()) this.host.style.removeProperty(property);
    this.published.clear();
  }

  private write(property: string, value: string): void {
    if (this.published.get(property) === value) return;
    this.published.set(property, value);
    this.host.style.setProperty(property, value);
  }
}
