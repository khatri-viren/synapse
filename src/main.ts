import './styles.css';

import { DebugPanel } from './debug/DebugPanel';
import { SceneController } from './scene/SceneController';
import type {
  QualityOverride,
  QualityTier,
  RendererPreference,
  RuntimeDiagnostics,
} from './scene/types';

type LaunchOptions = {
  debugEnabled: boolean;
  rendererPreference: RendererPreference;
  qualityOverride: QualityOverride;
};

function readLaunchOptions(): LaunchOptions {
  const query = new URLSearchParams(window.location.search);
  const debugEnabled = query.get('debug') === '1';
  const renderer = query.get('renderer');
  const quality = query.get('quality');

  return {
    debugEnabled,
    rendererPreference: debugEnabled && renderer === 'webgl' ? 'webgl' : 'auto',
    qualityOverride:
      debugEnabled && (quality === 'desktop' || quality === 'mobile' || quality === 'reduced-motion')
        ? quality
        : 'auto',
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

if (app === null || canvas === null || fallback === null) {
  throw new Error('Phase 0 application shell could not be initialized.');
}

const launch = readLaunchOptions();
let debugPanel: DebugPanel | null = null;
let latestDiagnostics: RuntimeDiagnostics | null = null;

const updateRuntimePresentation = (diagnostics: RuntimeDiagnostics): void => {
  latestDiagnostics = diagnostics;
  const fallbackVisible = diagnostics.runtimePhase === 'fallback';
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

const controller = new SceneController({
  canvas,
  rendererPreference: launch.rendererPreference,
  initialQuality: resolveInitialQuality(launch.qualityOverride),
  onDiagnostics: updateRuntimePresentation,
});

if (launch.debugEnabled) {
  debugPanel = new DebugPanel(app, {
    rendererPreference: launch.rendererPreference,
    qualityOverride: launch.qualityOverride,
    actions: {
      onRendererPreference: (preference) => replaceDebugQueryParameter('renderer', preference),
      onQualityOverride: (quality) => replaceDebugQueryParameter('quality', quality),
      onIntroPhase: (phase) => controller.setIntroPhase(phase),
      onReplay: () => controller.replayIntro(),
      onPausedChange: (paused) => controller.setPaused(paused),
    },
  });

  if (latestDiagnostics !== null) {
    debugPanel.update(latestDiagnostics);
  }
}

void controller.start();

const dispose = (): void => {
  controller.dispose();
  debugPanel?.dispose();
};

window.addEventListener('pagehide', dispose, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
