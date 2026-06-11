import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ScanlinesPipeParams { count?: number; intensity?: number; scrollSpeed?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, count:{value:100.0}, intensity:{value:0.3}, scrollSpeed:{value:0.0}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float count,intensity,scrollSpeed,time; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float y=vUv.y+time*scrollSpeed;
      c.rgb-=(sin(y*count*3.14159265)*0.5+0.5)*intensity;
      gl_FragColor=c;
    }`,
};

export class ScanlinesPipe extends ShaderPipeBase {
  readonly name = 'scanlines';
  constructor(public params: ScanlinesPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('count',       this.params.count       ?? 100);
    this.setU('intensity',   this.params.intensity   ?? 0.3);
    this.setU('scrollSpeed', this.params.scrollSpeed ?? 0);
    this.setU('time',        ctx.time);
  }
}
