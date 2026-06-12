import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext, PipeFrameContext } from './base';

export interface IridescentPipeParams { speed?: number; }

export class IridescentPipe extends LayeredMeshPipeBase {
  readonly name = 'iridescent';
  private materials: THREE.ShaderMaterial[] = [];

  constructor(public params: IridescentPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    this.materials = [];
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { time: { value: 0 } },
          vertexShader: `varying vec3 vNormal; varying vec3 vViewDir;
            void main(){vNormal=normalize(normalMatrix*normal);
              vec4 mvPos=modelViewMatrix*vec4(position,1.);vViewDir=normalize(-mvPos.xyz);
              gl_Position=projectionMatrix*mvPos;}`,
          fragmentShader: `varying vec3 vNormal; varying vec3 vViewDir; uniform float time;
            vec3 hsl2rgb(float h){float c=0.7;float x=c*(1.-abs(mod(h*6.,2.)-1.));
              if(h<1./6.)return vec3(c,x,0.);if(h<2./6.)return vec3(x,c,0.);
              if(h<3./6.)return vec3(0.,c,x);if(h<4./6.)return vec3(0.,x,c);
              if(h<5./6.)return vec3(x,0.,c);return vec3(c,0.,x);}
            void main(){
              float rim=1.-dot(vNormal,vViewDir);
              float h=fract(rim*2.+time*0.2);
              gl_FragColor=vec4(mix(hsl2rgb(h),vec3(1.),0.3),1.);}`,
        });
        child.material = mat;
        this.materials.push(mat);
      }
    });
  }

  protected tick(ctx: PipeFrameContext) {
    for (const mat of this.materials) mat.uniforms.time.value = ctx.time * (this.params.speed ?? 1);
  }

  dispose() {
    super.dispose();
    this.materials = [];
  }
}
