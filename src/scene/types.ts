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
  compositionLayout: 'wide' | 'compact';
  cameraPosition: { x: number; y: number; z: number };
  pointerStrength: number;
  message: string;
}

export interface SceneDebugSnapshot {
  groups: string[];
  compositionLayout: 'wide' | 'compact';
  visibility: {
    brainProxy: boolean;
    badgeMarkers: boolean;
  };
  safeFrame: { x: number; y: number };
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    aspect: number;
    fov: number;
    near: number;
    far: number;
  };
  pointer: {
    ndc: { x: number; y: number };
    strength: number;
    enabled: boolean;
  };
  supportFit: {
    allInFront: boolean;
    insideSafeFrame: boolean;
    insideViewport: boolean;
    maxAbsX: number;
    maxAbsY: number;
  };
  markers: Array<{
    id: LogoId;
    direction: 'inbound';
    depthRole: 'front' | 'behind';
    world: { x: number; y: number; z: number };
    ndc: { x: number; y: number; z: number };
    insideViewport: boolean;
  }>;
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
