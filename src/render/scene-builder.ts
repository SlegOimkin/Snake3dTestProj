import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector3,
  WebGLRenderer
} from "three";
import type { QualityConfig } from "../config/game-config";
import type {
  FoodState,
  MultiplayerPlayerState,
  ObstacleState,
  PickupState,
  SessionSnapshot,
  Vec3
} from "../types";
import { torusDelta } from "../world/torus-space";

interface DecorationSeed {
  position: Vec3;
  scale: number;
  yaw: number;
}

interface RemoteVisual {
  head: Mesh;
  arrow: Mesh;
  segments: Mesh[];
  trail: Vec3[];
  smoothedPosition: Vector3;
}

interface StarLayerConfig {
  count: number;
  radius: number;
  jitter: number;
  size: number;
  opacity: number;
  tintA: string;
  tintB: string;
  texture: CanvasTexture;
}

export class SceneBuilder {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly root: Group;
  readonly headMesh: Mesh;

  private readonly worldWidth: number;
  private readonly worldDepth: number;
  private readonly maxSegments: number;
  private segmentMesh: InstancedMesh;
  private segmentMaterial: MeshStandardMaterial;
  private headMaterial: MeshStandardMaterial;
  private skyRoot: Group;
  private skyDome: Mesh;
  private skyStarsFar: Points;
  private skyStarsNear: Points;
  private skyNebulas: Sprite[] = [];
  private skyNebulaBaseOpacity: number[] = [];
  private skyNebulaPulseOffset: number[] = [];
  private skyGeometries: BufferGeometry[] = [];
  private skyMaterials: Material[] = [];
  private skyTextures: CanvasTexture[] = [];
  private floorMesh: Mesh;
  private foodMeshes = new Map<number, Mesh>();
  private pickupMeshes = new Map<number, Mesh>();
  private obstacleMesh: InstancedMesh | null = null;
  private pulseObstacleMeshes = new Map<number, Mesh>();
  private decorationMesh: InstancedMesh | null = null;
  private decorationSeeds: DecorationSeed[] = [];
  private staticObstacleIds = "";
  private staticObstacles: ObstacleState[] = [];
  private remoteVisuals = new Map<string, RemoteVisual>();

  private wrappedHead = new Vector3();
  private unwrappedHead = new Vector3();
  private headInitialized = false;

  private readonly dummy = new Matrix4();
  private currentQuality: QualityConfig;

  constructor(
    container: HTMLElement,
    quality: QualityConfig,
    worldWidth: number,
    worldDepth: number,
    maxSegments: number
  ) {
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;
    this.maxSegments = maxSegments;
    this.currentQuality = quality;

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color("#0b1223");
    this.scene.fog = new FogExp2("#173056", 0.0048);

    this.camera = new PerspectiveCamera(62, 1, 0.1, 240);
    this.camera.position.set(0, 6, -12);

    this.root = new Group();
    this.skyRoot = this.createSkySystem();
    this.scene.add(this.skyRoot);
    this.scene.add(this.root);

    this.setupLights();
    this.floorMesh = this.createFloor();
    this.root.add(this.floorMesh);
    this.headMaterial = new MeshStandardMaterial({
      color: "#64ffd5",
      emissive: "#42d6be",
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.35
    });
    this.headMesh = new Mesh(new IcosahedronGeometry(0.82, 0), this.headMaterial);
    this.headMesh.frustumCulled = false;
    this.root.add(this.headMesh);

    this.segmentMaterial = new MeshStandardMaterial({
      color: "#25b5a5",
      emissive: "#1f6d7a",
      emissiveIntensity: 0.58,
      roughness: 0.45,
      metalness: 0.15
    });
    this.segmentMesh = new InstancedMesh(
      new SphereGeometry(0.52, 10, 8),
      this.segmentMaterial,
      this.maxSegments
    );
    this.segmentMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.segmentMesh.frustumCulled = false;
    this.root.add(this.segmentMesh);

    this.applyQuality(quality);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setPixelRatio(pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
  }

  applyQuality(quality: QualityConfig): void {
    this.currentQuality = quality;
    this.rebuildDecorations();
  }

  updateFromSnapshot(snapshot: SessionSnapshot): void {
    this.updateHeadSpace(snapshot.head.position);
    this.updateHead(snapshot);
    this.updateSegments(snapshot);
    this.updateFoodMeshes(snapshot.foods);
    this.updatePickupMeshes(snapshot.pickups);
    this.updateObstacles(snapshot.obstacles, snapshot.elapsedSec);
    this.updateDecorations();
    this.floorMesh.position.set(this.unwrappedHead.x, -0.35, this.unwrappedHead.z);
    this.skyRoot.position.set(this.unwrappedHead.x, 2.4, this.unwrappedHead.z);
    this.skyRoot.rotation.y = snapshot.elapsedSec * 0.0018;
    this.skyStarsFar.rotation.y = -snapshot.elapsedSec * 0.0023;
    this.skyStarsNear.rotation.y = snapshot.elapsedSec * 0.0042;
    this.skyStarsNear.rotation.x = Math.sin(snapshot.elapsedSec * 0.07) * 0.028;
    this.skyDome.rotation.y = snapshot.elapsedSec * 0.0012;
    for (let i = 0; i < this.skyNebulas.length; i += 1) {
      const nebula = this.skyNebulas[i];
      const material = nebula.material as SpriteMaterial;
      const base = this.skyNebulaBaseOpacity[i] ?? 0.45;
      const pulse = this.skyNebulaPulseOffset[i] ?? 0;
      material.opacity = base + Math.sin(snapshot.elapsedSec * 0.14 + pulse) * 0.07;
    }
  }

  updateRemotePlayers(players: MultiplayerPlayerState[]): void {
    const nextIds = new Set(players.map((player) => player.id));

    for (const [id, visual] of Array.from(this.remoteVisuals.entries())) {
      if (!nextIds.has(id)) {
        this.removeRemoteVisual(id, visual);
      }
    }

    for (const player of players) {
      let visual = this.remoteVisuals.get(player.id);
      if (!visual) {
        visual = this.createRemoteVisual(player.color);
        this.remoteVisuals.set(player.id, visual);
      }

      const renderPos = this.renderPositionOf(player.position);
      if (visual.trail.length === 0) {
        visual.smoothedPosition.set(renderPos.x, renderPos.y, renderPos.z);
      } else {
        const follow = player.alive ? 0.34 : 0.2;
        visual.smoothedPosition.x += (renderPos.x - visual.smoothedPosition.x) * follow;
        visual.smoothedPosition.y += (renderPos.y - visual.smoothedPosition.y) * follow;
        visual.smoothedPosition.z += (renderPos.z - visual.smoothedPosition.z) * follow;
      }
      visual.trail.unshift({
        x: visual.smoothedPosition.x,
        y: visual.smoothedPosition.y,
        z: visual.smoothedPosition.z
      });
      if (visual.trail.length > 240) {
        visual.trail.length = 240;
      }

      visual.head.position.set(visual.smoothedPosition.x, visual.smoothedPosition.y, visual.smoothedPosition.z);
      visual.head.rotation.y = -player.headingRad;
      visual.arrow.position.set(
        visual.smoothedPosition.x,
        visual.smoothedPosition.y + 1.08,
        visual.smoothedPosition.z
      );
      visual.arrow.rotation.x = Math.PI;
      visual.arrow.rotation.y = -player.headingRad - Math.PI / 2;

      if (player.segments.length > 0) {
        const targetSegments = Math.min(visual.segments.length, player.segments.length);
        for (let i = 0; i < visual.segments.length; i += 1) {
          const segment = visual.segments[i];
          if (i >= targetSegments) {
            segment.visible = false;
            continue;
          }
          const sample = this.renderPositionOf(player.segments[i]);
          segment.visible = true;
          segment.position.set(sample.x, sample.y, sample.z);
        }
      } else {
        const targetSegments = Math.min(visual.segments.length, Math.max(1, player.length - 1));
        for (let i = 0; i < visual.segments.length; i += 1) {
          const segment = visual.segments[i];
          if (i >= targetSegments) {
            segment.visible = false;
            continue;
          }
          const trailIndex = Math.min(visual.trail.length - 1, (i + 1) * 2);
          const sample = visual.trail[trailIndex] ?? renderPos;
          segment.visible = true;
          segment.position.set(sample.x, sample.y, sample.z);
        }
      }

      const aliveScale = player.alive ? 1 : 0.42;
      (visual.head.material as MeshStandardMaterial).emissiveIntensity = 0.85 * aliveScale;
      (visual.arrow.material as MeshStandardMaterial).emissiveIntensity = 0.42 * aliveScale;
      for (const segment of visual.segments) {
        (segment.material as MeshStandardMaterial).emissiveIntensity = 0.26 * aliveScale;
      }
    }
  }

  renderPositionOf(position: Vec3): Vec3 {
    return {
      x: this.unwrappedHead.x + torusDelta(this.wrappedHead.x, position.x, this.worldWidth),
      y: position.y,
      z: this.unwrappedHead.z + torusDelta(this.wrappedHead.z, position.z, this.worldDepth)
    };
  }

  dispose(): void {
    for (const [id, visual] of Array.from(this.remoteVisuals.entries())) {
      this.removeRemoteVisual(id, visual);
    }
    this.scene.remove(this.skyRoot);
    for (const texture of this.skyTextures) {
      texture.dispose();
    }
    for (const material of this.skyMaterials) {
      material.dispose();
    }
    for (const geometry of this.skyGeometries) {
      geometry.dispose();
    }
    this.skyTextures.length = 0;
    this.skyMaterials.length = 0;
    this.skyGeometries.length = 0;
    this.skyNebulas.length = 0;
    this.skyNebulaBaseOpacity.length = 0;
    this.skyNebulaPulseOffset.length = 0;
    this.renderer.dispose();
  }

  private setupLights(): void {
    const ambient = new AmbientLight("#a7d4e6", 1.18);
    this.scene.add(ambient);

    const hemi = new HemisphereLight("#9dd8f7", "#1a3a52", 1.12);
    this.scene.add(hemi);

    const key = new DirectionalLight("#ffe2bc", 2.25);
    key.position.set(8, 16, 6);
    this.scene.add(key);

    const rim = new DirectionalLight("#7feaff", 1.5);
    rim.position.set(-10, 8, -14);
    this.scene.add(rim);

    const fill = new DirectionalLight("#9fc6ff", 1.05);
    fill.position.set(2, 7, -6);
    this.scene.add(fill);
  }

  private createFloor(): Mesh {
    const mesh = new Mesh(
      new PlaneGeometry(130, 130, 14, 14),
      new MeshStandardMaterial({
        color: "#2e5873",
        emissive: "#1d4560",
        emissiveIntensity: 0.35,
        roughness: 0.9,
        metalness: 0.02,
        wireframe: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.35;
    return mesh;
  }

  private createSkySystem(): Group {
    const sky = new Group();

    this.skyDome = this.createSkyDome();
    sky.add(this.skyDome);

    const starTexture = this.createStarTexture();
    const detailScale =
      this.currentQuality.decorationCount >= 340
        ? 1.15
        : this.currentQuality.decorationCount <= 140
          ? 0.78
          : 1;

    this.skyStarsFar = this.createStarLayer({
      count: Math.round(2200 * detailScale),
      radius: 156,
      jitter: 6,
      size: 0.38,
      opacity: 0.55,
      tintA: "#a3dcff",
      tintB: "#f7fbff",
      texture: starTexture
    });
    this.skyStarsNear = this.createStarLayer({
      count: Math.round(760 * detailScale),
      radius: 142,
      jitter: 10,
      size: 0.6,
      opacity: 0.82,
      tintA: "#9cecff",
      tintB: "#ffd7a8",
      texture: starTexture
    });
    sky.add(this.skyStarsFar);
    sky.add(this.skyStarsNear);

    const nebulaCount = Math.max(6, Math.round(10 * detailScale));
    const nebulas = this.createNebulaSprites(nebulaCount);
    for (const nebula of nebulas) {
      sky.add(nebula);
    }

    const spaceObjects = this.createSpaceObjects();
    for (const object of spaceObjects) {
      sky.add(object);
    }

    return sky;
  }

  private createSkyDome(): Mesh {
    const texture = this.createSkyGradientTexture();
    const material = new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      fog: false,
      depthWrite: false
    });
    const geometry = new SphereGeometry(170, 46, 28);
    this.skyTextures.push(texture);
    this.skyMaterials.push(material);
    this.skyGeometries.push(geometry);
    const sky = new Mesh(geometry, material);
    sky.frustumCulled = false;
    return sky;
  }

  private createSkyGradientTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    if (!ctx) {
      return texture;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#0f1f47");
    gradient.addColorStop(0.42, "#0a1431");
    gradient.addColorStop(1, "#040913");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 8; i += 1) {
      const x = Math.random() * canvas.width;
      const y = canvas.height * (0.2 + Math.random() * 0.5);
      const radius = 110 + Math.random() * 210;
      const cloud = ctx.createRadialGradient(x, y, 8, x, y, radius);
      cloud.addColorStop(0, "rgba(71, 134, 255, 0.18)");
      cloud.addColorStop(0.38, "rgba(56, 220, 255, 0.07)");
      cloud.addColorStop(1, "rgba(56, 220, 255, 0)");
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    texture.needsUpdate = true;
    return texture;
  }

  private createStarTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    if (!ctx) {
      this.skyTextures.push(texture);
      return texture;
    }

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.2, "rgba(220,240,255,0.95)");
    glow.addColorStop(0.52, "rgba(182,216,255,0.38)");
    glow.addColorStop(1, "rgba(182,216,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(219,240,255,0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx, cy + 14);
    ctx.stroke();

    texture.needsUpdate = true;
    this.skyTextures.push(texture);
    return texture;
  }

  private createStarLayer(config: StarLayerConfig): Points {
    const positions = new Float32Array(config.count * 3);
    const colors = new Float32Array(config.count * 3);
    const baseA = new Color(config.tintA);
    const baseB = new Color(config.tintB);
    const mixed = new Color();

    for (let i = 0; i < config.count; i += 1) {
      const index = i * 3;
      const direction = this.randomDirection();
      const radius = config.radius + (Math.random() * 2 - 1) * config.jitter;

      positions[index] = direction.x * radius;
      positions[index + 1] = direction.y * radius;
      positions[index + 2] = direction.z * radius;

      mixed.copy(baseA).lerp(baseB, Math.random());
      const intensity = 0.52 + Math.random() * 0.48;
      colors[index] = mixed.r * intensity;
      colors[index + 1] = mixed.g * intensity;
      colors[index + 2] = mixed.b * intensity;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

    const material = new PointsMaterial({
      map: config.texture,
      size: config.size,
      sizeAttenuation: false,
      transparent: true,
      opacity: config.opacity,
      alphaTest: 0.12,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      vertexColors: true
    });

    this.skyGeometries.push(geometry);
    this.skyMaterials.push(material);

    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  private createNebulaSprites(count: number): Sprite[] {
    const palette = [
      { inner: "#36dfff", outer: "#2f5dff" },
      { inner: "#ffd59e", outer: "#ff7f4f" },
      { inner: "#99efff", outer: "#3aa4ff" },
      { inner: "#8af5d8", outer: "#1f8dc4" }
    ];

    const sprites: Sprite[] = [];
    for (let i = 0; i < count; i += 1) {
      const variant = palette[i % palette.length];
      const texture = this.createNebulaSpriteTexture(variant.inner, variant.outer);
      const baseOpacity = 0.28 + Math.random() * 0.16;
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        fog: false
      });
      material.rotation = Math.random() * Math.PI * 2;
      this.skyMaterials.push(material);

      const direction = this.randomDirection();
      if (direction.y < -0.2) {
        direction.y *= -0.45;
        direction.normalize();
      }
      const radius = 130 + Math.random() * 16;
      const sprite = new Sprite(material);
      sprite.position.copy(direction.multiplyScalar(radius));
      const size = 26 + Math.random() * 30;
      sprite.scale.set(size * (1.2 + Math.random() * 0.7), size, 1);
      sprite.frustumCulled = false;

      this.skyNebulas.push(sprite);
      this.skyNebulaBaseOpacity.push(baseOpacity);
      this.skyNebulaPulseOffset.push(Math.random() * Math.PI * 2);
      sprites.push(sprite);
    }
    return sprites;
  }

  private createNebulaSpriteTexture(inner: string, outer: string): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.skyTextures.push(texture);
    if (!ctx) {
      return texture;
    }

    for (let i = 0; i < 18; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 36 + Math.random() * 150;
      const alpha = 0.045 + Math.random() * 0.08;
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
      cloud.addColorStop(0, this.toRgba(inner, alpha * 1.6));
      cloud.addColorStop(0.45, this.toRgba(outer, alpha));
      cloud.addColorStop(1, this.toRgba(outer, 0));
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    for (let i = 0; i < 45; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 6 + Math.random() * 20;
      const star = ctx.createRadialGradient(x, y, 0, x, y, radius);
      star.addColorStop(0, "rgba(228,245,255,0.2)");
      star.addColorStop(1, "rgba(228,245,255,0)");
      ctx.fillStyle = star;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    texture.needsUpdate = true;
    return texture;
  }

  private createSpaceObjects(): Group[] {
    const objects: Group[] = [];

    const ringedPlanet = new Group();
    const giantGeometry = new SphereGeometry(6.8, 24, 18);
    const giantMaterial = new MeshStandardMaterial({
      color: "#5f8ed0",
      emissive: "#274d8a",
      emissiveIntensity: 0.62,
      roughness: 0.76,
      metalness: 0.08,
      fog: false
    });
    this.skyGeometries.push(giantGeometry);
    this.skyMaterials.push(giantMaterial);
    const giantBody = new Mesh(giantGeometry, giantMaterial);
    giantBody.frustumCulled = false;
    ringedPlanet.add(giantBody);

    const ringGeometry = new TorusGeometry(10.3, 0.38, 12, 72);
    const ringMaterial = new MeshBasicMaterial({
      color: "#b8dcff",
      transparent: true,
      opacity: 0.48,
      fog: false
    });
    this.skyGeometries.push(ringGeometry);
    this.skyMaterials.push(ringMaterial);
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = 1.02;
    ring.rotation.y = 0.22;
    ring.frustumCulled = false;
    ringedPlanet.add(ring);

    const moonGeometry = new SphereGeometry(1.6, 14, 12);
    const moonMaterial = new MeshStandardMaterial({
      color: "#d5edff",
      emissive: "#7cb7ff",
      emissiveIntensity: 0.42,
      roughness: 0.9,
      metalness: 0.02,
      fog: false
    });
    this.skyGeometries.push(moonGeometry);
    this.skyMaterials.push(moonMaterial);
    const moon = new Mesh(moonGeometry, moonMaterial);
    moon.position.set(9.3, 2.4, -1.1);
    moon.frustumCulled = false;
    ringedPlanet.add(moon);
    ringedPlanet.position.copy(new Vector3(-0.72, 0.28, -0.64).normalize().multiplyScalar(138));
    objects.push(ringedPlanet);

    const cyanPlanet = new Group();
    const cyanGeometry = new SphereGeometry(4.8, 20, 16);
    const cyanMaterial = new MeshStandardMaterial({
      color: "#8ff0ff",
      emissive: "#2f99c2",
      emissiveIntensity: 0.66,
      roughness: 0.72,
      metalness: 0.06,
      fog: false
    });
    this.skyGeometries.push(cyanGeometry);
    this.skyMaterials.push(cyanMaterial);
    const cyanBody = new Mesh(cyanGeometry, cyanMaterial);
    cyanBody.frustumCulled = false;
    cyanPlanet.add(cyanBody);

    const haloGeometry = new TorusGeometry(7.1, 0.22, 10, 56);
    const haloMaterial = new MeshBasicMaterial({
      color: "#87e9ff",
      transparent: true,
      opacity: 0.42,
      fog: false
    });
    this.skyGeometries.push(haloGeometry);
    this.skyMaterials.push(haloMaterial);
    const halo = new Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = 1.26;
    halo.rotation.z = 0.34;
    halo.frustumCulled = false;
    cyanPlanet.add(halo);

    cyanPlanet.position.copy(new Vector3(0.66, 0.38, 0.64).normalize().multiplyScalar(146));
    objects.push(cyanPlanet);

    const anomalyGeometry = new IcosahedronGeometry(2.8, 1);
    const anomalyMaterial = new MeshStandardMaterial({
      color: "#ffd89a",
      emissive: "#ff8f4f",
      emissiveIntensity: 0.82,
      roughness: 0.44,
      metalness: 0.12,
      fog: false
    });
    this.skyGeometries.push(anomalyGeometry);
    this.skyMaterials.push(anomalyMaterial);
    const anomaly = new Mesh(anomalyGeometry, anomalyMaterial);
    anomaly.position.copy(new Vector3(0.12, 0.06, -0.99).normalize().multiplyScalar(150));
    anomaly.frustumCulled = false;
    const anomalyGroup = new Group();
    anomalyGroup.add(anomaly);
    objects.push(anomalyGroup);

    return objects;
  }

  private randomDirection(): Vector3 {
    const direction = new Vector3();
    do {
      direction.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    } while (direction.lengthSq() < 0.0001);
    return direction.normalize();
  }

  private toRgba(hex: string, alpha: number): string {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private updateHeadSpace(wrapped: Vec3): void {
    if (!this.headInitialized) {
      this.wrappedHead.set(wrapped.x, wrapped.y, wrapped.z);
      this.unwrappedHead.set(wrapped.x, wrapped.y, wrapped.z);
      this.headInitialized = true;
      return;
    }
    const dx = torusDelta(this.wrappedHead.x, wrapped.x, this.worldWidth);
    const dz = torusDelta(this.wrappedHead.z, wrapped.z, this.worldDepth);
    this.unwrappedHead.x += dx;
    this.unwrappedHead.y = wrapped.y;
    this.unwrappedHead.z += dz;
    this.wrappedHead.set(wrapped.x, wrapped.y, wrapped.z);
  }

  private updateHead(snapshot: SessionSnapshot): void {
    this.headMesh.position.copy(this.unwrappedHead);
    this.headMesh.rotation.y = -snapshot.head.headingRad;
    if (!snapshot.activePowerup) {
      this.headMaterial.emissive.set("#42d6be");
      this.headMaterial.emissiveIntensity = 1.4;
      return;
    }
    if (snapshot.activePowerup.kind === "phase") {
      this.headMaterial.emissive.set("#86f0ff");
      this.headMaterial.emissiveIntensity = 1.8;
    } else if (snapshot.activePowerup.kind === "overdrive") {
      this.headMaterial.emissive.set("#ffb857");
      this.headMaterial.emissiveIntensity = 1.9;
    } else {
      this.headMaterial.emissive.set("#7fff86");
      this.headMaterial.emissiveIntensity = 1.65;
    }
  }

  private updateSegments(snapshot: SessionSnapshot): void {
    const count = Math.min(this.maxSegments, snapshot.segments.length);
    for (let i = 0; i < count; i += 1) {
      const renderPos = this.renderPositionOf(snapshot.segments[i].position);
      this.dummy.makeTranslation(renderPos.x, renderPos.y, renderPos.z);
      this.segmentMesh.setMatrixAt(i, this.dummy);
    }
    this.segmentMesh.count = count;
    this.segmentMesh.instanceMatrix.needsUpdate = true;
  }

  private updateFoodMeshes(foods: FoodState[]): void {
    const nextIds = new Set(foods.map((food) => food.id));
    for (const [id, mesh] of this.foodMeshes) {
      if (!nextIds.has(id)) {
        this.root.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
        this.foodMeshes.delete(id);
      }
    }

    for (const food of foods) {
      let mesh = this.foodMeshes.get(food.id);
      if (!mesh) {
        mesh = new Mesh(
          new IcosahedronGeometry(0.56, 0),
          new MeshStandardMaterial({
            color: "#ffc26f",
            emissive: "#ff943a",
            emissiveIntensity: 1.45,
            roughness: 0.35,
            metalness: 0.1
          })
        );
        mesh.frustumCulled = false;
        this.root.add(mesh);
        this.foodMeshes.set(food.id, mesh);
      }
      const renderPos = this.renderPositionOf(food.position);
      mesh.position.set(renderPos.x, renderPos.y, renderPos.z);
      mesh.rotation.y += 0.012;
      mesh.rotation.x += 0.004;
    }
  }

  private updatePickupMeshes(pickups: PickupState[]): void {
    const nextIds = new Set(pickups.map((pickup) => pickup.id));
    for (const [id, mesh] of this.pickupMeshes) {
      if (!nextIds.has(id)) {
        this.root.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
        this.pickupMeshes.delete(id);
      }
    }

    for (const pickup of pickups) {
      let mesh = this.pickupMeshes.get(pickup.id);
      if (!mesh) {
        const color =
          pickup.kind === "overdrive" ? "#ffd056" : pickup.kind === "phase" ? "#7fe8ff" : "#8aff83";
        mesh = new Mesh(
          new TorusKnotGeometry(0.36, 0.12, 70, 12),
          new MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 1.05,
            roughness: 0.25,
            metalness: 0.38
          })
        );
        mesh.frustumCulled = false;
        this.root.add(mesh);
        this.pickupMeshes.set(pickup.id, mesh);
      }
      const renderPos = this.renderPositionOf(pickup.position);
      mesh.position.set(renderPos.x, renderPos.y + 0.2, renderPos.z);
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.014;
    }
  }

  private updateObstacles(obstacles: ObstacleState[], elapsedSec: number): void {
    const staticObstacles = obstacles.filter((obstacle) => obstacle.kind === "static");
    const staticIds = staticObstacles.map((obstacle) => obstacle.id).join(",");
    if (staticIds !== this.staticObstacleIds) {
      this.rebuildStaticObstacleMesh(staticObstacles);
      this.staticObstacleIds = staticIds;
      this.staticObstacles = staticObstacles;
    }
    if (this.obstacleMesh) {
      for (let i = 0; i < this.staticObstacles.length; i += 1) {
        const obstacle = this.staticObstacles[i];
        const renderPos = this.renderPositionOf(obstacle.position);
        this.dummy.makeScale(obstacle.radius, obstacle.radius, obstacle.radius);
        this.dummy.setPosition(renderPos.x, renderPos.y, renderPos.z);
        this.obstacleMesh.setMatrixAt(i, this.dummy);
      }
      this.obstacleMesh.instanceMatrix.needsUpdate = true;
    }

    const pulseObstacles = obstacles.filter((obstacle) => obstacle.kind === "pulse");
    const pulseIds = new Set(pulseObstacles.map((obstacle) => obstacle.id));
    for (const [id, mesh] of this.pulseObstacleMeshes) {
      if (!pulseIds.has(id)) {
        this.root.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
        this.pulseObstacleMeshes.delete(id);
      }
    }
    for (const obstacle of pulseObstacles) {
      let mesh = this.pulseObstacleMeshes.get(obstacle.id);
      if (!mesh) {
        mesh = new Mesh(
          new IcosahedronGeometry(1.0, 0),
          new MeshStandardMaterial({
            color: "#5e1a1a",
            emissive: "#ff3a3a",
            emissiveIntensity: 1.18,
            roughness: 0.56,
            metalness: 0.06
          })
        );
        mesh.frustumCulled = false;
        this.root.add(mesh);
        this.pulseObstacleMeshes.set(obstacle.id, mesh);
      }
      const wave = Math.sin(elapsedSec * obstacle.pulseFrequency + obstacle.pulsePhase) * 0.5 + 0.5;
      const radius = obstacle.radius * (1 + obstacle.pulseAmplitude * wave);
      const renderPos = this.renderPositionOf(obstacle.position);
      mesh.position.set(renderPos.x, renderPos.y, renderPos.z);
      mesh.scale.setScalar(radius);
      (mesh.material as MeshStandardMaterial).emissiveIntensity = 1.05 + wave * 0.9;
      mesh.rotation.y += 0.005;
    }
  }

  private createRemoteVisual(color: string): RemoteVisual {
    const headMaterial = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.2
    });
    const head = new Mesh(new IcosahedronGeometry(0.82, 0), headMaterial);
    head.frustumCulled = false;
    this.root.add(head);

    const arrowMaterial = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.42,
      roughness: 0.3,
      metalness: 0.18
    });
    const arrow = new Mesh(new ConeGeometry(0.22, 0.62, 6), arrowMaterial);
    arrow.frustumCulled = false;
    this.root.add(arrow);

    const segments: Mesh[] = [];
    for (let i = 0; i < 96; i += 1) {
      const material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.26,
        roughness: 0.42,
        metalness: 0.12
      });
      const segment = new Mesh(new SphereGeometry(0.52, 10, 8), material);
      segment.visible = false;
      segment.frustumCulled = false;
      this.root.add(segment);
      segments.push(segment);
    }

    return {
      head,
      arrow,
      segments,
      trail: [],
      smoothedPosition: new Vector3()
    };
  }

  private removeRemoteVisual(id: string, visual: RemoteVisual): void {
    this.root.remove(visual.head);
    visual.head.geometry.dispose();
    (visual.head.material as MeshStandardMaterial).dispose();

    this.root.remove(visual.arrow);
    visual.arrow.geometry.dispose();
    (visual.arrow.material as MeshStandardMaterial).dispose();

    for (const segment of visual.segments) {
      this.root.remove(segment);
      segment.geometry.dispose();
      (segment.material as MeshStandardMaterial).dispose();
    }

    this.remoteVisuals.delete(id);
  }

  private rebuildStaticObstacleMesh(obstacles: ObstacleState[]): void {
    if (this.obstacleMesh) {
      this.root.remove(this.obstacleMesh);
      this.obstacleMesh.geometry.dispose();
      (this.obstacleMesh.material as MeshStandardMaterial).dispose();
      this.obstacleMesh = null;
    }

    if (obstacles.length === 0) {
      return;
    }
    this.obstacleMesh = new InstancedMesh(
      new IcosahedronGeometry(1, 0),
      new MeshStandardMaterial({
        color: "#561919",
        emissive: "#ff2b2b",
        emissiveIntensity: 1.04,
        roughness: 0.72,
        metalness: 0.06
      }),
      obstacles.length
    );
    this.obstacleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.obstacleMesh.frustumCulled = false;
    this.root.add(this.obstacleMesh);
  }

  private rebuildDecorations(): void {
    if (this.decorationMesh) {
      this.root.remove(this.decorationMesh);
      this.decorationMesh.geometry.dispose();
      (this.decorationMesh.material as MeshStandardMaterial).dispose();
      this.decorationMesh = null;
      this.decorationSeeds = [];
    }

    this.decorationSeeds = new Array(this.currentQuality.decorationCount).fill(null).map(() => ({
      position: {
        x: (Math.random() - 0.5) * this.worldWidth,
        y: Math.random() * 0.7 - 0.2,
        z: (Math.random() - 0.5) * this.worldDepth
      },
      scale: 0.4 + Math.random() * 1.9,
      yaw: Math.random() * Math.PI * 2
    }));

    this.decorationMesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({
        color: "#2f6988",
        emissive: "#3b89b0",
        emissiveIntensity: 0.55,
        roughness: 0.88,
        metalness: 0.1
      }),
      this.decorationSeeds.length
    );
    this.decorationMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.decorationMesh.frustumCulled = false;
    this.root.add(this.decorationMesh);
  }

  private updateDecorations(): void {
    if (!this.decorationMesh) {
      return;
    }

    for (let i = 0; i < this.decorationSeeds.length; i += 1) {
      const seed = this.decorationSeeds[i];
      const renderPos = this.renderPositionOf(seed.position);
      this.dummy.makeRotationY(seed.yaw);
      this.dummy.scale(new Vector3(seed.scale, seed.scale * (0.7 + seed.scale * 0.1), seed.scale));
      this.dummy.setPosition(renderPos.x, renderPos.y - 0.2, renderPos.z);
      this.decorationMesh.setMatrixAt(i, this.dummy);
    }
    this.decorationMesh.instanceMatrix.needsUpdate = true;
  }
}
