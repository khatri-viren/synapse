import type { CompositionLayout, Vector3Tuple } from '../scene/compositionSpec';
import type { LogoId } from '../scene/types';

export type OrbitLayoutSpec = {
  center: Vector3Tuple;
  radiusX: number;
  radiusY: number;
  rotation: Vector3Tuple;
};

export interface BadgeOrbitSpec {
  id: LogoId;
  label: string;
  plateColor: string;
  accentColor: string;
  angularSpeed: number;
  phaseOffset: number;
  orbitDirection: 1 | -1;
  authoredTilt: Vector3Tuple;
  layouts: Record<CompositionLayout, OrbitLayoutSpec>;
}

export const BADGE_ACTOR_RADIUS = 0.42;

export const BADGE_ORBIT_SPECS: readonly BadgeOrbitSpec[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    plateColor: '#b51e7d',
    accentColor: '#ff4ecb',
    angularSpeed: 0.22,
    phaseOffset: -0.16975,
    orbitDirection: 1,
    authoredTilt: [0.08, -0.12, 0.035],
    layouts: {
      wide: {
        center: [0, 0.04, 0],
        radiusX: 2.65,
        radiusY: 2.75,
        rotation: [1.05, -0.2, 0.89],
      },
      compact: {
        center: [0, 0.02, 0],
        radiusX: 1.72,
        radiusY: 3.2,
        rotation: [1.15, -0.08, 0.344],
      },
    },
  },
  {
    id: 'facebook',
    label: 'Facebook',
    plateColor: '#1557c7',
    accentColor: '#4c8dff',
    angularSpeed: 0.22,
    phaseOffset: 1.416,
    orbitDirection: -1,
    authoredTilt: [-0.055, 0.1, -0.045],
    layouts: {
      wide: {
        center: [-0.04, 0.08, 0],
        radiusX: 2.8,
        radiusY: 2.85,
        rotation: [-1.15, 0.25, 0.595],
      },
      compact: {
        center: [-0.03, 0.05, 0],
        radiusX: 1.74,
        radiusY: 3.2,
        rotation: [-1.15, 0.1, -0.245],
      },
    },
  },
  {
    id: 'shopify',
    label: 'Shopify',
    plateColor: '#4f7f31',
    accentColor: '#95d85b',
    angularSpeed: 0.22,
    phaseOffset: 5.30175,
    orbitDirection: -1,
    authoredTilt: [0.065, -0.08, 0.05],
    layouts: {
      wide: {
        center: [0.06, -0.02, 0],
        radiusX: 2.72,
        radiusY: 2.8,
        rotation: [1.08, -0.35, -0.58],
      },
      compact: {
        center: [0.04, 0, 0],
        radiusX: 1.8,
        radiusY: 3.2,
        rotation: [1.15, 0.06, -0.48],
      },
    },
  },
  {
    id: 'slack',
    label: 'Slack',
    plateColor: '#4a154b',
    accentColor: '#b278ff',
    angularSpeed: 0.22,
    phaseOffset: 4.57,
    orbitDirection: 1,
    authoredTilt: [-0.07, 0.11, -0.04],
    layouts: {
      wide: {
        center: [-0.05, -0.06, 0],
        radiusX: 2.6,
        radiusY: 2.85,
        rotation: [-0.45, 0.75, 1.25],
      },
      compact: {
        center: [-0.04, -0.03, 0],
        radiusX: 1.82,
        radiusY: 3.26,
        rotation: [-0.55, 0.65, 1.1],
      },
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    plateColor: '#168448',
    accentColor: '#25d366',
    angularSpeed: 0.22,
    phaseOffset: 4.02325,
    orbitDirection: 1,
    authoredTilt: [0.045, 0.075, -0.035],
    layouts: {
      wide: {
        center: [0.04, -0.08, 0],
        radiusX: 2.45,
        radiusY: 2.85,
        rotation: [-1.22, -0.1, -0.82],
      },
      compact: {
        center: [0.02, -0.06, 0],
        radiusX: 1.74,
        radiusY: 3.24,
        rotation: [-1.15, 0.09, 0.679],
      },
    },
  },
] as const;

export function getBadgeOrbitSpec(id: LogoId): BadgeOrbitSpec {
  const spec = BADGE_ORBIT_SPECS.find((candidate) => candidate.id === id);

  if (spec === undefined) {
    throw new Error(`Unknown badge orbit specification: ${id}`);
  }

  return spec;
}
