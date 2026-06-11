import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface PosterizePipeParams { levels?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, levels:{value:4.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      gl_FragColor=vec4(floor(c.rgb*levels)/levels,c.a);}`,
};

export class PosterizePipe extends ShaderPipeBase {
  readonly name = 'posterize';
  constructor(public params: PosterizePipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('levels', Math.max(2, this.params.levels ?? 4)); }
}
