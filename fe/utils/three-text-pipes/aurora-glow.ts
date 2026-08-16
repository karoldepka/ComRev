import * as THREE from 'three';
import { EffectPipe, PipeFrameContext, PipeSetupContext } from './base';

export interface AuroraGlowPipeParams {
  color?: number;
  color2?: number;
  opacity?: number;
  speed?: number;
  size?: number;
  offsetZ?: number;
}

/** Smooth, slowly drifting color bands blended from two hues — softer and
 * less geometric than MandalaPipe/StarburstRaysPipe/ConcentricRipplesPipe,
 * for background variety with a premium, ambient feel. */
export class AuroraGlowPipe implements EffectPipe {
  readonly name = 'auroraGlow';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: AuroraGlowPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const geometry = new THREE.PlaneGeometry(this.params.size ?? 400, this.params.size ?? 400);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.params.color ?? 0xff9800) },
        uColor2: { value: new THREE.Color(this.params.color2 ?? 0x2266ff) },
        uOpacity: { value: this.params.opacity ?? 0.13 },
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
        uniform vec3 uColor2;
        uniform float uOpacity;
        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          // Layered sine bands drifting diagonally, blended between two hues.
          float band = sin(p.x * 2.2 + p.y * 1.3 + uTime * 0.25) * 0.5
                      + sin(p.y * 3.1 - p.x * 0.8 - uTime * 0.18) * 0.5;
          float mixAmt = smoothstep(-1.0, 1.0, band);
          vec3 color = mix(uColor, uColor2, mixAmt);
          float intensity = 0.5 + 0.5 * sin(band * 3.14159 + uTime * 0.3);
          float halo = smoothstep(0.03, 0.2, radius) * smoothstep(0.82, 0.3, radius);
          gl_FragColor = vec4(color, intensity * halo * uOpacity);
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
    material.uniforms.uColor2.value.set(this.params.color2 ?? 0x2266ff);
    material.uniforms.uOpacity.value = this.params.opacity ?? 0.13;
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
