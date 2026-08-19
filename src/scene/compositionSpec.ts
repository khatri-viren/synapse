import type { LogoId } from './types';

export type CompositionLayout = 'wide' | 'compact';

export type MarkerDepthRole = 'front' | 'behind';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface BadgeMarkerSpec {
  id: LogoId;
  label: string;
  color: string;
  depthRole: MarkerDepthRole;
  direction: 'inbound';
  positions: Record<CompositionLayout, Vector3Tuple>;
}

export const COMPOSITION_SAFE_FRAME = {
  x: 0.78,
  y: 0.78,
} as const;

export const BRAIN_PROXY_BOUNDS = {
  min: [-1.34, -1.48, -0.76] as Vector3Tuple,
  max: [1.34, 1.35, 0.76] as Vector3Tuple,
} as const;

export const BADGE_MARKER_RADIUS = 0.34;

export const BADGE_MARKER_SPECS: readonly BadgeMarkerSpec[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#ff4ecb',
    depthRole: 'front',
    direction: 'inbound',
    positions: {
      wide: [2.35, 1.48, 0.74],
      compact: [1.02, 2.02, 0.74],
    },
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#4c8dff',
    depthRole: 'behind',
    direction: 'inbound',
    positions: {
      wide: [-2.4, 1.18, -0.68],
      compact: [-1.04, 1.24, -0.68],
    },
  },
  {
    id: 'shopify',
    label: 'Shopify',
    color: '#95d85b',
    depthRole: 'behind',
    direction: 'inbound',
    positions: {
      wide: [2.45, -0.48, -0.54],
      compact: [1.12, 0.38, -0.54],
    },
  },
  {
    id: 'slack',
    label: 'Slack',
    color: '#b278ff',
    depthRole: 'front',
    direction: 'inbound',
    positions: {
      wide: [-2.35, -1.28, 0.6],
      compact: [-1.06, -1.14, 0.6],
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25d366',
    depthRole: 'front',
    direction: 'inbound',
    positions: {
      wide: [0.82, -1.98, 0.82],
      compact: [0.68, -2.02, 0.82],
    },
  },
] as const;
