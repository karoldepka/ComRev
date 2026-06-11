import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface SepiaPipeParams { amount?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:1.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      float r=dot(c.rgb,vec3(.393,.769,.189)),g=dot(c.rgb,vec3(.349,.686,.168)),b=dot(c.rgb,vec3(.272,.534,.131));
      gl_FragColor=vec4(mix(c.rgb,vec3(r,g,b),amount),c.a);}`,
};

export class SepiaPipe extends ShaderPipeBase {
  readonly name = 'sepia';
  constructor(public params: SepiaPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('amount', this.params.amount ?? 1); }
}
