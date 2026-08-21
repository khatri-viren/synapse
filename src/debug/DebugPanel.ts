import {
  type IntroPhase,
  type QualityOverride,
  type RendererPreference,
  type RuntimeDiagnostics,
} from '../scene/types';
import { BADGE_ORBIT_SPECS } from '../badges/badgeConfig';
import { heroLayoutFor } from '../scene/compositionSpec';

export interface DebugPanelActions {
  onRendererPreference: (preference: RendererPreference) => void;
  onQualityOverride: (quality: QualityOverride) => void;
  onIntroPhase: (phase: IntroPhase) => void;
  onReplay: () => void;
  onPausedChange: (paused: boolean) => void;
  onBrainFillVisibility: (visible: boolean) => void;
  onPrimaryWiresVisibility: (visible: boolean) => void;
  onGhostWiresVisibility: (visible: boolean) => void;
  onBrainAnchorsVisibility: (visible: boolean) => void;
  onWireEnergyNodesVisibility: (visible: boolean) => void;
  onBadgeActorsVisibility: (visible: boolean) => void;
  onBadgeSocketsVisibility: (visible: boolean) => void;
  onBadgeOrbitGuidesVisibility: (visible: boolean) => void;
  onConnectionsVisibility: (visible: boolean) => void;
  onPacketsVisibility: (visible: boolean) => void;
  onAtmosphereVisibility: (visible: boolean) => void;
  onBloomVisibility: (visible: boolean) => void;
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

// requestAnimationFrame cadence is quantized and the displayed percentile is rounded to 0.1 ms.
const FRAME_BUDGET_DISPLAY_TOLERANCE_MS = 0.2;

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
  private readonly brainTopologyValue: HTMLElement;
  private readonly badgeOrbitsValue: HTMLElement;
  private readonly networkLinksValue: HTMLElement;
  private readonly imagePipelineValue: HTMLElement;
  private readonly messageValue: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly phaseControl: HTMLSelectElement;
  private readonly ghostWiresControl: HTMLInputElement;
  private readonly safeFrameElement: HTMLElement;
  private isPaused = false;
  private isCollapsed = false;

  constructor(host: HTMLElement, options: DebugPanelOptions) {
    const { actions, rendererPreference, qualityOverride } = options;
    this.element = document.createElement('aside');
    this.element.className = 'debug-panel';
    this.element.setAttribute('aria-label', 'Hero rendering and performance diagnostics');
    this.element.innerHTML = `
      <div class="debug-panel__header">
        <p>Phase 14</p>
        <span>Hero composition + HDR diagnostics</span>
        <button type="button" data-debug-collapse aria-expanded="true" aria-label="Collapse diagnostics">−</button>
      </div>
      <label>
        <span>Renderer</span>
        <select data-debug-renderer>
          <option value="auto">Auto (WebGPU → WebGL2)</option>
          <option value="webgl">Force WebGL2</option>
          <option value="fallback">Force static fallback</option>
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
        <legend>Brain material contributions</legend>
        <label><input type="checkbox" data-debug-brain-fill checked /> Brain fill</label>
        <label><input type="checkbox" data-debug-primary-wires checked /> Primary wires</label>
        <label><input type="checkbox" data-debug-ghost-wires checked /> Ghost wires</label>
        <label><input type="checkbox" data-debug-wire-energy checked /> Traveling energy nodes</label>
        <label><input type="checkbox" data-debug-brain-anchors /> Brain anchors</label>
        <label><input type="checkbox" data-debug-badges checked /> Badge actors</label>
        <label><input type="checkbox" data-debug-badge-sockets /> Badge sockets</label>
        <label><input type="checkbox" data-debug-orbit-guides /> Orbit guides</label>
        <label><input type="checkbox" data-debug-connections checked /> Connections</label>
        <label><input type="checkbox" data-debug-packets checked /> Inbound packets</label>
        <label><input type="checkbox" data-debug-atmosphere checked /> Atmosphere</label>
        <label><input type="checkbox" data-debug-bloom checked /> HDR bloom</label>
        <label><input type="checkbox" data-debug-safe-frame /> Safe frame</label>
      </fieldset>
      <dl class="debug-panel__status" aria-live="polite">
        <div><dt>Backend</dt><dd data-debug-backend>Initializing</dd></div>
        <div><dt>Quality</dt><dd data-debug-quality-value>—</dd></div>
        <div><dt>Layout</dt><dd data-debug-layout>—</dd></div>
        <div><dt>Camera</dt><dd data-debug-camera>—</dd></div>
        <div><dt>Pointer</dt><dd data-debug-pointer>—</dd></div>
        <div><dt>Brain</dt><dd data-debug-brain-topology>—</dd></div>
        <div><dt>Badges</dt><dd data-debug-badge-orbits>—</dd></div>
        <div><dt>Network</dt><dd data-debug-network-links>—</dd></div>
        <div><dt>Output</dt><dd data-debug-image-pipeline>—</dd></div>
        <div><dt>Timeline</dt><dd data-debug-phase-value>—</dd></div>
        <div><dt>Lifecycle</dt><dd data-debug-lifecycle>—</dd></div>
        <div><dt>Frame p95</dt><dd data-debug-frame>Collecting…</dd></div>
      </dl>
      <p class="debug-panel__message" data-debug-message>Initializing renderer…</p>
      <ul class="debug-panel__legend" aria-label="Platform badge contract">
        ${BADGE_ORBIT_SPECS.map(
          (badge) => `
            <li>
              <i style="--marker-color: ${badge.accentColor}"></i>
              <span>${badge.label}</span>
              <small>${((Math.PI * 2) / Math.abs(badge.angularSpeed)).toFixed(1)}s orbit</small>
            </li>`,
        ).join('')}
      </ul>
    `;

    this.safeFrameElement = document.createElement('div');
    this.safeFrameElement.className = 'debug-safe-frame';
    const initialStage = heroLayoutFor('wide').stage;
    this.safeFrameElement.style.setProperty('--safe-frame-width', `${initialStage.halfWidth * 200}%`);
    this.safeFrameElement.style.setProperty('--safe-frame-height', `${initialStage.halfHeight * 200}%`);
    this.safeFrameElement.hidden = true;
    this.safeFrameElement.setAttribute('aria-hidden', 'true');
    host.append(this.safeFrameElement);
    host.append(this.element);

    const rendererControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-renderer]');
    const qualityControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-quality]');
    this.phaseControl = getRequiredElement<HTMLSelectElement>(this.element, '[data-debug-phase]');
    this.pauseButton = getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-pause]');
    this.collapseButton = getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-collapse]');
    this.ghostWiresControl = getRequiredElement<HTMLInputElement>(this.element, '[data-debug-ghost-wires]');
    rendererControl.value = rendererPreference;
    qualityControl.value = qualityOverride;

    rendererControl.addEventListener('change', () => {
      actions.onRendererPreference(rendererControl.value as RendererPreference);
    });
    qualityControl.addEventListener('change', () => {
      actions.onQualityOverride(qualityControl.value as QualityOverride);
    });
    this.phaseControl.addEventListener('change', () => {
      actions.onIntroPhase(this.phaseControl.value as IntroPhase);
    });
    getRequiredElement<HTMLButtonElement>(this.element, '[data-debug-replay]').addEventListener('click', actions.onReplay);
    this.pauseButton.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      actions.onPausedChange(this.isPaused);
    });
    this.collapseButton.addEventListener('click', () => this.setCollapsed(!this.isCollapsed));
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-brain-fill]').addEventListener(
      'change',
      (event) => actions.onBrainFillVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-primary-wires]').addEventListener(
      'change',
      (event) => actions.onPrimaryWiresVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    this.ghostWiresControl.addEventListener(
      'change',
      (event) => actions.onGhostWiresVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-wire-energy]').addEventListener(
      'change',
      (event) => actions.onWireEnergyNodesVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-brain-anchors]').addEventListener(
      'change',
      (event) => actions.onBrainAnchorsVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-badges]').addEventListener(
      'change',
      (event) => actions.onBadgeActorsVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-badge-sockets]').addEventListener(
      'change',
      (event) => actions.onBadgeSocketsVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-orbit-guides]').addEventListener(
      'change',
      (event) => actions.onBadgeOrbitGuidesVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-connections]').addEventListener(
      'change',
      (event) => actions.onConnectionsVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-packets]').addEventListener(
      'change',
      (event) => actions.onPacketsVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-atmosphere]').addEventListener(
      'change',
      (event) => actions.onAtmosphereVisibility((event.currentTarget as HTMLInputElement).checked),
    );
    getRequiredElement<HTMLInputElement>(this.element, '[data-debug-bloom]').addEventListener(
      'change',
      (event) => actions.onBloomVisibility((event.currentTarget as HTMLInputElement).checked),
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
    this.brainTopologyValue = getRequiredElement(this.element, '[data-debug-brain-topology]');
    this.badgeOrbitsValue = getRequiredElement(this.element, '[data-debug-badge-orbits]');
    this.networkLinksValue = getRequiredElement(this.element, '[data-debug-network-links]');
    this.imagePipelineValue = getRequiredElement(this.element, '[data-debug-image-pipeline]');
    this.messageValue = getRequiredElement(this.element, '[data-debug-message]');

    if (window.matchMedia('(max-width: 767px)').matches) {
      this.setCollapsed(true);
    }
  }

  update(diagnostics: RuntimeDiagnostics): void {
    this.backendValue.textContent = diagnostics.backend.toUpperCase();
    this.qualityValue.textContent = diagnostics.quality;
    if (diagnostics.quality !== 'desktop') {
      this.ghostWiresControl.checked = false;
      this.ghostWiresControl.disabled = true;
    } else {
      this.ghostWiresControl.disabled = false;
    }
    this.layoutValue.textContent = diagnostics.compositionLayout;
    const stage = heroLayoutFor(diagnostics.compositionLayout).stage;
    this.safeFrameElement.style.setProperty('--safe-frame-width', `${stage.halfWidth * 200}%`);
    this.safeFrameElement.style.setProperty('--safe-frame-height', `${stage.halfHeight * 200}%`);
    this.safeFrameElement.style.setProperty('--safe-frame-center-x', `${50 + stage.centerX * 50}%`);
    this.safeFrameElement.style.setProperty('--safe-frame-center-y', `${50 - stage.centerY * 50}%`);
    this.cameraValue.textContent = [
      diagnostics.cameraPosition.x,
      diagnostics.cameraPosition.y,
      diagnostics.cameraPosition.z,
    ]
      .map((value) => value.toFixed(2))
      .join(', ');
    this.pointerValue.textContent = diagnostics.pointerStrength > 0 ? 'active' : 'rest';
    this.brainTopologyValue.textContent = diagnostics.brainTopology;
    this.badgeOrbitsValue.textContent = diagnostics.badgeOrbits;
    this.networkLinksValue.textContent = diagnostics.networkLinks;
    this.imagePipelineValue.textContent = diagnostics.imagePipeline;
    this.phaseControl.value = diagnostics.introPhase;
    this.phaseValue.textContent = diagnostics.introPhase;
    this.lifecycleValue.textContent = diagnostics.runtimePhase;
    this.frameValue.textContent =
      diagnostics.frameP95Ms === null
        ? diagnostics.frameBudgetMs === null
          ? 'Static'
          : 'Collecting…'
        : diagnostics.frameBudgetMs === null
          ? `${diagnostics.frameP95Ms.toFixed(1)} ms`
          : `${diagnostics.frameP95Ms.toFixed(1)} / ${diagnostics.frameBudgetMs.toFixed(1)} ms ${diagnostics.frameP95Ms <= diagnostics.frameBudgetMs + FRAME_BUDGET_DISPLAY_TOLERANCE_MS ? '✓' : '!'}`;
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
