import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface InvertPipeParams { amount?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:1.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(mix(c.rgb,1.-c.rgb,amount),c.a);}`,
};

export class InvertPipe extends ShaderPipeBase {
  readonly name = 'invert';
  constructor(public params: InvertPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('amount', this.params.amount ?? 1); }
}
