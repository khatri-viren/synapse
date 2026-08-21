import { animate } from 'motion';

import { CHOREOGRAPHY_TIMELINE, normalizedBeatProgress } from '../scene/ChoreographyTimeline';
import type { SceneState } from '../scene/types';

type StoppableAnimation = { stop: () => void };

function minimumJerk(progress: number): number {
  const value = Math.min(Math.max(progress, 0), 1);
  return value * value * value * (10 + value * (-15 + value * 6));
}

class SpringCssVariable {
  private current = 0;
  private animation: StoppableAnimation | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly property: string,
  ) {}

  set(target: number): void {
    this.animation?.stop();
    this.animation = animate(this.current, target, {
      type: 'spring',
      stiffness: 310,
      damping: 30,
      mass: 0.72,
      onUpdate: (value) => {
        this.current = value;
        this.element.style.setProperty(this.property, value.toFixed(4));
      },
    });
  }

  dispose(): void {
    this.animation?.stop();
    this.element.style.removeProperty(this.property);
  }
}

class ScrollRevealController {
  private readonly observer: IntersectionObserver;

  constructor(elements: readonly HTMLElement[]) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          this.observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
    );
    for (const element of elements) this.observer.observe(element);
  }

  dispose(): void {
    this.observer.disconnect();
  }
}

/** DOM-only hero ownership: choreography samples scene time; Motion is used only for UI springs. */
export class HeroUI {
  private readonly values = new Map<string, string>();
  private readonly springVariables: SpringCssVariable[] = [];
  private readonly cleanup: Array<() => void> = [];
  private readonly scrollReveal: ScrollRevealController;

  constructor(
    private readonly host: HTMLElement,
    onReplay: () => void,
  ) {
    const interactive = host.querySelectorAll<HTMLElement>('[data-spring-lift]');
    for (const element of interactive) {
      const springVariable = new SpringCssVariable(element, '--hover-lift');
      const enter = (): void => springVariable.set(1);
      const leave = (): void => springVariable.set(0);
      element.addEventListener('pointerenter', enter);
      element.addEventListener('pointerleave', leave);
      element.addEventListener('focusin', enter);
      element.addEventListener('focusout', leave);
      this.cleanup.push(() => {
        element.removeEventListener('pointerenter', enter);
        element.removeEventListener('pointerleave', leave);
        element.removeEventListener('focusin', enter);
        element.removeEventListener('focusout', leave);
      });
      this.springVariables.push(springVariable);
    }

    const replayButton = host.querySelector<HTMLButtonElement>('[data-hero-replay]');
    if (replayButton !== null) {
      replayButton.addEventListener('click', onReplay);
      this.cleanup.push(() => replayButton.removeEventListener('click', onReplay));
    }

    this.scrollReveal = new ScrollRevealController(
      [...document.querySelectorAll<HTMLElement>('[data-scroll-reveal]')],
    );
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'scrollProgress' | 'quality'>): void {
    const reduced = state.quality === 'reduced-motion';
    const progressFor = (key: 'support' | 'cards'): number =>
      reduced ? 1 : normalizedBeatProgress(state.elapsedSeconds, CHOREOGRAPHY_TIMELINE[key]);
    const titleLineOne = reduced
      ? 1
      : minimumJerk(
          normalizedBeatProgress(state.elapsedSeconds, CHOREOGRAPHY_TIMELINE.headerLineOne),
        );
    const titleLineTwo = reduced
      ? 1
      : minimumJerk(
          normalizedBeatProgress(state.elapsedSeconds, CHOREOGRAPHY_TIMELINE.headerLineTwo),
        );
    this.write('--support-reveal', progressFor('support'));
    this.write('--cards-reveal', Math.max(progressFor('cards'), state.scrollProgress * 1.4));
    this.write('--fold-progress', reduced ? 1 : Math.min(Math.max(state.scrollProgress * 2.2, 0), 1));
    this.write('--title-line-one-reveal', titleLineOne);
    this.write('--title-line-two-reveal', titleLineTwo);
    this.write('--title-reveal', (titleLineOne + titleLineTwo) * 0.5);
  }

  dispose(): void {
    for (const dispose of this.cleanup) dispose();
    for (const variable of this.springVariables) variable.dispose();
    this.scrollReveal.dispose();
    for (const property of this.values.keys()) this.host.style.removeProperty(property);
  }

  private write(property: string, value: number): void {
    const serialized = Math.min(Math.max(value, 0), 1).toFixed(4);
    if (this.values.get(property) === serialized) return;
    this.values.set(property, serialized);
    this.host.style.setProperty(property, serialized);
  }
}
