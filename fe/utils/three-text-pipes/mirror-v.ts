import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface MirrorVPipeParams { split?: number; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, split: { value: 0.5 } },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float split;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      float dist = abs(uv.y - split);
      float mirrorY = uv.y < split ? split + dist : split - dist;
      gl_FragColor = texture2D(tDiffuse, vec2(uv.x, mirrorY));
    }`,
};

export class MirrorVPipe extends ShaderPipeBase {
  readonly name = 'mirrorV';
  constructor(public params: MirrorVPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('split', this.params.split ?? 0.5);
  }
}
