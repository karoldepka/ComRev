import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ThermalPipeParams { intensity?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, intensity:{value:1.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float intensity; varying vec2 vUv;
    vec3 thermalColor(float t){
      vec3 cold=vec3(0.,0.,1.),cool=vec3(0.,1.,1.),mid=vec3(0.,1.,0.),warm=vec3(1.,1.,0.),hot=vec3(1.,0.,0.);
      if(t<.25)return mix(cold,cool,t*4.);
      if(t<.5) return mix(cool,mid,(t-.25)*4.);
      if(t<.75)return mix(mid,warm,(t-.5)*4.);
      return mix(warm,hot,(t-.75)*4.);}
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      float heat=dot(c.rgb,vec3(.299,.587,.114));
      gl_FragColor=vec4(mix(c.rgb,thermalColor(heat),intensity),c.a);}`,
};

export class ThermalPipe extends ShaderPipeBase {
  readonly name = 'thermal';
  constructor(public params: ThermalPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('intensity', this.params.intensity ?? 1); }
}
