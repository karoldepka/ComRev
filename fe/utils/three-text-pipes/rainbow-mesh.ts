import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext, PipeFrameContext } from './base';

export interface RainbowMeshPipeParams { speed?: number; saturation?: number; }

export class RainbowMeshPipe extends LayeredMeshPipeBase {
  readonly name = 'rainbowMesh';
  private materials: THREE.ShaderMaterial[] = [];

  constructor(public params: RainbowMeshPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    this.materials = [];
    const bbox = new THREE.Box3().setFromObject(original);
    const minX = bbox.min.x, maxX = bbox.max.x;
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { minX: { value: minX }, maxX: { value: maxX }, time: { value: 0 }, saturation: { value: 1 } },
          vertexShader: `varying float vX; void main(){vX=(modelMatrix*vec4(position,1.)).x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `uniform float minX,maxX,time,saturation; varying float vX;
            vec3 hsl2rgb(float h,float s,float l){
              float c=(1.-abs(2.*l-1.))*s;float x=c*(1.-abs(mod(h*6.,2.)-1.));float m=l-c/2.;
              if(h<1./6.)return vec3(c+m,x+m,m);if(h<2./6.)return vec3(x+m,c+m,m);
              if(h<3./6.)return vec3(m,c+m,x+m);if(h<4./6.)return vec3(m,x+m,c+m);
              if(h<5./6.)return vec3(x+m,m,c+m);return vec3(c+m,m,x+m);}
            void main(){
              float h=fract((vX-minX)/(maxX-minX+0.001)+time);
              gl_FragColor=vec4(hsl2rgb(h,saturation,0.6),1.);}`,
        });
        child.material = mat;
        this.materials.push(mat);
      }
    });
  }

  protected tick(ctx: PipeFrameContext) {
    for (const mat of this.materials) {
      mat.uniforms.time.value = ctx.time * (this.params.speed ?? 0.3);
      mat.uniforms.saturation.value = this.params.saturation ?? 1;
    }
  }

  dispose() {
    super.dispose();
    this.materials = [];
  }
}
