import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ZoomBlurPipeParams { strength?: number; samples?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, strength:{value:0.04}, samples:{value:10} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform int samples; varying vec2 vUv;
    void main(){
      vec2 dir=vUv-0.5;
      vec4 acc=vec4(0.); float total=0.;
      for(int i=0;i<32;i++){if(i>=samples)break;
        float t=float(i)/float(max(samples-1,1));
        acc+=texture2D(tDiffuse,vUv+dir*strength*t); total+=1.;}
      gl_FragColor=acc/total;}`,
};

export class ZoomBlurPipe extends ShaderPipeBase {
  readonly name = 'zoomBlur';
  constructor(public params: ZoomBlurPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 0.04);
    this.setU('samples',  Math.max(1, Math.min(32, Math.floor(this.params.samples ?? 10))));
  }
}
