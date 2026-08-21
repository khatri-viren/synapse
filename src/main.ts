import './styles.css';
import './ui/hero-nav.css';

import { DebugPanel } from './debug/DebugPanel';
import { SceneController } from './scene/SceneController';
import { HeroUI } from './ui/HeroUI';
import type { CompositionLayout } from './scene/compositionSpec';
import type {
  QualityOverride,
  QualityTier,
  RendererPreference,
  RuntimeDiagnostics,
  SceneDebugSnapshot,
} from './scene/types';

declare global {
  interface Window {
    __NEURAL_DEBUG__?: () => SceneDebugSnapshot;
  }
}

type LaunchOptions = {
  debugEnabled: boolean;
  rendererPreference: RendererPreference;
  qualityOverride: QualityOverride;
  layoutOverride: CompositionLayout | null;
};

function readLaunchOptions(): LaunchOptions {
  const query = new URLSearchParams(window.location.search);
  const debugEnabled = query.get('debug') === '1';
  const renderer = query.get('renderer');
  const quality = query.get('quality');
  const layout = query.get('layout');

  return {
    debugEnabled,
    rendererPreference:
      debugEnabled && (renderer === 'webgl' || renderer === 'fallback') ? renderer : 'auto',
    qualityOverride:
      debugEnabled && (quality === 'desktop' || quality === 'mobile' || quality === 'reduced-motion')
        ? quality
        : 'auto',
    layoutOverride: debugEnabled && (layout === 'wide' || layout === 'compact') ? layout : null,
  };
}

function resolveInitialQuality(override: QualityOverride): QualityTier {
  if (override !== 'auto') {
    return override;
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'reduced-motion';
  }

  if (window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) {
    return 'mobile';
  }

  return 'desktop';
}

function replaceDebugQueryParameter(key: 'renderer' | 'quality', value: string): void {
  const url = new URL(window.location.href);

  if (value === 'auto') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  url.searchParams.set('debug', '1');
  window.location.assign(url.toString());
}

const app = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas');
const fallback = document.querySelector<HTMLElement>('#renderer-fallback');
const heroScroll = document.querySelector<HTMLElement>('#hero-scroll');
const heroStage = document.querySelector<HTMLElement>('#hero-stage');

if (app === null || canvas === null || fallback === null || heroScroll === null || heroStage === null) {
  throw new Error('Neural composition application shell could not be initialized.');
}

const launch = readLaunchOptions();
let debugPanel: DebugPanel | null = null;
let latestDiagnostics: RuntimeDiagnostics | null = null;
let controller: SceneController | null = null;
const heroUi = new HeroUI(heroStage, () => controller?.replayIntro());

const updateRuntimePresentation = (diagnostics: RuntimeDiagnostics): void => {
  latestDiagnostics = diagnostics;
  const fallbackVisible = diagnostics.runtimePhase === 'fallback';
  heroStage.classList.toggle('is-renderer-fallback', fallbackVisible);
  fallback.hidden = !fallbackVisible;
  if (fallbackVisible) {
    canvas.setAttribute('aria-hidden', 'true');
  } else {
    canvas.removeAttribute('aria-hidden');
  }
  canvas.setAttribute(
    'aria-label',
    fallbackVisible
      ? 'Interactive neural-network scene unavailable'
      : `Interactive neural-network scene running with ${diagnostics.backend.toUpperCase()}`,
  );
  debugPanel?.update(diagnostics);
};

controller = new SceneController({
  canvas,
  rendererPreference: launch.rendererPreference,
  initialQuality: resolveInitialQuality(launch.qualityOverride),
  layoutOverride: launch.layoutOverride,
  heroElement: heroScroll,
  screenBridgeHost: heroStage,
  onFrameState: (state) => heroUi.update(state),
  onDiagnostics: updateRuntimePresentation,
});

if (launch.debugEnabled) {
  debugPanel = new DebugPanel(app, {
    rendererPreference: launch.rendererPreference,
    qualityOverride: launch.qualityOverride,
    actions: {
      onRendererPreference: (preference) => replaceDebugQueryParameter('renderer', preference),
      onQualityOverride: (quality) => replaceDebugQueryParameter('quality', quality),
      onIntroPhase: (phase) => controller?.setIntroPhase(phase),
      onReplay: () => controller?.replayIntro(),
      onPausedChange: (paused) => controller?.setPaused(paused),
      onBrainFillVisibility: (visible) => controller?.setBrainFillVisible(visible),
      onPrimaryWiresVisibility: (visible) => controller?.setPrimaryWiresVisible(visible),
      onGhostWiresVisibility: (visible) => controller?.setGhostWiresVisible(visible),
      onBrainAnchorsVisibility: (visible) => controller?.setBrainAnchorsVisible(visible),
      onWireEnergyNodesVisibility: (visible) => controller?.setWireEnergyNodesVisible(visible),
      onBadgeActorsVisibility: (visible) => controller?.setBadgeActorsVisible(visible),
      onBadgeSocketsVisibility: (visible) => controller?.setBadgeSocketsVisible(visible),
      onBadgeOrbitGuidesVisibility: (visible) => controller?.setBadgeOrbitGuidesVisible(visible),
      onConnectionsVisibility: (visible) => controller?.setConnectionsVisible(visible),
      onPacketsVisibility: (visible) => controller?.setPacketsVisible(visible),
      onAtmosphereVisibility: (visible) => controller?.setAtmosphereVisible(visible),
      onBloomVisibility: (visible) => controller?.setBloomEnabled(visible),
    },
  });

  window.__NEURAL_DEBUG__ = () => {
    if (controller === null) throw new Error('Scene controller is unavailable.');
    return controller.getDebugSnapshot();
  };

  if (latestDiagnostics !== null) {
    debugPanel.update(latestDiagnostics);
  }
}

void controller.start();

const dispose = (): void => {
  delete window.__NEURAL_DEBUG__;
  controller?.dispose();
  heroUi.dispose();
  debugPanel?.dispose();
};

window.addEventListener('pagehide', dispose, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
