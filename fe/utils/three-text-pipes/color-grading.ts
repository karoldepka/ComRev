import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ColorGradingPipeParams { hueShift?: number; saturation?: number; contrast?: number; brightness?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, hueShift:{value:0.0}, saturation:{value:1.0}, contrast:{value:1.0}, brightness:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float hueShift,saturation,contrast,brightness; varying vec2 vUv;
    vec3 rgb2hsl(vec3 c){float mx=max(max(c.r,c.g),c.b),mn=min(min(c.r,c.g),c.b);float h=0.,s=0.,l=(mx+mn)/2.;
      if(mx!=mn){float d=mx-mn;s=l>0.5?d/(2.-mx-mn):d/(mx+mn);
        if(mx==c.r)h=(c.g-c.b)/d+(c.g<c.b?6.:0.);else if(mx==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h/=6.;}return vec3(h,s,l);}
    float hue2rgb(float p,float q,float t){if(t<0.)t+=1.;if(t>1.)t-=1.;if(t<1./6.)return p+(q-p)*6.*t;if(t<.5)return q;if(t<2./3.)return p+(q-p)*(2./3.-t)*6.;return p;}
    vec3 hsl2rgb(vec3 c){if(c.y==0.)return vec3(c.z);float q=c.z<.5?c.z*(1.+c.y):c.z+c.y-c.z*c.y,p=2.*c.z-q;
      return vec3(hue2rgb(p,q,c.x+1./3.),hue2rgb(p,q,c.x),hue2rgb(p,q,c.x-1./3.));}
    void main(){vec4 tex=texture2D(tDiffuse,vUv);vec3 hsl=rgb2hsl(tex.rgb);
      hsl.x=fract(hsl.x+hueShift);hsl.y=clamp(hsl.y*saturation,0.,1.);
      vec3 col=hsl2rgb(hsl);col=(col-0.5)*contrast+0.5+brightness;
      gl_FragColor=vec4(clamp(col,0.,1.),tex.a);}`,
};

export class ColorGradingPipe extends ShaderPipeBase {
  readonly name = 'colorGrading';
  constructor(public params: ColorGradingPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('hueShift',   this.params.hueShift   ?? 0);
    this.setU('saturation', this.params.saturation ?? 1);
    this.setU('contrast',   this.params.contrast   ?? 1);
    this.setU('brightness', this.params.brightness ?? 0);
  }
}
