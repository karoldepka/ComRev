import * as THREE from 'three';
import { EffectPipe, PipeFrameContext, PipeSetupContext } from './base';

export interface ConcentricRipplesPipeParams {
  color?: number;
  opacity?: number;
  rings?: number;
  speed?: number;
  size?: number;
  offsetZ?: number;
}

/** Soft rings expanding outward from center like a water ripple — a calmer,
 * more meditative cousin of MandalaPipe for background variety. */
export class ConcentricRipplesPipe implements EffectPipe {
  readonly name = 'concentricRipples';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: ConcentricRipplesPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const geometry = new THREE.PlaneGeometry(this.params.size ?? 400, this.params.size ?? 400);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.params.color ?? 0xff9800) },
        uOpacity: { value: this.params.opacity ?? 0.13 },
        uRings: { value: this.params.rings ?? 6 },
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
        uniform float uRings;
        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          // Rings travel outward: subtracting time from radius before the
          // periodic function makes the phase move toward larger radius.
          float phase = radius * uRings * 6.0 - uTime * 0.7;
          float ring = smoothstep(0.75, 1.0, cos(phase) * 0.5 + 0.5);
          float halo = smoothstep(0.02, 0.14, radius) * smoothstep(0.8, 0.2, radius);
          gl_FragColor = vec4(uColor, ring * halo * uOpacity);
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
    material.uniforms.uOpacity.value = this.params.opacity ?? 0.13;
    material.uniforms.uRings.value = this.params.rings ?? 6;
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
