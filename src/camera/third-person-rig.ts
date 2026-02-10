import { PerspectiveCamera, Vector3 } from "three";
import { clamp, lerp } from "../util/math";
import { torusDelta } from "../world/torus-space";

export interface CameraRigConfig {
  worldWidth: number;
  worldDepth: number;
  baseFov: number;
  maxFov: number;
  stiffness: number;
  damping: number;
}

export class ThirdPersonRig {
  private readonly camera: PerspectiveCamera;
  private readonly config: CameraRigConfig;
  private readonly smoothPosition = new Vector3();
  private readonly velocity = new Vector3();
  private readonly unwrappedTarget = new Vector3();
  private initialized = false;
  private readonly impulse = new Vector3();

  constructor(camera: PerspectiveCamera, config: CameraRigConfig) {
    this.camera = camera;
    this.config = config;
  }

  reset(targetX: number, targetY: number, targetZ: number, headingRad: number): void {
    this.unwrappedTarget.set(targetX, targetY, targetZ);
    const back = new Vector3(Math.cos(headingRad), 0, Math.sin(headingRad)).multiplyScalar(-11);
    const initial = new Vector3(targetX, targetY + 6.2, targetZ).add(back);
    this.smoothPosition.copy(initial);
    this.velocity.set(0, 0, 0);
    this.impulse.set(0, 0, 0);
    this.camera.position.copy(initial);
    this.camera.lookAt(targetX, targetY + 1.2, targetZ);
    this.initialized = true;
  }

  addImpulse(x: number, y: number, z: number): void {
    this.impulse.add(new Vector3(x, y, z));
  }

  update(dt: number, targetX: number, targetY: number, targetZ: number, headingRad: number, speed01: number): void {
    if (!this.initialized) {
      this.reset(targetX, targetY, targetZ, headingRad);
    }

    const dx = torusDelta(this.unwrappedTarget.x, targetX, this.config.worldWidth);
    const dz = torusDelta(this.unwrappedTarget.z, targetZ, this.config.worldDepth);
    this.unwrappedTarget.x += dx;
    this.unwrappedTarget.y = targetY;
    this.unwrappedTarget.z += dz;

    const forward = new Vector3(Math.cos(headingRad), 0, Math.sin(headingRad));
    const right = new Vector3(-forward.z, 0, forward.x);

    const desired = this.unwrappedTarget
      .clone()
      .addScaledVector(forward, -9.5)
      .addScaledVector(right, 1.8)
      .add(new Vector3(0, 5.9, 0));
    const lookAt = this.unwrappedTarget.clone().addScaledVector(forward, 4 + speed01 * 3).add(new Vector3(0, 1.2, 0));

    const displacement = desired.clone().sub(this.smoothPosition);
    const accel = displacement
      .multiplyScalar(this.config.stiffness)
      .sub(this.velocity.clone().multiplyScalar(this.config.damping));
    this.velocity.addScaledVector(accel, dt);
    this.velocity.addScaledVector(this.impulse, dt);
    this.impulse.multiplyScalar(Math.exp(-7 * dt));
    this.smoothPosition.addScaledVector(this.velocity, dt);

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(lookAt);
    const fov = lerp(this.config.baseFov, this.config.maxFov, clamp(speed01, 0, 1));
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
