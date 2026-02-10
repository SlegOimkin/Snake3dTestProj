import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { QualityConfig } from "../config/game-config";

const StylizedPass = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteStrength: { value: 0.12 },
    chromaStrength: { value: 0.001 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float chromaStrength;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = dot(centered, centered);
      vec2 chromaOffset = centered * chromaStrength;
      float r = texture2D(tDiffuse, vUv + chromaOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - chromaOffset).b;
      vec3 color = vec3(r, g, b);
      color = pow(color, vec3(0.9));
      color += vec3(0.04, 0.05, 0.055);
      float vignette = max(0.78, 1.0 - dist * vignetteStrength * 1.35);
      gl_FragColor = vec4(color * vignette, 1.0);
    }
  `
};

export class PostFxPipeline {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly stylizedPass: ShaderPass;
  private enabled = true;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: QualityConfig) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 1, 0.4, 0.5);
    this.composer.addPass(this.bloomPass);
    this.stylizedPass = new ShaderPass(StylizedPass);
    this.composer.addPass(this.stylizedPass);
    this.applyQuality(quality);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  applyQuality(quality: QualityConfig): void {
    this.bloomPass.strength = quality.bloomStrength;
    this.bloomPass.radius = quality.bloomRadius;
    this.bloomPass.threshold = quality.bloomThreshold;
    this.stylizedPass.uniforms.vignetteStrength.value = quality.vignetteStrength;
    this.stylizedPass.uniforms.chromaStrength.value = quality.chromaStrength;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setPixelRatio(pixelRatio: number): void {
    const composer = this.composer as EffectComposer & { setPixelRatio?: (value: number) => void };
    composer.setPixelRatio?.(pixelRatio);
  }

  render(): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }
}
