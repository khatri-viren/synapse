import { animate } from 'motion';

import { CHOREOGRAPHY_TIMELINE, normalizedBeatProgress } from '../scene/ChoreographyTimeline';
import type { SceneState } from '../scene/types';
import { HeroNav } from './HeroNav';

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
  private readonly heroNav: HeroNav;

  constructor(
    private readonly host: HTMLElement,
    onReplay: () => void,
  ) {
    this.heroNav = new HeroNav(host);
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

    const liquidCta = host.querySelector<HTMLElement>('[data-liquid-cta]');
    if (liquidCta !== null) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let springFrame = 0;
      let lastFrameTime = 0;
      let currentX = 0.5;
      let currentY = 0.62;
      let targetX = currentX;
      let targetY = currentY;
      let velocityX = 0;
      let velocityY = 0;
      let stretch = 0;

      const writeLiquidState = (): void => {
        liquidCta.style.setProperty('--liquid-x', `${(currentX * 100).toFixed(2)}%`);
        liquidCta.style.setProperty('--liquid-y', `${(currentY * 100).toFixed(2)}%`);
        liquidCta.style.setProperty('--liquid-stretch', stretch.toFixed(4));
      };
      const stopSpring = (): void => {
        if (springFrame !== 0) window.cancelAnimationFrame(springFrame);
        springFrame = 0;
        lastFrameTime = 0;
      };
      const updateSpring = (time: number): void => {
        const deltaSeconds = lastFrameTime === 0 ? 1 / 60 : Math.min((time - lastFrameTime) / 1000, 0.033);
        lastFrameTime = time;

        const stiffness = 30;
        const damping = 9.2;
        velocityX += ((targetX - currentX) * stiffness - velocityX * damping) * deltaSeconds;
        velocityY += ((targetY - currentY) * stiffness - velocityY * damping) * deltaSeconds;
        currentX += velocityX * deltaSeconds;
        currentY += velocityY * deltaSeconds;

        const bounds = liquidCta.getBoundingClientRect();
        const speedPixels = Math.hypot(velocityX * bounds.width, velocityY * bounds.height);
        const targetStretch = Math.min(speedPixels / 270, 1);
        stretch += (targetStretch - stretch) * (1 - Math.exp(-deltaSeconds * 7));
        writeLiquidState();

        const distance = Math.hypot(targetX - currentX, targetY - currentY);
        const speed = Math.hypot(velocityX, velocityY);
        if (distance > 0.0005 || speed > 0.0007 || stretch > 0.002) {
          springFrame = window.requestAnimationFrame(updateSpring);
        } else {
          springFrame = 0;
          lastFrameTime = 0;
        }
      };
      const startSpring = (): void => {
        if (springFrame === 0) springFrame = window.requestAnimationFrame(updateSpring);
      };
      const updateLiquidTarget = (event: PointerEvent): void => {
        const bounds = liquidCta.getBoundingClientRect();
        const pointerX = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);
        const pointerY = Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1);

        // Project the pointer direction onto a pill-like perimeter, then map
        // that edge point into the oversized gradient layer's coordinates.
        const directionX = (pointerX - 0.5) / 0.48;
        const directionY = (pointerY - 0.5) / 0.42;
        const directionLength = Math.hypot(directionX, directionY);
        const edgeX = directionLength > 0.025 ? 0.5 + (directionX / directionLength) * 0.48 : 0.5;
        const edgeY = directionLength > 0.025 ? 0.5 + (directionY / directionLength) * 0.42 : 0.92;
        targetX = 0.11 + edgeX * 0.78;
        targetY = 0.21 + edgeY * 0.58;

        if (reducedMotion.matches) {
          currentX = targetX;
          currentY = targetY;
          velocityX = 0;
          velocityY = 0;
          stretch = 0;
          writeLiquidState();
          return;
        }
        startSpring();
      };
      const resetLiquidOrigin = (): void => {
        targetX = 0.5;
        targetY = 0.62;
        if (reducedMotion.matches) {
          currentX = targetX;
          currentY = targetY;
          stretch = 0;
          writeLiquidState();
          return;
        }
        startSpring();
      };
      const beginLiquidFollow = (event: PointerEvent): void => {
        updateLiquidTarget(event);
      };
      liquidCta.addEventListener('pointerenter', beginLiquidFollow);
      liquidCta.addEventListener('pointermove', updateLiquidTarget);
      liquidCta.addEventListener('pointerleave', resetLiquidOrigin);
      this.cleanup.push(() => {
        liquidCta.removeEventListener('pointerenter', beginLiquidFollow);
        liquidCta.removeEventListener('pointermove', updateLiquidTarget);
        liquidCta.removeEventListener('pointerleave', resetLiquidOrigin);
        stopSpring();
        liquidCta.style.removeProperty('--liquid-x');
        liquidCta.style.removeProperty('--liquid-y');
        liquidCta.style.removeProperty('--liquid-stretch');
      });
    }

    this.scrollReveal = new ScrollRevealController(
      [...document.querySelectorAll<HTMLElement>('[data-scroll-reveal]')],
    );
  }

  update(state: Pick<SceneState, 'elapsedSeconds' | 'scrollProgress' | 'quality'>): void {
    const reduced = state.quality === 'reduced-motion';
    const progressFor = (key: 'support' | 'insights' | 'cards'): number =>
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
    this.write('--insights-reveal', minimumJerk(progressFor('insights')));
    this.write('--cards-reveal', Math.max(progressFor('cards'), state.scrollProgress * 1.4));
    this.write('--fold-progress', reduced ? 1 : Math.min(Math.max(state.scrollProgress * 2.2, 0), 1));
    this.write('--title-line-one-reveal', titleLineOne);
    this.write('--title-line-two-reveal', titleLineTwo);
    this.write('--title-reveal', (titleLineOne + titleLineTwo) * 0.5);
    this.heroNav.update(state);
  }

  dispose(): void {
    for (const dispose of this.cleanup) dispose();
    for (const variable of this.springVariables) variable.dispose();
    this.heroNav.dispose();
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
