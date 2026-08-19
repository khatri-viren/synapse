import type { QualityTier } from './types';

export interface QualityProfile {
  dprCap: number;
  connectionSamples: number;
  packetsPerLink: number;
  ghostWires: boolean;
  pointerParallax: boolean;
  continuousAnimation: boolean;
  frameBudgetMs: number | null;
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    smoothWidth: number;
    resolutionScale: number;
  };
}

const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  desktop: {
    dprCap: 1.75,
    connectionSamples: 48,
    packetsPerLink: 2,
    ghostWires: true,
    pointerParallax: true,
    continuousAnimation: true,
    frameBudgetMs: 1000 / 60,
    bloom: {
      enabled: true,
      strength: 0.36,
      radius: 0.22,
      threshold: 0.38,
      smoothWidth: 0.22,
      resolutionScale: 0.35,
    },
  },
  mobile: {
    dprCap: 1,
    connectionSamples: 32,
    packetsPerLink: 1,
    ghostWires: false,
    pointerParallax: false,
    continuousAnimation: true,
    frameBudgetMs: 1000 / 30,
    bloom: {
      enabled: true,
      strength: 0.26,
      radius: 0.2,
      threshold: 0.42,
      smoothWidth: 0.2,
      resolutionScale: 0.35,
    },
  },
  'reduced-motion': {
    dprCap: 1,
    connectionSamples: 32,
    packetsPerLink: 0,
    ghostWires: false,
    pointerParallax: false,
    continuousAnimation: false,
    frameBudgetMs: null,
    bloom: {
      enabled: true,
      strength: 0.2,
      radius: 0.18,
      threshold: 0.44,
      smoothWidth: 0.18,
      resolutionScale: 0.35,
    },
  },
  fallback: {
    dprCap: 1,
    connectionSamples: 0,
    packetsPerLink: 0,
    ghostWires: false,
    pointerParallax: false,
    continuousAnimation: false,
    frameBudgetMs: null,
    bloom: {
      enabled: false,
      strength: 0,
      radius: 0,
      threshold: 1,
      smoothWidth: 0,
      resolutionScale: 0.25,
    },
  },
};

export function qualityProfileFor(quality: QualityTier): QualityProfile {
  return QUALITY_PROFILES[quality];
}
