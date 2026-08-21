import { Box3, DirectionalLight, Group, HemisphereLight, Vector3 } from 'three/webgpu';

import { BadgeSystem } from '../badges/BadgeSystem';
import { BrainSystem } from '../brain/BrainSystem';
import { ConnectionSystem } from '../network/ConnectionSystem';
import { PacketSystem } from '../network/PacketSystem';
import { AtmosphereParticles } from '../atmosphere/AtmosphereParticles';
import { AuthoredHeroFog } from '../atmosphere/AuthoredHeroFog';
import { heroLayoutFor, type CompositionLayout } from './compositionSpec';
import type {
  BadgeOrbitValidationSnapshot,
  BadgeRuntimeDebugSnapshot,
  LogoId,
  QualityTier,
  SceneDebugSnapshot,
  SceneState,
} from './types';

/** Shared scene graph with one explicit owner for each animated subsystem. */
export class CompositionScaffold {
  readonly root = new Group();
  readonly brainGroup = new Group();
  readonly badgeGroup = new Group();
  readonly connectionGroup = new Group();
  readonly packetGroup = new Group();
  readonly atmosphereGroup = new Group();
  readonly ready: Promise<void>;

  private readonly brainSystem: BrainSystem;
  private readonly badgeSystem: BadgeSystem;
  private readonly connectionSystem: ConnectionSystem;
  private readonly packetSystem: PacketSystem;
  private readonly atmosphereParticles: AtmosphereParticles;
  private readonly authoredHeroFog: AuthoredHeroFog;
  private readonly orbitValidationByLayout = new Map<CompositionLayout, BadgeOrbitValidationSnapshot>();
  private layout: CompositionLayout = 'wide';

  constructor(initialQuality: QualityTier) {
    this.brainSystem = new BrainSystem(initialQuality);
    this.badgeSystem = new BadgeSystem();
    this.connectionSystem = new ConnectionSystem();
    this.packetSystem = new PacketSystem();
    this.atmosphereParticles = new AtmosphereParticles(initialQuality);
    this.authoredHeroFog = new AuthoredHeroFog(initialQuality);
    this.ready = Promise.all([
      this.brainSystem.ready,
      this.badgeSystem.ready,
    ]).then(() => undefined);
    this.root.name = 'sceneRoot';
    this.brainGroup.name = 'brainGroup';
    this.badgeGroup.name = 'badgeGroup';
    this.connectionGroup.name = 'connectionGroup';
    this.packetGroup.name = 'packetGroup';
    this.atmosphereGroup.name = 'atmosphereGroup';

    this.createLighting();
    this.brainGroup.add(this.brainSystem.root);
    this.badgeGroup.add(this.badgeSystem.root);
    this.connectionGroup.add(this.connectionSystem.root);
    this.packetGroup.add(this.packetSystem.root);
    this.atmosphereGroup.add(this.authoredHeroFog.root, this.atmosphereParticles.root);
    this.root.add(
      this.atmosphereGroup,
      this.connectionGroup,
      this.brainGroup,
      this.badgeGroup,
      this.packetGroup,
    );
    this.setLayout('wide');
  }

  setLayout(layout: CompositionLayout): void {
    this.layout = layout;
    this.badgeSystem.setLayout(layout);
    this.root.updateMatrixWorld(true);
  }

  getLayout(): CompositionLayout {
    return this.layout;
  }

  getSupportPoints(): Vector3[] {
    return [...this.brainSystem.getSupportPoints(), ...this.badgeSystem.getSupportPoints()];
  }

  getBrainSupportPoints(): Vector3[] {
    return this.brainSystem.getSupportPoints();
  }

  getBadgeActorWorldPosition(id: LogoId, target = new Vector3()): Vector3 {
    this.root.updateMatrixWorld(true);
    return this.badgeSystem.getActorWorldPosition(id, target);
  }

  getBadgeSocketWorldPosition(id: LogoId, target = new Vector3()): Vector3 {
    this.root.updateMatrixWorld(true);
    return this.badgeSystem.getSocketWorldPosition(id, target);
  }

  getBadgeDebugSnapshot(): BadgeRuntimeDebugSnapshot[] {
    this.root.updateMatrixWorld(true);
    return this.badgeSystem.getDebugSnapshot();
  }

  getBadgeOrbitValidation(
    camera?: import('three/webgpu').PerspectiveCamera,
  ): BadgeOrbitValidationSnapshot {
    if (camera !== undefined) {
      const brainBounds = new Box3().setFromPoints(this.brainSystem.getSupportPoints());
      return this.badgeSystem.validateOrbitSafety(
        brainBounds,
        camera,
        heroLayoutFor(this.layout).keepOutRects,
      );
    }
    const cached = this.orbitValidationByLayout.get(this.layout);

    if (cached !== undefined) {
      return cached;
    }

    const brainBounds = new Box3().setFromPoints(this.brainSystem.getSupportPoints());
    const validation = this.badgeSystem.validateOrbitSafety(brainBounds);
    this.orbitValidationByLayout.set(this.layout, validation);
    return validation;
  }

  getOwnedGroupNames(): string[] {
    return [
      this.root.name,
      this.brainGroup.name,
      this.badgeGroup.name,
      this.badgeSystem.root.name,
      this.connectionSystem.root.name,
      this.packetSystem.root.name,
      this.atmosphereParticles.root.name,
      this.authoredHeroFog.root.name,
      this.atmosphereGroup.name,
      this.connectionGroup.name,
      this.packetGroup.name,
    ];
  }

  setQualityTier(quality: QualityTier): void {
    this.brainSystem.setQualityTier(quality);
    this.atmosphereParticles.setQualityTier(quality);
    this.authoredHeroFog.setQualityTier(quality);
  }

  setBrainFillVisible(visible: boolean): void {
    this.brainSystem.setFillVisible(visible);
  }

  setPrimaryWiresVisible(visible: boolean): void {
    this.brainSystem.setPrimaryWiresVisible(visible);
  }

  setGhostWiresVisible(visible: boolean): void {
    this.brainSystem.setGhostWiresVisible(visible);
  }

  setBrainAnchorsVisible(visible: boolean): void {
    this.brainSystem.setAnchorsVisible(visible);
  }

  setWireEnergyNodesVisible(visible: boolean): void {
    this.brainSystem.setEnergyNodesVisible(visible);
  }

  setBadgeActorsVisible(visible: boolean): void {
    this.badgeSystem.setActorsVisible(visible);
  }

  setBadgeSocketsVisible(visible: boolean): void {
    this.badgeSystem.setSocketsVisible(visible);
  }

  setBadgeOrbitGuidesVisible(visible: boolean): void {
    this.badgeSystem.setOrbitGuidesVisible(visible);
  }

  setConnectionsVisible(visible: boolean): void {
    this.connectionSystem.setVisible(visible);
  }

  setPacketsVisible(visible: boolean): void {
    this.packetSystem.setVisible(visible);
  }

  setAtmosphereVisible(visible: boolean): void {
    this.atmosphereParticles.setVisible(visible);
    this.authoredHeroFog.setVisible(visible);
    this.atmosphereGroup.visible = visible;
  }

  update(
    state: Pick<SceneState, 'elapsedSeconds' | 'introPhase' | 'quality' | 'scrollProgress'>,
  ): void {
    this.brainSystem.update(state);
    this.badgeSystem.update(state);
    this.connectionSystem.update(state, this.badgeSystem, this.brainSystem);
    this.packetSystem.update(state, this.connectionSystem);
    this.atmosphereParticles.update(state);
    this.authoredHeroFog.update(state);
  }

  getVisibility(): SceneDebugSnapshot['visibility'] {
    return {
      ...this.brainSystem.getVisibility(),
      ...this.badgeSystem.getVisibility(),
      connections: this.connectionSystem.isVisible(),
      packets: this.packetSystem.isVisible(),
      atmosphere: this.atmosphereParticles.isVisible(),
    };
  }

  getBrainDebugSnapshot(): SceneDebugSnapshot['brain'] {
    return this.brainSystem.getDebugSnapshot();
  }

  getNetworkDebugSnapshot(): SceneDebugSnapshot['network'] {
    return {
      links: this.connectionSystem.getDebugSnapshot(),
      packets: this.packetSystem.getDebugSnapshot(),
    };
  }

  getAtmosphereDebugSnapshot(): SceneDebugSnapshot['atmosphere'] {
    return {
      ...this.atmosphereParticles.getDebugSnapshot(),
      fog: this.authoredHeroFog.getDebugSnapshot(),
    };
  }

  dispose(): void {
    this.brainSystem.dispose();
    this.badgeSystem.dispose();
    this.connectionSystem.dispose();
    this.packetSystem.dispose();
    this.atmosphereParticles.dispose();
    this.authoredHeroFog.dispose();
  }

  private createLighting(): void {
    const lightingGroup = new Group();
    lightingGroup.name = 'lightingGroup';

    const hemisphere = new HemisphereLight('#8ee9ff', '#02030a', 1.45);
    const key = new DirectionalLight('#b5dfff', 2.6);
    const rim = new DirectionalLight('#6d56ff', 1.5);
    key.position.set(3.5, 4.5, 5);
    rim.position.set(-4, -1, 2.5);
    lightingGroup.add(hemisphere, key, rim);
    this.root.add(lightingGroup);
  }
}
