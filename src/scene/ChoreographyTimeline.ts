import type { IntroPhase } from './types';

export interface ChoreographyBeat {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

function beat(start: number, end: number): ChoreographyBeat {
  return { start, end, duration: end - start };
}

/**
 * The single authoritative network-boot schedule. All visual systems sample
 * these seconds directly; none advances an independent phase clock.
 */
export const CHOREOGRAPHY_TIMELINE = {
  brainScan: beat(0, 1.25),
  badgeArrival: beat(0.85, 2.05),
  linkActivation: beat(1.55, 2.85),
  ambientStart: 2.85,
} as const;

export const INTRO_CHECKPOINT_SECONDS: Readonly<Record<IntroPhase, number>> = {
  'brain-scan': 0.62,
  'badge-arrival': 1.25,
  'link-activation': 2.05,
  ambient: CHOREOGRAPHY_TIMELINE.ambientStart,
};

export function introPhaseFor(elapsedSeconds: number): IntroPhase {
  if (elapsedSeconds < CHOREOGRAPHY_TIMELINE.brainScan.end) {
    return 'brain-scan';
  }
  if (elapsedSeconds < CHOREOGRAPHY_TIMELINE.badgeArrival.end) {
    return 'badge-arrival';
  }
  if (elapsedSeconds < CHOREOGRAPHY_TIMELINE.linkActivation.end) {
    return 'link-activation';
  }
  return 'ambient';
}

export function normalizedBeatProgress(elapsedSeconds: number, beatSpec: ChoreographyBeat): number {
  return Math.min(Math.max((elapsedSeconds - beatSpec.start) / beatSpec.duration, 0), 1);
}
