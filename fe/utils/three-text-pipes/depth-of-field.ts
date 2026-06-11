import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface DepthOfFieldPipeParams {
  focus?: number;
  aperture?: number;
  maxBlur?: number;
}

export class DepthOfFieldPipe implements EffectPipe {
  readonly name = 'depthOfField';
  private pass: InstanceType<typeof BokehPass> | null = null;
  constructor(public params: DepthOfFieldPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, ctx: PipeSetupContext) {
    const { focus = 15, aperture = 0.00003, maxBlur = 0.01 } = this.params;
    this.pass = new BokehPass(ctx.scene, ctx.camera, { focus, aperture, maxblur: maxBlur });
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    const u = (this.pass as any).uniforms;
    if (!u) return;
    if (this.params.focus    !== undefined) u['focus'].value   = this.params.focus;
    if (this.params.aperture !== undefined) u['aperture'].value = this.params.aperture;
    if (this.params.maxBlur  !== undefined) u['maxblur'].value = this.params.maxBlur;
  }

  dispose() { this.pass?.dispose(); this.pass = null; }
}
