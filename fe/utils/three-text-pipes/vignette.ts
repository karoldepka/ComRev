import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface VignettePipeParams { offset?: number; darkness?: number; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, offset: { value: 0.5 }, darkness: { value: 1.0 } },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float offset,darkness; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float d=distance(vUv,vec2(0.5));
      c.rgb*=smoothstep(0.8,offset*0.799,d*(darkness+offset));
      gl_FragColor=c;
    }`,
};

export class VignettePipe extends ShaderPipeBase {
  readonly name = 'vignette';
  constructor(public params: VignettePipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('offset',   this.params.offset   ?? 0.5);
    this.setU('darkness', this.params.darkness ?? 1.0);
  }
}
