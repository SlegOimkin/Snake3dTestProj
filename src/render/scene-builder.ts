import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
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
  private skyDome: Mesh;
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
    this.skyDome = this.createSkyDome();
    this.scene.add(this.skyDome);
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
    this.skyDome.position.set(this.unwrappedHead.x, 2.5, this.unwrappedHead.z);
    this.skyDome.rotation.y = snapshot.elapsedSec * 0.008;
    this.skyDome.rotation.z = Math.sin(snapshot.elapsedSec * 0.05) * 0.02;
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
    this.scene.remove(this.skyDome);
    this.skyDome.geometry.dispose();
    const skyMaterial = this.skyDome.material as MeshBasicMaterial;
    if (skyMaterial.map) {
      skyMaterial.map.dispose();
    }
    skyMaterial.dispose();
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

  private createSkyDome(): Mesh {
    const texture = this.createNebulaTexture();
    texture.colorSpace = SRGBColorSpace;

    const material = new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      fog: false,
      depthWrite: false
    });
    const sky = new Mesh(new SphereGeometry(165, 40, 24), material);
    sky.frustumCulled = false;
    return sky;
  }

  private createNebulaTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new CanvasTexture(canvas);
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#101f42");
    gradient.addColorStop(0.48, "#0a1430");
    gradient.addColorStop(1, "#050b18");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const nebulaPalette = [
      "#2be7c7",
      "#5cc9ff",
      "#f9b76f",
      "#87f5ff",
      "#3ea4ff"
    ];
    for (let i = 0; i < 14; i += 1) {
      const radius = 70 + Math.random() * 180;
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const color = nebulaPalette[i % nebulaPalette.length];
      const alpha = 0.08 + Math.random() * 0.12;
      const cloud = ctx.createRadialGradient(x, y, 4, x, y, radius);
      cloud.addColorStop(0, this.hexToRgba(color, alpha));
      cloud.addColorStop(0.45, this.hexToRgba(color, alpha * 0.45));
      cloud.addColorStop(1, this.hexToRgba(color, 0));
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    for (let i = 0; i < 1300; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() < 0.08 ? 1.8 + Math.random() * 1.7 : 0.4 + Math.random() * 1.1;
      const alpha = 0.3 + Math.random() * 0.7;
      ctx.fillStyle = `rgba(214, 237, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const burst = ctx.createRadialGradient(x, y, 0, x, y, 11 + Math.random() * 24);
      burst.addColorStop(0, "rgba(205,245,255,0.95)");
      burst.addColorStop(0.25, "rgba(170,227,255,0.4)");
      burst.addColorStop(1, "rgba(170,227,255,0)");
      ctx.fillStyle = burst;
      ctx.fillRect(x - 26, y - 26, 52, 52);
    }

    return new CanvasTexture(canvas);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((v) => `${v}${v}`).join("") : value;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
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
