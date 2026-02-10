import type { FoodState, ObstacleState, PickupState, Vec3 } from "../types";
import { t } from "../i18n";
import { torusDelta } from "../world/torus-space";

export interface HudModel {
  score: number;
  speed: number;
  length: number;
  combo: number;
  multiplier: number;
  powerupLabel: string;
  headPosition: Vec3;
  foods: FoodState[];
  pickups: PickupState[];
  obstacles: ObstacleState[];
}

export class HudUI {
  readonly root: HTMLDivElement;
  private readonly scoreValue: HTMLSpanElement;
  private readonly speedValue: HTMLSpanElement;
  private readonly lengthValue: HTMLSpanElement;
  private readonly comboValue: HTMLSpanElement;
  private readonly powerupValue: HTMLSpanElement;
  private readonly hintLine: HTMLDivElement;
  private readonly radarCanvas: HTMLCanvasElement;
  private readonly debugValue: HTMLDivElement;
  private visible = false;
  private readonly worldWidth: number;
  private readonly worldDepth: number;

  constructor(parent: HTMLElement, worldWidth: number, worldDepth: number) {
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;
    this.root = document.createElement("div");
    this.root.className = "hud hidden";
    this.root.innerHTML = `
      <div class="hud-grid">
        <div class="hud-card"><span class="label" data-i18n="score"></span><span class="value" id="hud-score">0</span></div>
        <div class="hud-card"><span class="label" data-i18n="speed"></span><span class="value" id="hud-speed">0</span></div>
        <div class="hud-card"><span class="label" data-i18n="length"></span><span class="value" id="hud-length">0</span></div>
        <div class="hud-card"><span class="label" data-i18n="combo"></span><span class="value" id="hud-combo">0 x1</span></div>
        <div class="hud-card wide"><span class="label" data-i18n="powerup"></span><span class="value" id="hud-powerup">-</span></div>
      </div>
      <canvas class="radar" width="132" height="132"></canvas>
      <div class="hint-line"></div>
      <div class="debug-line"></div>
    `;
    parent.appendChild(this.root);

    this.scoreValue = this.root.querySelector("#hud-score") as HTMLSpanElement;
    this.speedValue = this.root.querySelector("#hud-speed") as HTMLSpanElement;
    this.lengthValue = this.root.querySelector("#hud-length") as HTMLSpanElement;
    this.comboValue = this.root.querySelector("#hud-combo") as HTMLSpanElement;
    this.powerupValue = this.root.querySelector("#hud-powerup") as HTMLSpanElement;
    this.hintLine = this.root.querySelector(".hint-line") as HTMLDivElement;
    this.radarCanvas = this.root.querySelector(".radar") as HTMLCanvasElement;
    this.debugValue = this.root.querySelector(".debug-line") as HTMLDivElement;
    this.applyTranslations();
  }

  applyTranslations(): void {
    this.root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n ?? "";
      node.textContent = t(key);
    });
    this.hintLine.textContent = `${t("keyboardHint")} • ${t("tapSwipeHint")} • ${t("landscapeHint")}`;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle("hidden", !visible);
  }

  setDebugLine(text: string): void {
    this.debugValue.textContent = text;
  }

  update(model: HudModel): void {
    if (!this.visible) {
      return;
    }
    this.scoreValue.textContent = model.score.toString();
    this.speedValue.textContent = model.speed.toFixed(1);
    this.lengthValue.textContent = model.length.toString();
    this.comboValue.textContent = `${model.combo} x${model.multiplier.toFixed(1)}`;
    this.powerupValue.textContent = model.powerupLabel;
    this.drawRadar(model.headPosition, model.obstacles, model.foods, model.pickups);
  }

  private drawRadar(
    head: Vec3,
    obstacles: ObstacleState[],
    foods: FoodState[],
    pickups: PickupState[]
  ): void {
    const ctx = this.radarCanvas.getContext("2d");
    if (!ctx) return;
    const width = this.radarCanvas.width;
    const height = this.radarCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const range = 28;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(8, 19, 30, 0.86)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(125, 192, 212, 0.35)";
    ctx.strokeRect(1, 1, width - 2, height - 2);
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(107, 168, 199, 0.34)";
    ctx.stroke();

    const toRadar = (target: Vec3): [number, number] => {
      const dx = torusDelta(head.x, target.x, this.worldWidth);
      const dz = torusDelta(head.z, target.z, this.worldDepth);
      const nx = Math.max(-1, Math.min(1, dx / range));
      const nz = Math.max(-1, Math.min(1, dz / range));
      return [cx + nx * width * 0.42, cy + nz * height * 0.42];
    };

    ctx.fillStyle = "rgba(250, 133, 89, 0.95)";
    for (const obstacle of obstacles) {
      const [x, y] = toRadar(obstacle.position);
      ctx.beginPath();
      ctx.arc(x, y, obstacle.kind === "pulse" ? 2.7 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255, 206, 120, 0.98)";
    for (const food of foods) {
      const [x, y] = toRadar(food.position);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pickup of pickups) {
      const [x, y] = toRadar(pickup.position);
      ctx.fillStyle =
        pickup.kind === "phase"
          ? "rgba(138, 236, 255, 0.98)"
          : pickup.kind === "magnet"
            ? "rgba(143, 255, 133, 0.98)"
            : "rgba(255, 208, 117, 0.98)";
      ctx.beginPath();
      ctx.rect(x - 2, y - 2, 4, 4);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(90, 255, 225, 0.98)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
