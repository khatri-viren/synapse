import { CHOREOGRAPHY_TIMELINE, normalizedBeatProgress } from '../scene/ChoreographyTimeline';
import type { SceneState } from '../scene/types';

type NavBeat =
  | 'navShell'
  | 'navItemOne'
  | 'navItemTwo'
  | 'navItemThree'
  | 'navCta'
  | 'navGlint';

function minimumJerk(progress: number): number {
  const value = Math.min(Math.max(progress, 0), 1);
  return value * value * value * (10 + value * (-15 + value * 6));
}

/**
 * Owns the semantic hero navigation and samples the same scene clock as the
 * WebGPU choreography. Pointer interaction is intentionally DOM-only so the
 * glass stays crisp and accessible above the canvas.
 */
export class HeroNav {
  private readonly root: HTMLElement;
  private readonly track: HTMLElement;
  private readonly items: readonly HTMLAnchorElement[];
  private readonly menuToggle: HTMLButtonElement;
  private readonly values = new Map<string, string>();
  private readonly cleanup: Array<() => void> = [];
  private ready = false;

  constructor(host: HTMLElement) {
    const root = host.querySelector<HTMLElement>('[data-hero-nav]');
    const track = root?.querySelector<HTMLElement>('[data-nav-track]');
    const menuToggle = root?.querySelector<HTMLButtonElement>('[data-nav-menu-toggle]');
    const cta = root?.querySelector<HTMLAnchorElement>('[data-nav-cta]');

    if (root === null || root === undefined || track === null || track === undefined) {
      throw new Error('Hero navigation shell is missing from the hero UI.');
    }
    if (menuToggle === null || menuToggle === undefined) {
      throw new Error('Hero navigation menu toggle is missing.');
    }
    if (cta === null || cta === undefined) {
      throw new Error('Hero navigation call to action is missing.');
    }

    this.root = root;
    this.track = track;
    this.menuToggle = menuToggle;
    this.items = [...track.querySelectorAll<HTMLAnchorElement>('[data-nav-item]')];

    for (const item of this.items) {
      const activate = (): void => this.activateLens(item);
      const close = (): void => this.setMenuOpen(false);
      item.addEventListener('pointerenter', activate);
      item.addEventListener('focus', activate);
      item.addEventListener('click', close);
      this.cleanup.push(() => {
        item.removeEventListener('pointerenter', activate);
        item.removeEventListener('focus', activate);
        item.removeEventListener('click', close);
      });
    }

    const activateCta = (): void => this.activateLens(cta);
    const hideForMenuToggle = (): void => this.hideLens();
    cta.addEventListener('pointerenter', activateCta);
    cta.addEventListener('focus', activateCta);
    menuToggle.addEventListener('pointerenter', hideForMenuToggle);
    menuToggle.addEventListener('focus', hideForMenuToggle);
    this.cleanup.push(() => {
      cta.removeEventListener('pointerenter', activateCta);
      cta.removeEventListener('focus', activateCta);
      menuToggle.removeEventListener('pointerenter', hideForMenuToggle);
      menuToggle.removeEventListener('focus', hideForMenuToggle);
    });

    const leave = (): void => {
      if (!this.root.contains(document.activeElement)) this.hideLens();
    };
    const focusOut = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !this.root.contains(event.relatedTarget)) {
        this.hideLens();
      }
    };
    const toggleMenu = (): void => {
      this.setMenuOpen(this.root.dataset.menuOpen !== 'true');
    };
    const documentPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !this.root.contains(event.target)) {
        this.setMenuOpen(false);
      }
    };
    const documentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || this.root.dataset.menuOpen !== 'true') return;
      this.setMenuOpen(false);
      this.menuToggle.focus();
    };
    const resize = (): void => this.hideLens();

    this.root.addEventListener('pointerleave', leave);
    this.root.addEventListener('focusout', focusOut);
    this.menuToggle.addEventListener('click', toggleMenu);
    document.addEventListener('pointerdown', documentPointerDown);
    document.addEventListener('keydown', documentKeyDown);
    window.addEventListener('resize', resize, { passive: true });
    this.cleanup.push(() => {
      this.root.removeEventListener('pointerleave', leave);
      this.root.removeEventListener('focusout', focusOut);
      this.menuToggle.removeEventListener('click', toggleMenu);
      document.removeEventListener('pointerdown', documentPointerDown);
      document.removeEventListener('keydown', documentKeyDown);
      window.removeEventListener('resize', resize);
    });
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'quality'>): void {
    const reduced = state.quality === 'reduced-motion';
    const progressFor = (beat: NavBeat): number =>
      reduced
        ? 1
        : minimumJerk(normalizedBeatProgress(state.elapsedSeconds, CHOREOGRAPHY_TIMELINE[beat]));
    const shell = progressFor('navShell');
    const itemOne = progressFor('navItemOne');
    const itemTwo = progressFor('navItemTwo');
    const itemThree = progressFor('navItemThree');
    const cta = progressFor('navCta');
    const glintProgress = reduced ? 0 : progressFor('navGlint');

    this.write('--nav-shell-reveal', shell);
    this.write('--nav-item-one-reveal', itemOne);
    this.write('--nav-item-two-reveal', itemTwo);
    this.write('--nav-item-three-reveal', itemThree);
    this.write('--nav-cta-reveal', cta);
    this.write('--nav-glint-progress', glintProgress);
    this.write('--nav-glint-opacity', reduced ? 0 : Math.sin(Math.PI * glintProgress) * 0.72);

    const ready = reduced || cta > 0.94;
    if (ready === this.ready) return;
    this.ready = ready;
    this.root.dataset.ready = String(ready);
    if (!ready) {
      this.setMenuOpen(false);
      this.hideLens();
    }
  }

  dispose(): void {
    for (const dispose of this.cleanup) dispose();
    this.cleanup.length = 0;
    this.setMenuOpen(false);
    this.hideLens();
    for (const property of this.values.keys()) this.root.style.removeProperty(property);
    this.values.clear();
  }

  private activateLens(item: HTMLElement): void {
    if (!this.ready || window.matchMedia('(max-width: 1199px)').matches) return;
    const rootRect = this.root.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    this.root.style.setProperty('--nav-lens-x', `${(itemRect.left - rootRect.left).toFixed(2)}px`);
    this.root.style.setProperty('--nav-lens-width', `${itemRect.width.toFixed(2)}px`);
    this.root.style.setProperty('--nav-lens-opacity', '1');
    this.root.dataset.lensTarget = item.hasAttribute('data-nav-cta') ? 'cta' : 'link';
  }

  private hideLens(): void {
    this.root.style.setProperty('--nav-lens-opacity', '0');
    delete this.root.dataset.lensTarget;
  }

  private setMenuOpen(open: boolean): void {
    const next = open && this.ready;
    this.root.dataset.menuOpen = String(next);
    this.menuToggle.setAttribute('aria-expanded', String(next));
  }

  private write(property: string, value: number): void {
    const serialized = Math.min(Math.max(value, 0), 1).toFixed(4);
    if (this.values.get(property) === serialized) return;
    this.values.set(property, serialized);
    this.root.style.setProperty(property, serialized);
  }
}
