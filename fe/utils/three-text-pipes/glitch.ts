import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface GlitchPipeParams { wildGlitch?: boolean; dtSize?: number; }

export class GlitchPipe implements EffectPipe {
  readonly name = 'glitch';
  private pass: InstanceType<typeof GlitchPass> | null = null;
  constructor(public params: GlitchPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new GlitchPass(this.params.dtSize ?? 64);
    (this.pass as any).goWild = this.params.wildGlitch ?? false;
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (this.pass) (this.pass as any).goWild = this.params.wildGlitch ?? false;
  }

  dispose() { this.pass?.dispose(); this.pass = null; }
}
