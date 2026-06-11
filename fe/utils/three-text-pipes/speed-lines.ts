import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface SpeedLinesPipeParams { intensity?: number; lineCount?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, intensity:{value:0.5}, lineCount:{value:48.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float intensity,lineCount; varying vec2 vUv;
    float rand(float x){return fract(sin(x*127.1)*43758.5453);}
    void main(){
      vec2 uv=vUv-0.5;
      float angle=atan(uv.y,uv.x);
      float r=length(uv);
      float seg=floor((angle+3.14159265)/6.28318530*lineCount);
      float thick=rand(seg)*0.4+0.1;
      float speed=rand(seg+100.)*0.6+0.4;
      float line=smoothstep(0.,thick,1.-r*speed);
      vec4 c=texture2D(tDiffuse,vUv);
      gl_FragColor=vec4(c.rgb+line*intensity,c.a);}`,
};

export class SpeedLinesPipe extends ShaderPipeBase {
  readonly name = 'speedLines';
  constructor(public params: SpeedLinesPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('intensity',  this.params.intensity  ?? 0.5);
    this.setU('lineCount',  this.params.lineCount  ?? 48);
  }
}
