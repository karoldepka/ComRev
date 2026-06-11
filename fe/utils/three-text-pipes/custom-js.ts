import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface CustomJsPipeParams {
  code: string;
  description?: string;
}

/**
 * Runs user-provided (AI-generated) JavaScript as an EffectPipe.
 * The code receives `THREE` and must return a plain object implementing the
 * EffectPipe interface (any subset of its methods).
 */
export class CustomJsPipe implements EffectPipe {
  readonly name = 'customJs';
  private inner: EffectPipe | null = null;
  compileError: string | null = null;

  constructor(public params: CustomJsPipeParams = { code: '' }) {
    this.compile();
    // Expose addComposerPass only when the inner pipe needs it,
    // so PipelineManager doesn't set up the composer unnecessarily.
    if (this.inner?.addComposerPass) {
      (this as any).addComposerPass = (composer: EffectComposer, ctx: PipeSetupContext) => {
        this.inner!.addComposerPass!(composer, ctx);
      };
    }
  }

  private compile() {
    const code = (this.params.code ?? '').trim();
    if (!code) return;
    try {
      const factory = new Function('THREE', `"use strict";\n${code}`);
      const result = factory(THREE);
      if (result && typeof result === 'object') {
        this.inner = result as EffectPipe;
      } else {
        this.compileError = 'Code did not return an object.';
      }
    } catch (e) {
      this.compileError = String(e);
      console.error('[CustomJsPipe] Compile error:', e);
    }
  }

  setup(ctx: PipeSetupContext) {
    this.inner?.setup?.(ctx);
  }

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, ctx: PipeSetupContext) {
    this.inner?.onMeshChanged?.(mesh, ctx);
  }

  update(ctx: PipeFrameContext) {
    try {
      this.inner?.update?.(ctx);
    } catch (e) {
      console.error('[CustomJsPipe] Runtime error:', e);
    }
  }

  dispose() {
    try {
      this.inner?.dispose?.();
    } catch (e) {
      console.error('[CustomJsPipe] Dispose error:', e);
    }
    this.inner = null;
  }
}
