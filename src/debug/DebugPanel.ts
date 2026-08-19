import {
  RESERVED_DEBUG_FEATURES,
  type IntroPhase,
  type QualityOverride,
  type RendererPreference,
  type RuntimeDiagnostics,
} from '../scene/types';
import { BADGE_MARKER_SPECS, COMPOSITION_SAFE_FRAME } from '../scene/compositionSpec';

export interface DebugPanelActions {
  onRendererPreference: (preference: RendererPreference) => void;
  onQualityOverride: (quality: QualityOverride) => void;
  onIntroPhase: (phase: IntroPhase) => void;
  onReplay: () => void;
  onPausedChange: (paused: boolean) => void;
  onBrainProxyVisibility: (visible: boolean) => void;
  onBadgeMarkersVisibility: (visible: boolean) => void;
}

export interface DebugPanelOptions {
  actions: DebugPanelActions;
  rendererPreference: RendererPreference;
  qualityOverride: QualityOverride;
}

const phaseOptions: ReadonlyArray<{ value: IntroPhase; label: string }> = [
  { value: 'brain-scan', label: 'Brain scan' },
  { value: 'badge-arrival', label: 'Badge arrival' },
  { value: 'link-activation', label: 'Link activation' },
  { value: 'ambient', label: 'Ambient' },
];

function getRequiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (element === null) {
    throw new Error(`Debug panel is missing ${selector}.`);
  }

  return element;
}

export class DebugPanel {
  private readonly element: HTMLElement;
  private readonly backendValue: HTMLElement;
  private readonly qualityValue: HTMLElement;
  private readonly phaseValue: HTMLElement;
  private readonly lifecycleValue: HTMLElement;
  private readonly frameValue: HTMLElement;
  private readonly layoutValue: HTMLElement;
  private readonly cameraValue: HTMLElement;
  private readonly pointerValue: HTMLElement;
  private readonly messageValue: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly safeFrameElement: HTMLElement;
  private isPaused = false;
  private isCollapsed = false;

  constructor(host: HTMLElement, options: DebugPanelOptions) {
    const { actions, rendererPreference, qualityOverride } = options;
    this.element = document.createElement('aside');
    this.element.className = 'debug-panel';
    this.element.setAttribute('aria-label', 'Phase 1 composition diagnostics');
    this.element.innerHTML = `
      <div class="debug-panel__header">
        <p>Phase 1</p>
        <span>Composition diagnostics</span>
        <button type="button" data-debug-collapse aria-expanded="true" aria-label="Collapse diagnostics">−</button>
      </div>
      <label>
        <span>Renderer</span>
        <select data-debug-renderer>
          <option value="auto">Auto (WebGPU → WebGL2)</option>
          <option value="webgl">Force WebGL2</option>
        </select>
      </label>
      <label>
        <span>Quality at start</span>
        <select data-debug-quality>
          <option value="auto">Auto</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="reduced-motion">Reduced motion</option>
        </select>
      </label>
      <label>
        <span>Timeline checkpoint</span>
        <select data-debug-phase>
          ${phaseOptions.map(({ value, label }) => `<option value="${value}">${label}</option>`).join('')}
        </select>
      </label>
      <div class="debug-panel__actions">
        <button type="button" data-debug-replay>Replay diagnostic</button>
        <button type="button" data-debug-pause>Pause diagnostic</button>
      </div>
      <fieldset class="debug-panel__scaffold">
        <legend>Composition scaffold</legend>
        <label><input type="checkbox" data-debug-brain checked /> Brain proxy</label>
        <label><input type="checkbox" data-debug-badges checked /> Badge markers</label>
        <label><input type="checkbox" data-debug-safe-frame /> Safe frame</label>
      </fieldset>
      <dl class="debug-panel__status" aria-live="polite">
        <div><dt>Backend</dt><dd data-debug-backend>Initializing</dd></div>
        <div><dt>Quality</dt><dd data-debug-quality-value>—</dd></div>
        <div><dt>Layout</dt><dd data-debug-layout>—</dd></div>
        <div><dt>Camera</dt><dd data-debug-camera>—</dd></div>
        <div><dt>Pointer</dt><dd data-debug-pointer>—</dd></div>
        <div><dt>Timeline</dt><dd data-debug-phase-value>—</dd></div>
        <div><dt>Lifecycle</dt><dd data-debug-lifecycle>—</dd></div>
        <div><dt>Frame p95</dt><dd data-debug-frame>Collecting…</dd></div>
      </dl>
      <p class="debug-panel__message" data-debug-message>Initializing renderer…</p>
      <ul class="debug-panel__legend" aria-label="Platform marker contract">
        ${BADGE_MARKER_SPECS.map(
          (marker) => `
            <li>
              <i style="--marker-color: ${marker.color}"></i>
              <span>${marker.label}</span>
              <small>${marker.depthRole} · ${marker.direction}</small>
            </li>`,
        ).join('')}
      </ul>
      <fieldset class="debug-panel__reserved" disabled>
        <legend>Reserved phase diagnostics</legend>
        ${RESERVED_DEBUG_FEATURES.map(
          (feature) => `<label><input type="checkbox" /> ${feature.replace(/([A-Z])/g, ' $1')}</label>`,
        ).join('')}
      </fieldset>
    `;

    this.safeFrameElement = document.createElement('div');
    this.safeFrameElement.className = 'debug-safe-frame';
    this.safeFrameElement.style.setProperty('--safe-frame-width', `${COMPOSITION_SAFE_FRAME.x * 100}%`);
    this.safeFrameElement.style.setProperty('--safe-frame-height', `${COMPOSITION_SAFE_FRAME.y * 100}%`);
    this.safeFrameElement.hidden = true;
    this.safeFrameElement.setAttribute('aria-hidden', 'true');
    host.append(this.safeFrameElement);
    host.append(this.element);

    const rendererControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-renderer]');
    const qualityControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-quality]');
    const phaseControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-phase]');
    this.pauseButton = getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-pause]');
    this.collapseButton = getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-collapse]');
    rendererControl.value = rendererPreference;
    qualityControl.value = qualityOverride;

    rendererControl.addEventListener('change', () => {
      actions.onRendererPreference(rendererControl.value as RendererPreference);
    });
    qualityControl.addEventListener('change', () => {
      actions.onQualityOverride(qualityControl.value as QualityOverride);
    });
    phaseControl.addEventListener('change', () => {
      actions.onIntroPhase(phaseControl.value as IntroPhase);
    });
    getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-replay]').addEventListener('click', actions.onReplay);
    this.pauseButton.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      actions.onPausedChange(this.isPaused);
    });
    this.collapseButton.addEventListener('click', () => this.setCollapsed(!this.isCollapsed));
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-brain]').addEventListener(
      'change',
      (event) => actions.onBrainProxyVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-badges]').addEventListener(
      'change',
      (event) => actions.onBadgeMarkersVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-safe-frame]').addEventListener(
      'change',
      (event) => {
        this.safeFrameElement.hidden = !(event.currentTarget as HTMLInputElement).checked;
      },
    );

    this.backendValue = getRequiredElement(this.element, '[data-debug-backend]');
    this.qualityValue = getRequiredElement(this.element, '[data-debug-quality-value]');
    this.phaseValue = getRequiredElement(this.element, '[data-debug-phase-value]');
    this.lifecycleValue = getRequiredElement(this.element, '[data-debug-lifecycle]');
    this.frameValue = getRequiredElement(this.element, '[data-debug-frame]');
    this.layoutValue = getRequiredElement(this.element, '[data-debug-layout]');
    this.cameraValue = getRequiredElement(this.element, '[data-debug-camera]');
    this.pointerValue = getRequiredElement(this.element, '[data-debug-pointer]');
    this.messageValue = getRequiredElement(this.element, '[data-debug-message]');

    if (window.matchMedia('(max-width: 767px)').matches) {
      this.setCollapsed(true);
    }
  }

  update(diagnostics: RuntimeDiagnostics): void {
    this.backendValue.textContent = diagnostics.backend.toUpperCase();
    this.qualityValue.textContent = diagnostics.quality;
    this.layoutValue.textContent = diagnostics.compositionLayout;
    this.cameraValue.textContent = [
      diagnostics.cameraPosition.x,
      diagnostics.cameraPosition.y,
      diagnostics.cameraPosition.z,
    ]
      .map((value) => value.toFixed(2))
      .join(', ');
    this.pointerValue.textContent = diagnostics.pointerStrength > 0 ? 'active' : 'rest';
    this.phaseValue.textContent = diagnostics.introPhase;
    this.lifecycleValue.textContent = diagnostics.runtimePhase;
    this.frameValue.textContent =
      diagnostics.frameP95Ms === null ? 'Collecting…' : `${diagnostics.frameP95Ms.toFixed(1)} ms (presentation)`;
    this.messageValue.textContent = diagnostics.message;
    this.isPaused = diagnostics.isPaused;
    this.pauseButton.textContent = this.isPaused ? 'Resume diagnostic' : 'Pause diagnostic';
  }

  dispose(): void {
    this.element.remove();
    this.safeFrameElement.remove();
  }

  private setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.element.classList.toggle('is-collapsed', collapsed);
    this.collapseButton.textContent = collapsed ? '+' : '−';
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.collapseButton.setAttribute('aria-label', collapsed ? 'Expand diagnostics' : 'Collapse diagnostics');
  }
}
