import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3
} from "three";
import type { QualityConfig } from "../config/game-config";
import type { Vec3 } from "../types";
import {
  createDeterministicRng,
  createSkyProfile,
  generateStarFieldData,
  hexToRgb01,
  type SkyProfile
} from "./space-sky-utils";

interface NebulaLayer {
  mesh: Mesh;
  material: ShaderMaterial;
  speedY: number;
  speedX: number;
  phase: number;
}

interface StarLayerVisual {
  points: Points;
  material: ShaderMaterial;
  speedY: number;
  speedX: number;
}

interface PlanetVisual {
  group: Group;
  body: Mesh;
  atmosphere: Mesh;
  atmosphereMaterial: ShaderMaterial;
  ring: Mesh | null;
  spinSpeed: number;
  orbitSpeed: number;
  phase: number;
}

const DOME_VERTEX_SHADER = `
  varying vec3 vDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vDir = normalize(worldPos.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT_SHADER = `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uNoiseOctaves;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, u.x);
    float x10 = mix(n010, n110, u.x);
    float x01 = mix(n001, n101, u.x);
    float x11 = mix(n011, n111, u.x);
    float y0 = mix(x00, x10, u.y);
    float y1 = mix(x01, x11, u.y);
    return mix(y0, y1, u.z);
  }

  float fbm(vec3 p, float octaves) {
    float sum = 0.0;
    float amp = 0.5;
    vec3 pp = p;
    for (int i = 0; i < 5; i++) {
      float enabled = step(float(i), octaves - 0.5);
      sum += noise(pp) * amp * enabled;
      pp *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float horizon = smoothstep(-0.45, 0.75, dir.y);
    vec3 low = vec3(0.006, 0.015, 0.035);
    vec3 mid = vec3(0.015, 0.045, 0.095);
    vec3 high = vec3(0.03, 0.085, 0.17);
    vec3 base = mix(low, mid, horizon);
    base = mix(base, high, pow(horizon, 2.0));

    float cloud = fbm(dir * 4.6 + vec3(uTime * 0.014, uTime * 0.009, 0.0), uNoiseOctaves);
    base += vec3(0.03, 0.09, 0.19) * cloud * cloud;
    base += vec3(0.06, 0.03, 0.11) * max(0.0, cloud - 0.58) * 0.75;
    gl_FragColor = vec4(base, 1.0);
  }
`;

const GALAXY_FRAGMENT_SHADER = `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uNoiseOctaves;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(113.1, 271.7, 54.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, u.x);
    float x10 = mix(n010, n110, u.x);
    float x01 = mix(n001, n101, u.x);
    float x11 = mix(n011, n111, u.x);
    float y0 = mix(x00, x10, u.y);
    float y1 = mix(x01, x11, u.y);
    return mix(y0, y1, u.z);
  }

  float fbm(vec3 p, float octaves) {
    float sum = 0.0;
    float amp = 0.5;
    vec3 pp = p;
    for (int i = 0; i < 5; i++) {
      float enabled = step(float(i), octaves - 0.5);
      sum += noise(pp) * amp * enabled;
      pp *= 2.04;
      amp *= 0.53;
    }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 bandNormal = normalize(vec3(0.24, 0.95, 0.18));
    float planeDistance = abs(dot(dir, bandNormal));
    float band = exp(-pow(planeDistance / 0.19, 2.0));
    float swirl = atan(dir.z, dir.x);
    float radial = length(dir.xz);
    float arm = 0.5 + 0.5 * sin(swirl * 6.0 + radial * 26.0 - uTime * 0.42);
    float cloud = fbm(dir * 8.4 + vec3(uTime * 0.05, 0.0, -uTime * 0.028), uNoiseOctaves);
    float intensity = band * (0.4 + cloud) * (0.62 + arm * 0.38);

    vec3 coreA = vec3(0.72, 0.9, 1.0) * pow(max(dot(dir, normalize(vec3(0.66, 0.2, 0.72))), 0.0), 92.0);
    vec3 coreB = vec3(1.0, 0.76, 0.5) * pow(max(dot(dir, normalize(vec3(-0.56, -0.1, -0.82))), 0.0), 88.0);
    vec3 color = mix(vec3(0.11, 0.24, 0.46), vec3(0.82, 0.95, 1.0), cloud);
    color += vec3(0.22, 0.12, 0.38) * arm * 0.35;
    color += coreA + coreB;
    float alpha = clamp(intensity * 0.65, 0.0, 0.82);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

const NEBULA_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uNoiseOctaves;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(71.3, 191.7, 151.3))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, u.x);
    float x10 = mix(n010, n110, u.x);
    float x01 = mix(n001, n101, u.x);
    float x11 = mix(n011, n111, u.x);
    float y0 = mix(x00, x10, u.y);
    float y1 = mix(x01, x11, u.y);
    return mix(y0, y1, u.z);
  }

  float fbm(vec3 p, float octaves) {
    float sum = 0.0;
    float amp = 0.5;
    vec3 pp = p;
    for (int i = 0; i < 5; i++) {
      float enabled = step(float(i), octaves - 0.5);
      sum += noise(pp) * amp * enabled;
      pp *= 2.08;
      amp *= 0.55;
    }
    return sum;
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 1.8);
    float field = fbm(vWorldPos * 0.028 + vec3(uTime * 0.1 + uPhase, -uTime * 0.06, 0.0), uNoiseOctaves);
    float wisps = smoothstep(0.45, 0.93, field);
    float alpha = wisps * fresnel * uOpacity;
    vec3 color = mix(uColorA, uColorB, field) * (0.46 + wisps * 1.18);
    gl_FragColor = vec4(color, alpha);
  }
`;

const STAR_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.65 + 0.35 * sin(uTime * uTwinkle + aPhase);
    vColor = aColor * twinkle;
    vAlpha = twinkle;
    float distanceToCamera = max(1.0, length(mvPosition.xyz));
    gl_PointSize = max(1.0, aSize * (240.0 / distanceToCamera));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float halo = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.16, 0.0, dist);
    float alpha = halo * 0.85 + core * 0.6;
    gl_FragColor = vec4(vColor, alpha * vAlpha);
  }
`;

const ATMOSPHERE_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uStrength;
  uniform float uTime;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.3);
    float pulse = 0.86 + 0.14 * sin(uTime * 0.42);
    float alpha = fresnel * uStrength * pulse;
    vec3 color = mix(uColorA, uColorB, fresnel);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class SpaceSkySystem {
  readonly root: Group;

  private readonly camera: PerspectiveCamera;
  private profile: SkyProfile;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private dome: Mesh | null = null;
  private domeMaterial: ShaderMaterial | null = null;
  private galaxyBand: Mesh | null = null;
  private galaxyMaterial: ShaderMaterial | null = null;
  private nebulaLayers: NebulaLayer[] = [];
  private starLayers: StarLayerVisual[] = [];
  private planets: PlanetVisual[] = [];

  constructor(quality: QualityConfig, camera: PerspectiveCamera) {
    this.root = new Group();
    this.camera = camera;
    this.profile = createSkyProfile(quality);
    this.rebuild();
  }

  applyQuality(quality: QualityConfig): void {
    this.profile = createSkyProfile(quality);
    this.rebuild();
  }

  update(elapsedSec: number, anchor: Vec3): void {
    this.root.position.set(anchor.x, 2.4, anchor.z);

    if (this.dome) {
      this.dome.rotation.y = elapsedSec * 0.005;
    }
    if (this.galaxyBand) {
      this.galaxyBand.rotation.y = -elapsedSec * 0.008;
      this.galaxyBand.rotation.z = 0.22 + Math.sin(elapsedSec * 0.06) * 0.025;
      this.galaxyBand.rotation.x = -0.14 + this.camera.position.y * 0.0015;
    }
    if (this.domeMaterial) {
      this.domeMaterial.uniforms.uTime.value = elapsedSec;
    }
    if (this.galaxyMaterial) {
      this.galaxyMaterial.uniforms.uTime.value = elapsedSec;
    }

    for (const [index, layer] of this.nebulaLayers.entries()) {
      layer.material.uniforms.uTime.value = elapsedSec;
      layer.mesh.rotation.y = layer.phase + elapsedSec * layer.speedY;
      layer.mesh.rotation.x = Math.sin(elapsedSec * (layer.speedX * 0.55 + 0.07) + index) * 0.18;
    }

    for (const layer of this.starLayers) {
      layer.material.uniforms.uTime.value = elapsedSec;
      layer.points.rotation.y = elapsedSec * layer.speedY;
      layer.points.rotation.x = Math.sin(elapsedSec * layer.speedX) * 0.06;
    }

    for (const [index, planet] of this.planets.entries()) {
      planet.group.rotation.y = planet.phase + elapsedSec * planet.orbitSpeed;
      planet.body.rotation.y = elapsedSec * planet.spinSpeed;
      planet.body.rotation.z = Math.sin(elapsedSec * 0.05 + index) * 0.09;
      planet.atmosphere.rotation.y = -elapsedSec * planet.spinSpeed * 1.18;
      planet.atmosphereMaterial.uniforms.uTime.value = elapsedSec;
      if (planet.ring) {
        planet.ring.rotation.z = elapsedSec * 0.032;
      }
    }
  }

  dispose(): void {
    this.clearObjects();
  }

  private rebuild(): void {
    this.clearObjects();
    this.buildSkyDome();
    this.buildGalaxyBand();
    this.buildNebulaLayers();
    this.buildStarLayers();
    this.buildPlanets();
  }

  private buildSkyDome(): void {
    const geometry = this.trackGeometry(new SphereGeometry(172, 64, 40));
    const material = this.trackMaterial(
      new ShaderMaterial({
        vertexShader: DOME_VERTEX_SHADER,
        fragmentShader: DOME_FRAGMENT_SHADER,
        side: BackSide,
        depthWrite: false,
        transparent: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uNoiseOctaves: { value: this.profile.noiseOctaves }
        }
      })
    );
    const dome = new Mesh(geometry, material);
    dome.frustumCulled = false;
    dome.renderOrder = -50;
    this.root.add(dome);
    this.dome = dome;
    this.domeMaterial = material;
  }

  private buildGalaxyBand(): void {
    const geometry = this.trackGeometry(new SphereGeometry(169, 56, 36));
    const material = this.trackMaterial(
      new ShaderMaterial({
        vertexShader: DOME_VERTEX_SHADER,
        fragmentShader: GALAXY_FRAGMENT_SHADER,
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uNoiseOctaves: { value: this.profile.noiseOctaves }
        }
      })
    );
    const band = new Mesh(geometry, material);
    band.frustumCulled = false;
    band.renderOrder = -49;
    this.root.add(band);
    this.galaxyBand = band;
    this.galaxyMaterial = material;
  }

  private buildNebulaLayers(): void {
    const palette: Array<[string, string]> = [
      ["#3ac7ff", "#4a4cff"],
      ["#ffbc8e", "#ff6a68"],
      ["#7af0dc", "#1c97d1"],
      ["#95b3ff", "#5d57ff"]
    ];
    for (let i = 0; i < this.profile.nebulaShells; i += 1) {
      const radius = 126 + i * 8;
      const [colorA, colorB] = palette[i % palette.length];
      const geometry = this.trackGeometry(
        new SphereGeometry(radius, Math.max(18, this.profile.planetSegments), Math.max(12, this.profile.planetSegments / 2))
      );
      const material = this.trackMaterial(
        new ShaderMaterial({
          vertexShader: NEBULA_VERTEX_SHADER,
          fragmentShader: NEBULA_FRAGMENT_SHADER,
          side: BackSide,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
          uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.18 + i * 0.04 },
            uPhase: { value: i * Math.PI * 0.63 },
            uNoiseOctaves: { value: this.profile.noiseOctaves },
            uColorA: { value: new Color(colorA) },
            uColorB: { value: new Color(colorB) }
          }
        })
      );
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = -46 + i;
      this.root.add(mesh);
      this.nebulaLayers.push({
        mesh,
        material,
        speedY: 0.008 + i * 0.0035,
        speedX: 0.005 + i * 0.0025,
        phase: i * 0.9
      });
    }
  }

  private buildStarLayers(): void {
    for (let i = 0; i < this.profile.starLayers.length; i += 1) {
      const layer = this.profile.starLayers[i];
      const rng = createDeterministicRng(911 + i * 997 + layer.count * 13);
      const data = generateStarFieldData(layer, rng);
      const geometry = this.trackGeometry(new BufferGeometry());
      geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
      geometry.setAttribute("aSize", new Float32BufferAttribute(data.sizes, 1));
      geometry.setAttribute("aPhase", new Float32BufferAttribute(data.phases, 1));
      geometry.setAttribute("aColor", new Float32BufferAttribute(data.colors, 3));
      const material = this.trackMaterial(
        new ShaderMaterial({
          vertexShader: STAR_VERTEX_SHADER,
          fragmentShader: STAR_FRAGMENT_SHADER,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
          uniforms: {
            uTime: { value: 0 },
            uTwinkle: { value: layer.twinkleSpeed }
          }
        })
      );
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = -42 + i;
      this.root.add(points);
      this.starLayers.push({
        points,
        material,
        speedY: 0.004 + i * 0.0025,
        speedX: 0.021 + i * 0.004
      });
    }
  }

  private buildPlanets(): void {
    const configs = [
      {
        dir: new Vector3(-0.74, 0.31, -0.58),
        radius: 140,
        size: 7.3,
        color: "#6c8fd8",
        emissive: "#2a4b93",
        atmosphereA: "#9fd4ff",
        atmosphereB: "#6ea3ff",
        hasRing: true,
        phase: 0.3
      },
      {
        dir: new Vector3(0.63, 0.4, 0.66),
        radius: 147,
        size: 5.1,
        color: "#9b7ce1",
        emissive: "#4f3e96",
        atmosphereA: "#ffcda0",
        atmosphereB: "#8ad8ff",
        hasRing: false,
        phase: 2.1
      }
    ] as const;

    for (let i = 0; i < this.profile.largeBodies; i += 1) {
      const cfg = configs[i];
      const group = new Group();
      group.position.copy(cfg.dir.clone().normalize().multiplyScalar(cfg.radius));
      group.frustumCulled = false;

      const bodyGeometry = this.trackGeometry(new SphereGeometry(cfg.size, this.profile.planetSegments, Math.max(12, this.profile.planetSegments / 2)));
      const bodyMaterial = this.trackMaterial(
        new MeshStandardMaterial({
          color: cfg.color,
          emissive: cfg.emissive,
          emissiveIntensity: 0.62,
          roughness: 0.76,
          metalness: 0.08,
          fog: false
        })
      );
      const body = new Mesh(bodyGeometry, bodyMaterial);
      body.frustumCulled = false;
      group.add(body);

      const atmosphereGeometry = this.trackGeometry(
        new SphereGeometry(cfg.size * 1.12, this.profile.planetSegments, Math.max(12, this.profile.planetSegments / 2))
      );
      const atmosphereMaterial = this.trackMaterial(
        new ShaderMaterial({
          vertexShader: ATMOSPHERE_VERTEX_SHADER,
          fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
          uniforms: {
            uColorA: { value: new Color(cfg.atmosphereA) },
            uColorB: { value: new Color(cfg.atmosphereB) },
            uStrength: { value: 0.68 },
            uTime: { value: 0 }
          }
        })
      );
      const atmosphere = new Mesh(atmosphereGeometry, atmosphereMaterial);
      atmosphere.frustumCulled = false;
      group.add(atmosphere);

      let ring: Mesh | null = null;
      if (cfg.hasRing) {
        const ringGeometry = this.trackGeometry(new RingGeometry(cfg.size * 1.45, cfg.size * 2.3, 128));
        const ringTexture = this.trackTexture(this.createRingTexture());
        const [r, g, b] = hexToRgb01("#cae6ff");
        const ringMaterial = this.trackMaterial(
          new MeshBasicMaterial({
            map: ringTexture,
            color: new Color(r, g, b),
            transparent: true,
            opacity: 0.74,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            fog: false
          })
        );
        ring = new Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = 1.08;
        ring.rotation.y = 0.17;
        ring.frustumCulled = false;
        group.add(ring);
      }

      group.renderOrder = -35 + i;
      this.root.add(group);
      this.planets.push({
        group,
        body,
        atmosphere,
        atmosphereMaterial,
        ring,
        spinSpeed: 0.1 + i * 0.03,
        orbitSpeed: 0.018 + i * 0.005,
        phase: cfg.phase
      });
    }
  }

  private createRingTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    if (!ctx) {
      return texture;
    }

    const center = canvas.width / 2;
    const inner = 138;
    const outer = 250;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 190; i += 1) {
      const t = i / 189;
      const radius = inner + (outer - inner) * t;
      const profile = 1 - Math.abs(t - 0.5) * 2;
      const alpha = (0.17 + profile * 0.65) * (0.55 + Math.random() * 0.45);
      ctx.strokeStyle = `rgba(210, 235, 255, ${alpha.toFixed(4)})`;
      ctx.lineWidth = 1 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const mask = ctx.createRadialGradient(center, center, inner * 0.7, center, center, outer * 1.05);
    mask.addColorStop(0, "rgba(255,255,255,0)");
    mask.addColorStop(0.33, "rgba(255,255,255,0.95)");
    mask.addColorStop(0.78, "rgba(255,255,255,0.92)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    texture.needsUpdate = true;
    return texture;
  }

  private clearObjects(): void {
    this.root.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    for (const texture of this.textures) {
      texture.dispose();
    }
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
    this.nebulaLayers.length = 0;
    this.starLayers.length = 0;
    this.planets.length = 0;
    this.dome = null;
    this.domeMaterial = null;
    this.galaxyBand = null;
    this.galaxyMaterial = null;
  }

  private trackGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private trackTexture<T extends Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }
}
