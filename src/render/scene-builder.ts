import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  FogExp2,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
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
import type { FoodState, ObstacleState, PickupState, SessionSnapshot, Vec3 } from "../types";
import { torusDelta } from "../world/torus-space";

interface DecorationSeed {
  position: Vec3;
  scale: number;
  yaw: number;
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
  private floorMesh: Mesh;
  private foodMeshes = new Map<number, Mesh>();
  private pickupMeshes = new Map<number, Mesh>();
  private obstacleMesh: InstancedMesh | null = null;
  private pulseObstacleMeshes = new Map<number, Mesh>();
  private decorationMesh: InstancedMesh | null = null;
  private decorationSeeds: DecorationSeed[] = [];
  private staticObstacleIds = "";
  private staticObstacles: ObstacleState[] = [];

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
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color("#07131f");
    this.scene.fog = new FogExp2("#07131f", 0.015);

    this.camera = new PerspectiveCamera(62, 1, 0.1, 240);
    this.camera.position.set(0, 6, -12);

    this.root = new Group();
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
  }

  renderPositionOf(position: Vec3): Vec3 {
    return {
      x: this.unwrappedHead.x + torusDelta(this.wrappedHead.x, position.x, this.worldWidth),
      y: position.y,
      z: this.unwrappedHead.z + torusDelta(this.wrappedHead.z, position.z, this.worldDepth)
    };
  }

  dispose(): void {
    this.renderer.dispose();
  }

  private setupLights(): void {
    const ambient = new AmbientLight("#4f7582", 0.55);
    this.scene.add(ambient);

    const key = new DirectionalLight("#f6d3a3", 1.2);
    key.position.set(8, 16, 6);
    this.scene.add(key);

    const rim = new DirectionalLight("#2ad0ff", 0.9);
    rim.position.set(-10, 8, -14);
    this.scene.add(rim);
  }

  private createFloor(): Mesh {
    const mesh = new Mesh(
      new PlaneGeometry(130, 130, 14, 14),
      new MeshStandardMaterial({
        color: "#0b1f2f",
        roughness: 0.94,
        metalness: 0.02,
        wireframe: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.35;
    return mesh;
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
    const count = Math.min(this.segmentMesh.count, snapshot.segments.length);
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
            color: "#2d4859",
            emissive: "#76b2d7",
            emissiveIntensity: 0.45,
            roughness: 0.62,
            metalness: 0.1
          })
        );
        this.root.add(mesh);
        this.pulseObstacleMeshes.set(obstacle.id, mesh);
      }
      const wave = Math.sin(elapsedSec * obstacle.pulseFrequency + obstacle.pulsePhase) * 0.5 + 0.5;
      const radius = obstacle.radius * (1 + obstacle.pulseAmplitude * wave);
      const renderPos = this.renderPositionOf(obstacle.position);
      mesh.position.set(renderPos.x, renderPos.y, renderPos.z);
      mesh.scale.setScalar(radius);
      mesh.rotation.y += 0.005;
    }
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
        color: "#2f3441",
        emissive: "#2b384f",
        emissiveIntensity: 0.25,
        roughness: 0.82,
        metalness: 0.06
      }),
      obstacles.length
    );
    this.obstacleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
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
        color: "#0f2e3f",
        emissive: "#134c5f",
        emissiveIntensity: 0.16,
        roughness: 0.88,
        metalness: 0.1
      }),
      this.decorationSeeds.length
    );
    this.decorationMesh.instanceMatrix.setUsage(DynamicDrawUsage);
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
