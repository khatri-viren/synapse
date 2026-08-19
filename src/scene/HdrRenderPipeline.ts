import {
  NeutralToneMapping,
  RenderPipeline,
  SRGBColorSpace,
  type Camera,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { pass } from 'three/tsl';
import BloomNode, { bloom } from 'three/addons/tsl/display/BloomNode.js';

import type { QualityTier, RenderPipelineDebugSnapshot } from './types';
import { qualityProfileFor } from './qualityProfiles';

const FIXED_EXPOSURE = 0.9;

type DisposableBloomNode = BloomNode & { dispose: () => void };

/**
 * Sole owner of the photographed output:
 * scene-linear HDR -> full-scene bloom -> fixed exposure -> Neutral -> sRGB.
 */
export class HdrRenderPipeline {
  private readonly renderer: WebGPURenderer;
  private readonly scenePass;
  private readonly sceneColor;
  private readonly bloomNode: DisposableBloomNode;
  private readonly pipeline: RenderPipeline;
  private quality: QualityTier;
  private bloomRequested = true;
  private bloomActive = true;

  constructor(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: Camera,
    initialQuality: QualityTier,
  ) {
    this.renderer = renderer;
    this.quality = initialQuality;

    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = FIXED_EXPOSURE;

    this.scenePass = pass(scene, camera);
    this.sceneColor = this.scenePass.getTextureNode('output');
    this.bloomNode = bloom(this.sceneColor) as DisposableBloomNode;
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputColorTransform = true;
    this.applyQuality(initialQuality);
  }

  render(): void {
    this.pipeline.render();
  }

  setQuality(quality: QualityTier): void {
    if (this.quality === quality) return;
    this.quality = quality;
    this.applyQuality(quality);
  }

  setBloomEnabled(enabled: boolean): void {
    if (this.bloomRequested === enabled) return;
    this.bloomRequested = enabled;
    this.rebindOutput();
  }

  getDebugSnapshot(): RenderPipelineDebugSnapshot {
    const profile = qualityProfileFor(this.quality);
    return {
      outputOwner: 'RenderPipeline',
      scenePasses: 1,
      hdrBuffer: 'half-float scene-linear',
      bloom: {
        enabled: this.bloomActive,
        strength: this.bloomNode.strength.value,
        radius: this.bloomNode.radius.value,
        threshold: this.bloomNode.threshold.value,
        smoothWidth: this.bloomNode.smoothWidth.value,
        resolutionScale: this.bloomNode.getResolutionScale(),
      },
      exposure: FIXED_EXPOSURE,
      toneMapping: 'Neutral',
      outputColorSpace: 'sRGB',
      outputConversions: 1,
      temporalAA: false,
      dprCap: profile.dprCap,
      frameBudgetMs: profile.frameBudgetMs,
    };
  }

  dispose(): void {
    this.pipeline.dispose();
    this.bloomNode.dispose();
    this.scenePass.dispose();
  }

  private applyQuality(quality: QualityTier): void {
    const profile = qualityProfileFor(quality);
    this.bloomNode.strength.value = profile.bloom.strength;
    this.bloomNode.radius.value = profile.bloom.radius;
    this.bloomNode.threshold.value = profile.bloom.threshold;
    this.bloomNode.smoothWidth.value = profile.bloom.smoothWidth;
    this.bloomNode.setResolutionScale(profile.bloom.resolutionScale);
    this.rebindOutput();
  }

  private rebindOutput(): void {
    const profile = qualityProfileFor(this.quality);
    this.bloomActive = this.bloomRequested && profile.bloom.enabled;
    this.pipeline.outputNode = this.bloomActive
      ? this.sceneColor.add(this.bloomNode)
      : this.sceneColor;
    this.pipeline.needsUpdate = true;
  }
}
