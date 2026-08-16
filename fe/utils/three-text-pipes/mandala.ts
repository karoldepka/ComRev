import * as THREE from 'three';
import { EffectPipe, PipeFrameContext, PipeSetupContext } from './base';

export interface MandalaPipeParams {
  color?: number;
  opacity?: number;
  petals?: number;
  rings?: number;
  speed?: number;
  size?: number;
  offsetZ?: number;
}

/** A lightweight animated radial pattern rendered behind the text. */
export class MandalaPipe implements EffectPipe {
  readonly name = 'mandala';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: MandalaPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const geometry = new THREE.PlaneGeometry(this.params.size ?? 400, this.params.size ?? 400);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.params.color ?? 0xff9800) },
        uOpacity: { value: this.params.opacity ?? 0.16 },
        uPetals: { value: this.params.petals ?? 12 },
        uRings: { value: this.params.rings ?? 4 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPetals;
        uniform float uRings;
        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          float angle = atan(p.y, p.x) + uTime * 0.08;
          float petalWave = cos(angle * uPetals) * 0.5 + 0.5;
          float ringWave = cos(radius * uRings * 18.0 - uTime * 0.45) * 0.5 + 0.5;
          float petals = smoothstep(0.56, 0.92, petalWave * ringWave);
          float halo = smoothstep(0.02, 0.19, radius) * smoothstep(0.74, 0.28, radius);
          gl_FragColor = vec4(uColor, petals * halo * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.z = this.params.offsetZ ?? -50;
    this.mesh.renderOrder = -20;
    ctx.scene.add(this.mesh);
  }

  update(ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const material = this.mesh.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = ctx.time * (this.params.speed ?? 1);
    material.uniforms.uColor.value.set(this.params.color ?? 0xff9800);
    material.uniforms.uOpacity.value = this.params.opacity ?? 0.16;
    material.uniforms.uPetals.value = this.params.petals ?? 12;
    material.uniforms.uRings.value = this.params.rings ?? 4;
    this.mesh.position.z = this.params.offsetZ ?? -50;
  }

  dispose() {
    if (!this.mesh || !this.scene) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
