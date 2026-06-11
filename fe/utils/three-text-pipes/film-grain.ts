import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface FilmGrainPipeParams { intensity?: number; grayscale?: boolean; }

export class FilmGrainPipe implements EffectPipe {
  readonly name = 'filmGrain';
  private pass: InstanceType<typeof FilmPass> | null = null;
  constructor(public params: FilmGrainPipeParams = {}) {}

  setup(_ctx: PipeSetupContext) {}

  addComposerPass(composer: EffectComposer, _ctx: PipeSetupContext) {
    this.pass = new FilmPass(this.params.intensity ?? 0.35, this.params.grayscale ?? false);
    composer.addPass(this.pass);
  }

  update(_ctx: PipeFrameContext) {
    if (!this.pass) return;
    const u = (this.pass as any).uniforms;
    if (!u) return;
    if (this.params.intensity  !== undefined && u.intensity)  u.intensity.value  = this.params.intensity;
    if (this.params.grayscale  !== undefined && u.grayscale)  u.grayscale.value  = this.params.grayscale;
  }

  dispose() { this.pass?.dispose(); this.pass = null; }
}
