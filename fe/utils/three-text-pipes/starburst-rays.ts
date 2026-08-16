import * as THREE from 'three';
import { EffectPipe, PipeFrameContext, PipeSetupContext } from './base';

export interface StarburstRaysPipeParams {
  color?: number;
  opacity?: number;
  rays?: number;
  speed?: number;
  size?: number;
  offsetZ?: number;
}

/** Thin light rays radiating slowly from center, fading toward the edges —
 * a calmer, more geometric cousin of MandalaPipe for background variety. */
export class StarburstRaysPipe implements EffectPipe {
  readonly name = 'starburstRays';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: StarburstRaysPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const geometry = new THREE.PlaneGeometry(this.params.size ?? 400, this.params.size ?? 400);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.params.color ?? 0xff9800) },
        uOpacity: { value: this.params.opacity ?? 0.14 },
        uRays: { value: this.params.rays ?? 16 },
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
        uniform float uRays;
        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          float angle = atan(p.y, p.x) + uTime * 0.04;
          float ray = pow(abs(cos(angle * uRays * 0.5)), 6.0);
          float shimmer = 0.85 + 0.15 * sin(radius * 24.0 - uTime * 0.6);
          float halo = smoothstep(0.02, 0.1, radius) * smoothstep(0.85, 0.15, radius);
          gl_FragColor = vec4(uColor, ray * shimmer * halo * uOpacity);
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
    material.uniforms.uOpacity.value = this.params.opacity ?? 0.14;
    material.uniforms.uRays.value = this.params.rays ?? 16;
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
