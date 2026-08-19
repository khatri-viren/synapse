export type CompositionLayout = 'wide' | 'compact';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export const COMPOSITION_SAFE_FRAME = {
  x: 0.78,
  y: 0.78,
} as const;
