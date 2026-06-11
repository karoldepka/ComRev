import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface RetroTvPipeParams { scanlineIntensity?: number; curvature?: number; noise?: number; }

const SHADER = {
  uniforms: {
    tDiffuse:{value:null}, scanlineIntensity:{value:0.2}, curvature:{value:5.0},
    noise:{value:0.05}, time:{value:0.0}, resolution:{value:new THREE.Vector2(512,512)},
  },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float scanlineIntensity,curvature,noise,time; uniform vec2 resolution; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    vec2 crtUV(vec2 uv,float b){uv=uv*2.-1.;uv+=uv*abs(uv.yx)/b;return uv*0.5+0.5;}
    void main(){
      vec2 uv=crtUV(vUv,curvature);
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.);return;}
      vec4 c=texture2D(tDiffuse,uv);
      c.rgb-=(sin(uv.y*resolution.y*3.14159265)*0.5+0.5)*scanlineIntensity;
      c.rgb+=rand(uv+time)*noise;
      c.rgb=clamp(c.rgb,0.,1.);
      gl_FragColor=c;}`,
};

export class RetroTvPipe extends ShaderPipeBase {
  readonly name = 'retroTv';
  constructor(public params: RetroTvPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('resolution', new THREE.Vector2(ctx.width, ctx.height));
  }
  update(ctx: PipeFrameContext) {
    this.setU('scanlineIntensity', this.params.scanlineIntensity ?? 0.2);
    this.setU('curvature',         this.params.curvature         ?? 5);
    this.setU('noise',             this.params.noise             ?? 0.05);
    this.setU('time',              ctx.time);
  }
}
