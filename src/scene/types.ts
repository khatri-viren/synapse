export const LOGO_IDS = ['instagram', 'facebook', 'shopify', 'slack', 'whatsapp'] as const;

export type LogoId = (typeof LOGO_IDS)[number];

export type QualityTier = 'desktop' | 'mobile' | 'reduced-motion' | 'fallback';

export type QualityOverride = 'auto' | Exclude<QualityTier, 'fallback'>;

export type RendererPreference = 'auto' | 'webgl';

export type RendererBackend = 'initializing' | 'webgpu' | 'webgl' | 'fallback';

export type IntroPhase = 'brain-scan' | 'badge-arrival' | 'link-activation' | 'ambient';

export type RuntimePhase = 'initializing' | 'ready' | 'suspended' | 'fallback' | 'disposed';

export interface SceneState {
  elapsedSeconds: number;
  quality: QualityTier;
  introPhase: IntroPhase;
  pointerNdc: { x: number; y: number };
  pointerStrength: number;
}

export interface RuntimeDiagnostics {
  backend: RendererBackend;
  rendererPreference: RendererPreference;
  quality: QualityTier;
  introPhase: IntroPhase;
  runtimePhase: RuntimePhase;
  isPaused: boolean;
  isDocumentHidden: boolean;
  frameP95Ms: number | null;
  message: string;
}

export const RESERVED_DEBUG_FEATURES = [
  'brainFill',
  'primaryWires',
  'ghostWires',
  'badgeSockets',
  'brainAnchors',
  'connections',
  'packets',
  'bloom',
] as const;

export type ReservedDebugFeature = (typeof RESERVED_DEBUG_FEATURES)[number];
