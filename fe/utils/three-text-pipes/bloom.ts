import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface BloomPipeParams {
  threshold?: number;
  strength?: number;
  radius?: number;
}

export class BloomPipe implements EffectPipe {
  readonly name = 'bloom';
  private pass: InstanceType<typeof UnrealBloomPass> | null = null;
  constructor(public params: BloomPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    const { threshold = 0.2, strength = 0.8, radius = 0.5 } = this.params;
    this.pass = new UnrealBloomPass(new THREE.Vector2(ctx.width, ctx.height), strength, radius, threshold);
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    this.pass.threshold = this.params.threshold ?? 0.2;
    this.pass.strength  = this.params.strength  ?? 0.8;
    this.pass.radius    = this.params.radius    ?? 0.5;
  }

  dispose() { this.pass?.dispose(); this.pass = null; }
}
