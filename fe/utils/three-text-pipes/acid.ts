import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface AcidPipeParams { strength?: number; speed?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, strength:{value:0.08}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength,time; varying vec2 vUv;
    void main(){
      vec2 uv=vUv;
      uv.x+=sin(uv.y*15.+time*3.)*strength;
      uv.y+=cos(uv.x*12.+time*2.7)*strength;
      vec4 c=texture2D(tDiffuse,uv);
      c.r=texture2D(tDiffuse,uv+vec2(sin(time*1.3)*strength*.5,0.)).r;
      c.b=texture2D(tDiffuse,uv-vec2(0.,sin(time*1.7)*strength*.5)).b;
      gl_FragColor=c;}`,
};

export class AcidPipe extends ShaderPipeBase {
  readonly name = 'acid';
  constructor(public params: AcidPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 0.08);
    this.setU('time',     ctx.time * (this.params.speed ?? 1));
  }
}
