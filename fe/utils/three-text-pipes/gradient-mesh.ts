import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, MaterialMap, saveMeshMaterials, restoreMeshMaterials } from './base';

export interface GradientMeshPipeParams { colorTop?: number; colorBottom?: number; animated?: boolean; speed?: number; }

export class GradientMeshPipe implements EffectPipe {
  readonly name = 'gradientMesh';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private materials: THREE.ShaderMaterial[] = [];
  private savedMaterials: MaterialMap = new Map();
  private bbox = new THREE.Box3();

  constructor(public params: GradientMeshPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    restoreMeshMaterials(this.savedMaterials);
    this.mesh = mesh; this.materials = [];
    if (!mesh) return;
    this.savedMaterials = saveMeshMaterials(mesh);
    this.bbox.setFromObject(mesh);
    const colorTop    = new THREE.Color(this.params.colorTop    ?? 0xff6600);
    const colorBottom = new THREE.Color(this.params.colorBottom ?? 0x0066ff);
    const minY = this.bbox.min.y, maxY = this.bbox.max.y;
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { colorTop:{value:colorTop}, colorBottom:{value:colorBottom}, minY:{value:minY}, maxY:{value:maxY}, time:{value:0}, animated:{value:0} },
          vertexShader: `varying float vY; void main(){vY=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `uniform vec3 colorTop,colorBottom; uniform float minY,maxY,time,animated;
            varying float vY;
            void main(){
              float t=clamp((vY-minY)/(maxY-minY+0.001),0.,1.);
              if(animated>0.)t=fract(t+time*0.3);
              gl_FragColor=vec4(mix(colorBottom,colorTop,t),1.);}`,
        });
        child.material = mat;
        this.materials.push(mat);
      }
    });
  }

  update(ctx: PipeFrameContext) {
    const animated = this.params.animated ?? false;
    for (const mat of this.materials) {
      mat.uniforms.time.value = ctx.time * (this.params.speed ?? 1);
      mat.uniforms.animated.value = animated ? 1 : 0;
      mat.uniforms.colorTop.value = new THREE.Color(this.params.colorTop ?? 0xff6600);
      mat.uniforms.colorBottom.value = new THREE.Color(this.params.colorBottom ?? 0x0066ff);
    }
  }

  dispose() {
    restoreMeshMaterials(this.savedMaterials);
    this.materials = []; this.mesh = null;
  }
}
