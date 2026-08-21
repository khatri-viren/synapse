export type CompositionLayout = 'wide' | 'compact';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface NormalizedDomRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StageRect {
  /** NDC centre. Positive Y moves the composition upward. */
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface HeroLayoutSpec {
  readonly stage: StageRect;
  readonly navBand: NormalizedDomRect;
  readonly headlineBand: NormalizedDomRect;
  readonly supportBand: NormalizedDomRect;
  readonly cardGutters: readonly [NormalizedDomRect, NormalizedDomRect];
  readonly keepOutRects: readonly NormalizedDomRect[];
}

const wideLayout: HeroLayoutSpec = {
  stage: { centerX: 0, centerY: 0.015, halfWidth: 0.78, halfHeight: 0.72 },
  navBand: { left: 0.66, top: 0.072, width: 0.295, height: 0.065 },
  headlineBand: { left: 0.035, top: 0.17, width: 0.93, height: 0.43 },
  supportBand: { left: 0.27, top: 0.76, width: 0.46, height: 0.17 },
  cardGutters: [
    { left: 0.035, top: 0.65, width: 0.235, height: 0.24 },
    { left: 0.73, top: 0.65, width: 0.235, height: 0.24 },
  ],
  keepOutRects: [
    { left: 0.66, top: 0.072, width: 0.295, height: 0.065 },
    { left: 0.34, top: 0.87, width: 0.32, height: 0.1 },
  ],
};

const compactLayout: HeroLayoutSpec = {
  stage: { centerX: 0, centerY: 0.02, halfWidth: 0.9, halfHeight: 0.68 },
  navBand: { left: 0.04, top: 0.018, width: 0.92, height: 0.075 },
  headlineBand: { left: 0.04, top: 0.19, width: 0.92, height: 0.4 },
  supportBand: { left: 0.08, top: 0.73, width: 0.84, height: 0.16 },
  cardGutters: [
    { left: 0.05, top: 0.86, width: 0.43, height: 0.12 },
    { left: 0.52, top: 0.86, width: 0.43, height: 0.12 },
  ],
  keepOutRects: [
    { left: 0.04, top: 0.018, width: 0.92, height: 0.075 },
    { left: 0.19, top: 0.87, width: 0.62, height: 0.1 },
  ],
};

export const HERO_LAYOUT_SPECS: Readonly<Record<CompositionLayout, HeroLayoutSpec>> = {
  wide: wideLayout,
  compact: compactLayout,
};

/** Retained for older diagnostics; new layout-aware code reads `stage` from `HERO_LAYOUT_SPECS`. */
export const COMPOSITION_SAFE_FRAME = {
  x: wideLayout.stage.halfWidth,
  y: wideLayout.stage.halfHeight,
} as const;

export function heroLayoutFor(layout: CompositionLayout): HeroLayoutSpec {
  return HERO_LAYOUT_SPECS[layout];
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

/** One source of truth for both Three.js framing and the DOM layout bands. */
export function publishHeroLayoutCss(host: HTMLElement, layout: CompositionLayout): void {
  const spec = heroLayoutFor(layout);
  const setRect = (prefix: string, rect: NormalizedDomRect): void => {
    host.style.setProperty(`--${prefix}-left`, percent(rect.left));
    host.style.setProperty(`--${prefix}-top`, percent(rect.top));
    host.style.setProperty(`--${prefix}-width`, percent(rect.width));
    host.style.setProperty(`--${prefix}-height`, percent(rect.height));
  };

  host.dataset.heroLayout = layout;
  host.style.setProperty('--stage-center-x', String(spec.stage.centerX));
  host.style.setProperty('--stage-center-y', String(spec.stage.centerY));
  host.style.setProperty('--stage-half-width', String(spec.stage.halfWidth));
  host.style.setProperty('--stage-half-height', String(spec.stage.halfHeight));
  setRect('nav-band', spec.navBand);
  setRect('headline-band', spec.headlineBand);
  setRect('support-band', spec.supportBand);
  setRect('card-left', spec.cardGutters[0]);
  setRect('card-right', spec.cardGutters[1]);
}
