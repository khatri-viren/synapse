import type { Vector3Tuple } from '../scene/compositionSpec';
import { BADGE_ACTOR_STAGGER_SECONDS } from '../scene/ChoreographyTimeline';
import type { LogoId, QualityTier } from '../scene/types';
import { qualityProfileFor } from '../scene/qualityProfiles';

export interface ConnectionRouteSpec {
  id: LogoId;
  routeOffset: Vector3Tuple;
  activationDelay: number;
  packetPhase: number;
}

export const CONNECTION_MAX_SAMPLES = 48;
export const CONNECTION_DASH_RATIO = 0.56;
export const NETWORK_WIRE_COLOR = '#58bfe8';
export const PACKET_DASH_LENGTH_U = 0.035;
export const PACKET_SPEED_U_PER_SECOND = 0.36;

export const CONNECTION_ROUTE_SPECS: readonly ConnectionRouteSpec[] = [
  {
    id: 'instagram',
    routeOffset: [0.18, 0.34, 0.3],
    activationDelay: 0,
    packetPhase: 0,
  },
  {
    id: 'facebook',
    routeOffset: [-0.28, 0.24, -0.22],
    activationDelay: BADGE_ACTOR_STAGGER_SECONDS,
    packetPhase: 0.12,
  },
  {
    id: 'shopify',
    routeOffset: [0.38, -0.02, 0.26],
    activationDelay: BADGE_ACTOR_STAGGER_SECONDS * 2,
    packetPhase: 0.24,
  },
  {
    id: 'slack',
    routeOffset: [-0.34, -0.28, -0.26],
    activationDelay: BADGE_ACTOR_STAGGER_SECONDS * 3,
    packetPhase: 0.36,
  },
  {
    id: 'whatsapp',
    routeOffset: [0.16, -0.38, 0.2],
    activationDelay: BADGE_ACTOR_STAGGER_SECONDS * 4,
    packetPhase: 0.48,
  },
] as const;

export function connectionSampleCountForQuality(quality: QualityTier): number {
  return qualityProfileFor(quality).connectionSamples;
}

export function packetCountForQuality(quality: QualityTier): number {
  return qualityProfileFor(quality).packetsPerLink;
}
