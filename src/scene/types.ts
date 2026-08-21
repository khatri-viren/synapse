export const LOGO_IDS = ['instagram', 'facebook', 'shopify', 'slack', 'whatsapp'] as const;

export type LogoId = (typeof LOGO_IDS)[number];

export type QualityTier = 'desktop' | 'mobile' | 'reduced-motion' | 'fallback';

export type QualityOverride = 'auto' | Exclude<QualityTier, 'fallback'>;

export type RendererPreference = 'auto' | 'webgl' | 'fallback';

export type RendererBackend = 'initializing' | 'webgpu' | 'webgl' | 'fallback';

export type IntroPhase = 'brain-scan' | 'badge-arrival' | 'link-activation' | 'ambient';

export type BrainHemisphere = 'left' | 'right';

export interface BrainAnchorParam {
  hemisphere: BrainHemisphere;
  x: number;
  y: number;
}

export type RuntimePhase = 'initializing' | 'ready' | 'suspended' | 'fallback' | 'disposed';

export interface SceneState {
  elapsedSeconds: number;
  quality: QualityTier;
  introPhase: IntroPhase;
  pointerNdc: { x: number; y: number };
  pointerStrength: number;
  scrollProgress: number;
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
  frameBudgetMs: number | null;
  compositionLayout: 'wide' | 'compact';
  cameraPosition: { x: number; y: number; z: number };
  pointerStrength: number;
  brainTopology: string;
  badgeOrbits: string;
  networkLinks: string;
  imagePipeline: string;
  message: string;
}

export interface RenderPipelineDebugSnapshot {
  outputOwner: 'RenderPipeline' | 'static-fallback';
  scenePasses: number;
  hdrBuffer: 'half-float scene-linear' | 'none';
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    smoothWidth: number;
    resolutionScale: number;
  };
  exposure: number;
  toneMapping: 'Neutral' | 'none';
  outputColorSpace: 'sRGB';
  outputConversions: 1;
  temporalAA: false;
  dprCap: number;
  frameBudgetMs: number | null;
}

export interface BadgeRuntimeDebugSnapshot {
  id: LogoId;
  label: string;
  actorWorld: { x: number; y: number; z: number };
  socketWorld: { x: number; y: number; z: number };
  socketDistance: number;
  angularSpeed: number;
  phaseOffset: number;
  orbitPeriodSeconds: number;
  orbitInclination: number[];
  artworkSource: string;
  artworkSourceUrl: string;
  brandGuidanceUrl: string;
}

export interface BadgeScreenDebugSnapshot extends BadgeRuntimeDebugSnapshot {
  depthRole: 'front' | 'behind';
  actorNdc: { x: number; y: number; z: number };
  socketNdc: { x: number; y: number; z: number };
  insideViewport: boolean;
  insideSafeFrame: boolean;
  distanceFromBrain: number;
  nearestBadgeDistance: number;
}

export interface BadgeOrbitValidationSnapshot {
  sampleRateHz: number;
  sampleCount: number;
  sampleDurationSeconds: number;
  finitePositions: boolean;
  minimumBrainClearance: number;
  minimumBadgeClearance: number;
  minimumBrainClearanceAt: { badgeId: LogoId; elapsedSeconds: number };
  minimumBadgeClearanceAt: { badgeIds: [LogoId, LogoId]; elapsedSeconds: number };
  maximumSameSideCount: number;
  maximumBehindCount: number;
  maximumOccludedCount: number;
  maximumCloseGroupSize: number;
  minimumKeepOutSeparation: number | null;
  maximumKeepOutOverlapCount: number;
  limits: {
    sameSide: number;
    behind: number;
    occluded: number;
    closeGroup: number;
  };
  brainCollisionFree: boolean;
  badgeCollisionFree: boolean;
  keepOutSafe: boolean;
  distributionSafe: boolean;
}

export interface SceneDebugSnapshot {
  groups: string[];
  compositionLayout: 'wide' | 'compact';
  visibility: {
    brainFill: boolean;
    primaryWires: boolean;
    ghostWires: boolean;
    brainAnchors: boolean;
    wireEnergyNodes: boolean;
    badgeActors: boolean;
    badgeSockets: boolean;
    badgeOrbitGuides: boolean;
    connections: boolean;
    packets: boolean;
    atmosphere: boolean;
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
  brain: {
    assetState: 'loading' | 'ready' | 'error';
    sourceRevision: string;
    topologySignature: string;
    generationCount: number;
    quality: QualityTier;
    density: {
      edgeThresholdDegrees: number;
      primarySegmentBudget: number;
      ghostSegmentBudget: number;
    };
    sourceMeshCount: number;
    hemisphereCount: number;
    totalVertices: number;
    totalTriangles: number;
    primaryWireSegments: number;
    ghostWireSegments: number;
    effect: {
      mode: 'scan' | 'ambient' | 'reduced-static';
      scanProgress: number;
      scanRadius: number;
      maximumScanRadius: number;
      fillLag: number;
      scanOrigin: { x: number; y: number; z: number };
      selectedEnergySegments: number;
      energyNodesVisible: boolean;
      primaryDepthTest: boolean;
      ghostDepthTest: boolean;
      bloomRequired: false;
    };
    validation: {
      finitePositions: boolean;
      validIndices: boolean;
      nonDegenerateTriangles: boolean;
    };
    anchors: Array<{
      id: LogoId;
      binding: BrainAnchorParam;
      topologicalFeatureId: string;
      worldPosition: { x: number; y: number; z: number };
      worldNormal: { x: number; y: number; z: number };
      surfaceError: number;
    }>;
  };
  badgeOrbitValidation: BadgeOrbitValidationSnapshot;
  badges: BadgeScreenDebugSnapshot[];
  network: NetworkDebugSnapshot;
  atmosphere: {
    seed: number;
    particleCount: number;
    representation: 'immutable-spawn + analytic-vertex-TSL';
    depthTest: boolean;
    depthWrite: boolean;
    visible: boolean;
    fog: {
      branch: 'authored-local-depth-planes';
      spatialDomain: 'bounded-hero-stage';
      layerCount: number;
      layerDepths: number[];
      depthTest: true;
      depthWrite: false;
      densityProfile: 'brain-centered-flared-dome';
      animated: boolean;
      visible: boolean;
    };
  };
  rendering: RenderPipelineDebugSnapshot;
}

export interface NetworkLinkDebugSnapshot {
  id: LogoId;
  revision: number;
  sampleCount: number;
  reveal: number;
  startError: number;
  visibleEndError: number;
  anchorError: number | null;
  finitePositions: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}

export interface NetworkPacketDebugSnapshot {
  activeCount: number;
  maximumCount: number;
  configuredCountPerLink: number;
  direction: 'platform-to-brain';
  speedUPerSecond: number;
  depthTest: boolean;
  depthWrite: boolean;
  links: Array<{ id: LogoId; uValues: number[] }>;
}

export interface NetworkDebugSnapshot {
  links: NetworkLinkDebugSnapshot[];
  packets: NetworkPacketDebugSnapshot;
}

export const RESERVED_DEBUG_FEATURES = [] as const;

export type ReservedDebugFeature = (typeof RESERVED_DEBUG_FEATURES)[number];
