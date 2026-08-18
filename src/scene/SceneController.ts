import {
  Color,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu';

import { DiagnosticRig } from './DiagnosticRig';
import type {
  IntroPhase,
  QualityTier,
  RendererBackend,
  RendererPreference,
  RuntimeDiagnostics,
  RuntimePhase,
  SceneState,
} from './types';

const CANVAS_BACKGROUND = new Color('#05060c');
const FRAME_SAMPLE_CAPACITY = 180;
const DIAGNOSTIC_INTERVAL_MS = 250;
const DIAGNOSTIC_HALF_EXTENT = 1.9;
const CAMERA_VERTICAL_FOV_DEGREES = 42;

const INTRO_TIMELINE: ReadonlyArray<{ until: number; phase: IntroPhase }> = [
  { until: 1.25, phase: 'brain-scan' },
  { until: 2.05, phase: 'badge-arrival' },
  { until: 2.85, phase: 'link-activation' },
  { until: Number.POSITIVE_INFINITY, phase: 'ambient' },
];

type RendererBackendProbe = {
  isWebGPUBackend?: boolean;
};

type NavigatorWithWebGPU = Navigator & {
  gpu?: {
    requestAdapter?: () => Promise<unknown | null>;
  };
};

export interface SceneControllerOptions {
  canvas: HTMLCanvasElement;
  rendererPreference: RendererPreference;
  initialQuality: QualityTier;
  onDiagnostics?: (diagnostics: RuntimeDiagnostics) => void;
}

function introPhaseFor(elapsedSeconds: number): IntroPhase {
  return INTRO_TIMELINE.find(({ until }) => elapsedSeconds < until)?.phase ?? 'ambient';
}

function clampDelta(deltaMs: number): number {
  return Math.min(Math.max(deltaMs, 0), 50);
}

function percentile95(samples: readonly number[]): number | null {
  if (samples.length < 10) {
    return null;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return Number(sorted[index]?.toFixed(1));
}

/**
 * The single owner of renderer setup, the frame loop, resize, tab visibility and disposal.
 * Later scene systems publish data into this controller; they do not create their own loops.
 */
export class SceneController {
  readonly state: SceneState;

  private readonly canvas: HTMLCanvasElement;
  private readonly rendererPreference: RendererPreference;
  private readonly onDiagnostics?: (diagnostics: RuntimeDiagnostics) => void;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_VERTICAL_FOV_DEGREES, 1, 0.1, 100);
  private readonly diagnosticRig = new DiagnosticRig();
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly frameSamples: number[] = [];

  private renderer: WebGPURenderer | null = null;
  private backend: RendererBackend = 'initializing';
  private runtimePhase: RuntimePhase = 'initializing';
  private started = false;
  private disposed = false;
  private manuallyPaused = false;
  private forcedIntroPhase: IntroPhase | null = null;
  private lastFrameTimestamp: number | null = null;
  private lastDiagnosticsTimestamp = 0;
  private runtimeMessage = 'Initializing renderer…';
  private readonly startingQuality: QualityTier;

  constructor(options: SceneControllerOptions) {
    this.canvas = options.canvas;
    this.rendererPreference = options.rendererPreference;
    this.onDiagnostics = options.onDiagnostics;
    this.startingQuality = options.initialQuality;
    this.state = {
      elapsedSeconds: 0,
      quality: options.initialQuality,
      introPhase: 'brain-scan',
      pointerNdc: { x: 0, y: 0 },
      pointerStrength: 0,
    };

    this.camera.position.set(0, 0, 4);
    this.camera.lookAt(0, 0, 0);
    this.scene.background = CANVAS_BACKGROUND;
    this.scene.add(this.diagnosticRig.root);

    window.addEventListener('resize', this.handleResize, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) {
      return;
    }

    if (!(await this.hasViableGraphicsBackend())) {
      this.enterStaticFallback(
        new Error(
          this.rendererPreference === 'webgl'
            ? 'WebGL2 is unavailable in this browser.'
            : 'Neither WebGPU nor WebGL2 is available in this browser.',
        ),
      );
      return;
    }

    const renderer = new WebGPURenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: this.state.quality === 'desktop',
      depth: true,
      forceWebGL: this.rendererPreference === 'webgl',
    });

    this.renderer = renderer;
    renderer.setClearColor(CANVAS_BACKGROUND, 1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;

    try {
      this.applySize();
      await renderer.init();

      if (this.disposed) {
        renderer.dispose();
        return;
      }

      this.backend = (renderer.backend as RendererBackendProbe).isWebGPUBackend === true ? 'webgpu' : 'webgl';
      this.runtimePhase = 'ready';
      this.runtimeMessage =
        this.backend === 'webgpu'
          ? 'WebGPU backend initialized.'
          : 'WebGL2 backend initialized through WebGPURenderer.';
      this.started = true;
      this.renderOnce();
      await this.syncAnimationLoop();
      this.publishDiagnostics(true);
    } catch (error) {
      this.enterStaticFallback(error);
    }
  }

  setQualityTier(quality: QualityTier): void {
    if (this.disposed || this.state.quality === quality) {
      return;
    }

    this.state.quality = quality;
    this.applySize();
    this.renderOnce();
    void this.syncAnimationLoop();
    this.publishDiagnostics(true);
  }

  setIntroPhase(phase: IntroPhase): void {
    this.forcedIntroPhase = phase;
    this.state.introPhase = phase;
    this.renderOnce();
    this.publishDiagnostics(true);
  }

  replayIntro(): void {
    this.forcedIntroPhase = null;
    this.state.elapsedSeconds = 0;
    this.state.introPhase = 'brain-scan';
    this.lastFrameTimestamp = null;
    this.renderOnce();
    void this.syncAnimationLoop();
    this.publishDiagnostics(true);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.manuallyPaused === paused) {
      return;
    }

    this.manuallyPaused = paused;
    this.runtimePhase = paused ? 'suspended' : 'ready';
    this.lastFrameTimestamp = null;
    this.renderOnce();
    void this.syncAnimationLoop();
    this.publishDiagnostics(true);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.runtimePhase = 'disposed';
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.reducedMotionQuery.removeEventListener('change', this.handleReducedMotionChange);

    if (this.renderer !== null && this.started) {
      void this.renderer.setAnimationLoop(null);
    }

    if (this.renderer !== null) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.diagnosticRig.dispose();
    this.publishDiagnostics(true);
  }

  private readonly handleResize = (): void => {
    this.applySize();
    this.renderOnce();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) {
      return;
    }

    this.runtimePhase = document.hidden ? 'suspended' : this.manuallyPaused ? 'suspended' : 'ready';
    this.lastFrameTimestamp = null;
    void this.syncAnimationLoop();
    this.publishDiagnostics(true);
  };

  private readonly handleReducedMotionChange = (): void => {
    if (this.disposed) {
      return;
    }

    this.setQualityTier(this.reducedMotionQuery.matches ? 'reduced-motion' : this.startingQuality);
  };

  private readonly renderFrame = (timestamp: number): void => {
    if (this.disposed || !this.shouldAnimate()) {
      return;
    }

    const deltaMs = this.lastFrameTimestamp === null ? 0 : clampDelta(timestamp - this.lastFrameTimestamp);
    this.lastFrameTimestamp = timestamp;
    this.state.elapsedSeconds += deltaMs / 1_000;
    this.state.introPhase = this.forcedIntroPhase ?? introPhaseFor(this.state.elapsedSeconds);

    if (deltaMs > 0) {
      this.frameSamples.push(deltaMs);
      if (this.frameSamples.length > FRAME_SAMPLE_CAPACITY) {
        this.frameSamples.shift();
      }
    }

    this.renderCurrentState();
    this.publishDiagnostics(false, timestamp);
  };

  private shouldAnimate(): boolean {
    return (
      this.started &&
      !this.disposed &&
      !this.manuallyPaused &&
      !document.hidden &&
      this.state.quality !== 'reduced-motion' &&
      this.runtimePhase !== 'fallback'
    );
  }

  private async syncAnimationLoop(): Promise<void> {
    if (this.renderer === null || this.disposed || !this.started) {
      return;
    }

    await this.renderer.setAnimationLoop(this.shouldAnimate() ? this.renderFrame : null);
  }

  private applySize(): void {
    if (this.renderer === null) {
      return;
    }

    const { width, height } = this.canvas.getBoundingClientRect();
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    const pixelRatioCap = this.state.quality === 'desktop' ? 1.75 : 1;
    const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), pixelRatioCap);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.camera.aspect = safeWidth / safeHeight;
    const halfFovRadians = (CAMERA_VERTICAL_FOV_DEGREES * Math.PI) / 360;
    const tanHalfFov = Math.tan(halfFovRadians);
    const distanceForHeight = DIAGNOSTIC_HALF_EXTENT / tanHalfFov;
    const distanceForWidth = DIAGNOSTIC_HALF_EXTENT / (tanHalfFov * this.camera.aspect);
    this.camera.position.z = Math.max(4, distanceForHeight, distanceForWidth);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private async hasViableGraphicsBackend(): Promise<boolean> {
    const probe = document.createElement('canvas');
    const webgl2Context = probe.getContext('webgl2');

    if (webgl2Context !== null) {
      return true;
    }

    if (this.rendererPreference === 'webgl') {
      return false;
    }

    const requestAdapter = (navigator as NavigatorWithWebGPU).gpu?.requestAdapter;

    if (requestAdapter === undefined) {
      return false;
    }

    try {
      return (await requestAdapter.call((navigator as NavigatorWithWebGPU).gpu)) !== null;
    } catch {
      return false;
    }
  }

  private renderOnce(): void {
    if (!this.started || this.renderer === null || this.runtimePhase === 'fallback') {
      return;
    }

    this.renderCurrentState();
  }

  private renderCurrentState(): void {
    if (this.renderer === null) {
      return;
    }

    this.diagnosticRig.update(
      this.state.elapsedSeconds,
      this.state.introPhase,
      this.shouldAnimate(),
    );
    this.renderer.render(this.scene, this.camera);
  }

  private enterStaticFallback(error: unknown): void {
    this.backend = 'fallback';
    this.runtimePhase = 'fallback';
    this.runtimeMessage = error instanceof Error ? error.message : 'Graphics renderer could not initialize.';

    if (this.renderer !== null && this.started) {
      void this.renderer.setAnimationLoop(null);
    }

    if (this.renderer !== null) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.publishDiagnostics(true);
  }

  private publishDiagnostics(force: boolean, timestamp = performance.now()): void {
    if (!force && timestamp - this.lastDiagnosticsTimestamp < DIAGNOSTIC_INTERVAL_MS) {
      return;
    }

    this.lastDiagnosticsTimestamp = timestamp;
    this.onDiagnostics?.({
      backend: this.backend,
      rendererPreference: this.rendererPreference,
      quality: this.state.quality,
      introPhase: this.state.introPhase,
      runtimePhase: this.runtimePhase,
      isPaused: this.manuallyPaused,
      isDocumentHidden: document.hidden,
      frameP95Ms: percentile95(this.frameSamples),
      message: this.runtimeMessage,
    });
  }
}
