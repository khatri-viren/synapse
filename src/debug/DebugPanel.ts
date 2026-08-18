import {
  RESERVED_DEBUG_FEATURES,
  type IntroPhase,
  type QualityOverride,
  type RendererPreference,
  type RuntimeDiagnostics,
} from '../scene/types';

export interface DebugPanelActions {
  onRendererPreference: (preference: RendererPreference) => void;
  onQualityOverride: (quality: QualityOverride) => void;
  onIntroPhase: (phase: IntroPhase) => void;
  onReplay: () => void;
  onPausedChange: (paused: boolean) => void;
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
  private readonly messageValue: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private isPaused = false;

  constructor(host: HTMLElement, options: DebugPanelOptions) {
    const { actions, rendererPreference, qualityOverride } = options;
    this.element = document.createElement('aside');
    this.element.className = 'debug-panel';
    this.element.setAttribute('aria-label', 'Phase 0 renderer diagnostics');
    this.element.innerHTML = `
      <div class="debug-panel__header">
        <p>Phase 0</p>
        <span>Renderer diagnostics</span>
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
      <dl class="debug-panel__status" aria-live="polite">
        <div><dt>Backend</dt><dd data-debug-backend>Initializing</dd></div>
        <div><dt>Quality</dt><dd data-debug-quality-value>—</dd></div>
        <div><dt>Timeline</dt><dd data-debug-phase-value>—</dd></div>
        <div><dt>Lifecycle</dt><dd data-debug-lifecycle>—</dd></div>
        <div><dt>Frame p95</dt><dd data-debug-frame>Collecting…</dd></div>
      </dl>
      <p class="debug-panel__message" data-debug-message>Initializing renderer…</p>
      <fieldset class="debug-panel__reserved" disabled>
        <legend>Reserved phase diagnostics</legend>
        ${RESERVED_DEBUG_FEATURES.map(
          (feature) => `<label><input type="checkbox" /> ${feature.replace(/([A-Z])/g, ' $1')}</label>`,
        ).join('')}
      </fieldset>
    `;

    host.append(this.element);

    const rendererControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-renderer]');
    const qualityControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-quality]');
    const phaseControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-phase]');
    this.pauseButton = getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-pause]');
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

    this.backendValue = getRequiredElement(this.element, '[data-debug-backend]');
    this.qualityValue = getRequiredElement(this.element, '[data-debug-quality-value]');
    this.phaseValue = getRequiredElement(this.element, '[data-debug-phase-value]');
    this.lifecycleValue = getRequiredElement(this.element, '[data-debug-lifecycle]');
    this.frameValue = getRequiredElement(this.element, '[data-debug-frame]');
    this.messageValue = getRequiredElement(this.element, '[data-debug-message]');
  }

  update(diagnostics: RuntimeDiagnostics): void {
    this.backendValue.textContent = diagnostics.backend.toUpperCase();
    this.qualityValue.textContent = diagnostics.quality;
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
  }
}
