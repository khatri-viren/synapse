import type { BrainAnchorParam, LogoId, QualityTier } from '../scene/types';

export const BRAIN_SOURCE_REVISION = 'anatomical-brain-glb-v1';
export const BRAIN_SEED = 0x4e455552;
export const BRAIN_TARGET_HEIGHT = 2.55;
export const BRAIN_RUNTIME_URL = new URL(
  '../new_brain/runtime/Brain.runtime.glb',
  import.meta.url,
).href;

export interface BrainWireProfile {
  edgeThresholdDegrees: number;
  primarySegmentBudget: number;
  ghostSegmentBudget: number;
}

export interface BrainAnchorSpec extends BrainAnchorParam {
  id: LogoId;
  color: string;
}

const DESKTOP_WIRES: BrainWireProfile = {
  edgeThresholdDegrees: 12,
  primarySegmentBudget: 24_000,
  ghostSegmentBudget: 10_000,
};

const COMPACT_WIRES: BrainWireProfile = {
  edgeThresholdDegrees: 20,
  primarySegmentBudget: 10_000,
  ghostSegmentBudget: 0,
};

const REDUCED_MOTION_WIRES: BrainWireProfile = {
  edgeThresholdDegrees: 16,
  primarySegmentBudget: 14_000,
  ghostSegmentBudget: 0,
};

/**
 * Authored normalized front-view targets. The GLB loader resolves each target
 * to a stable source-mesh vertex and publishes that vertex as the attachment.
 */
export const BRAIN_ANCHOR_SPECS: readonly BrainAnchorSpec[] = [
  { id: 'instagram', hemisphere: 'right', x: 0.26, y: 0.48, color: '#ff4ecb' },
  { id: 'facebook', hemisphere: 'left', x: -0.58, y: 0.36, color: '#4c8dff' },
  { id: 'shopify', hemisphere: 'right', x: 0.63, y: 0.02, color: '#95d85b' },
  { id: 'slack', hemisphere: 'left', x: -0.55, y: -0.34, color: '#b278ff' },
  { id: 'whatsapp', hemisphere: 'right', x: 0.3, y: -0.5, color: '#25d366' },
] as const;

export function brainWireProfileForQuality(quality: QualityTier): BrainWireProfile {
  if (quality === 'desktop') return DESKTOP_WIRES;
  if (quality === 'reduced-motion') return REDUCED_MOTION_WIRES;
  return COMPACT_WIRES;
}
