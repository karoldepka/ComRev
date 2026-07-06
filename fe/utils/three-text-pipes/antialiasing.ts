import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export type AntialiasingPipeParams = Record<string, never>;

export class AntialiasingPipe implements EffectPipe {
  readonly name = 'antialiasing';
  private pass: SMAAPass | null = null;

  constructor(public params: AntialiasingPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new SMAAPass();
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {}

  dispose() {
    this.pass?.dispose();
    this.pass = null;
  }
}
