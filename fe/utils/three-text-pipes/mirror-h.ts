import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface MirrorHPipeParams { split?: number; flipBottom?: boolean; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, split: { value: 0.5 } },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float split;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      float dist = abs(uv.x - split);
      float mirrorX = uv.x < split ? split + dist : split - dist;
      gl_FragColor = texture2D(tDiffuse, vec2(mirrorX, uv.y));
    }`,
};

export class MirrorHPipe extends ShaderPipeBase {
  readonly name = 'mirrorH';
  constructor(public params: MirrorHPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('split', this.params.split ?? 0.5);
  }
}
