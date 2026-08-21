import type { IntroPhase } from './types';

export interface ChoreographyBeat {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

function beat(start: number, end: number): ChoreographyBeat {
  return { start, end, duration: end - start };
}

/** Shared cadence for each badge, its connector, and its inbound packets. */
export const BADGE_ACTOR_STAGGER_SECONDS = 0.16;

/**
 * The single authoritative network-boot schedule. All visual systems sample
 * these seconds directly; none advances an independent phase clock.
 */
export const CHOREOGRAPHY_TIMELINE = {
  // The brain entrance is deliberately sequential: establish the dark shell,
  // hand off, then assemble the permanent wire topology from both sides.
  brainFill: beat(0, 0.9),
  brainWireReveal: beat(0.96, 1.93),
  brainScan: beat(0, 1.93),
  // The scene headline and DOM heading join the wire assembly instead of
  // running as an unrelated page-load animation.
  headline: beat(0.96, 1.93),
  headerLineOne: beat(1.02, 1.92),
  headerLineTwo: beat(1.18, 2.08),
  badgeArrival: beat(0.85, 2.05),
  // The liquid shell and its four content actors share the five badge starts.
  navShell: beat(0.85, 1.75),
  navItemOne: beat(1.01, 1.91),
  navItemTwo: beat(1.17, 2.07),
  navItemThree: beat(1.33, 2.23),
  navCta: beat(1.49, 2.49),
  navGlint: beat(1.72, 2.42),
  nav: beat(0.85, 2.49),
  // Connections follow the same stagger as their badges, beginning 200ms
  // after each corresponding badge starts materializing.
  linkActivation: beat(1.05, 2.85),
  support: beat(1.72, 2.48),
  cards: beat(2.28, 3.12),
  atmosphere: beat(1.15, 2.85),
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
