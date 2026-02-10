import "./style.css";
import { GAME_CONFIG, GAME_VERSION, QUALITY_PRESETS } from "./config/game-config";
import { GameLoop } from "./core/game-loop";
import { GameStateMachine } from "./core/state";
import { GameSession } from "./game/game-session";
import { getCurrentLanguage, initI18n, setLanguage, t } from "./i18n";
import { InputManager } from "./input/input-manager";
import { SceneBuilder } from "./render/scene-builder";
import { PostFxPipeline } from "./render/postfx";
import { addHighscore, loadHighscores } from "./storage/highscores";
import { defaultSettings, loadSettings, saveSettings } from "./storage/settings";
import type { GameState, SessionSnapshot } from "./types";
import { ThirdPersonRig } from "./camera/third-person-rig";
import { HudUI } from "./ui/hud";
import { MenuUI } from "./ui/menu";
import { SettingsUI } from "./ui/settings";
import { clamp } from "./util/math";

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    return;
  }

  let settings = loadSettings();
  settings = { ...defaultSettings, ...settings };
  await initI18n(settings.language);
  document.documentElement.lang = getCurrentLanguage();

  app.innerHTML = `
    <div class="game-shell">
      <div class="canvas-root"></div>
    </div>
  `;
  const shell = app.querySelector(".game-shell") as HTMLDivElement;
  const canvasRoot = app.querySelector(".canvas-root") as HTMLDivElement;

  let quality = QUALITY_PRESETS[settings.quality];
  const sceneBuilder = new SceneBuilder(
    canvasRoot,
    quality,
    GAME_CONFIG.torusWidth,
    GAME_CONFIG.torusDepth,
    quality.maxSegments
  );
  const postfx = new PostFxPipeline(sceneBuilder.renderer, sceneBuilder.scene, sceneBuilder.camera, quality);
  postfx.setEnabled(settings.postfxEnabled);

  const cameraRig = new ThirdPersonRig(sceneBuilder.camera, {
    worldWidth: GAME_CONFIG.torusWidth,
    worldDepth: GAME_CONFIG.torusDepth,
    baseFov: 58,
    maxFov: 74,
    stiffness: 26,
    damping: 10.8
  });

  const input = new InputManager(canvasRoot);
  input.setSensitivity(settings.inputSensitivity);

  const hud = new HudUI(shell, GAME_CONFIG.torusWidth, GAME_CONFIG.torusDepth);
  let highscores = loadHighscores();
  const stateMachine = new GameStateMachine();

  const menu = new MenuUI(shell, {
    onStart: () => startGame(),
    onOpenSettings: () => settingsUi.open(),
    onResume: () => {
      if (stateMachine.current === "paused") {
        setState("playing");
      }
    },
    onRestart: () => startGame(),
    onMainMenu: () => setState("menu"),
    onSaveScore: (name) => {
      if (!lastSnapshot) {
        return;
      }
      const normalizedName = name.trim().slice(0, 16) || "Player";
      highscores = addHighscore({
        name: normalizedName,
        score: lastSnapshot.score.score,
        length: lastSnapshot.segments.length + 1,
        createdAtIso: new Date().toISOString(),
        gameVersion: GAME_VERSION
      });
      menu.showSavedMessage();
      menu.showGameOver(
        {
          score: lastSnapshot.score.score,
          length: lastSnapshot.segments.length + 1
        },
        highscores
      );
    }
  });

  const settingsUi = new SettingsUI(shell, settings, {
    onChange: (next) => {
      const prev = settings;
      settings = { ...next };
      saveSettings(settings);
      quality = QUALITY_PRESETS[settings.quality];
      input.setSensitivity(settings.inputSensitivity);
      sceneBuilder.applyQuality(quality);
      postfx.applyQuality(quality);
      postfx.setEnabled(settings.postfxEnabled);
      updateRendererScale();

      if (prev.language !== settings.language) {
        void setLanguage(settings.language).then(() => {
          document.documentElement.lang = settings.language;
          menu.applyTranslations();
          hud.applyTranslations();
          settingsUi.applyTranslations();
          if (stateMachine.current === "menu") {
            menu.showMainMenu(highscores);
          } else if (stateMachine.current === "paused") {
            menu.showPause();
          } else if (stateMachine.current === "gameover" && lastSnapshot) {
            menu.showGameOver(
              { score: lastSnapshot.score.score, length: lastSnapshot.segments.length + 1 },
              highscores
            );
          }
        });
      }
    }
  });

  const session = new GameSession({
    onPickup: (kind) => {
      if (kind === "food") cameraRig.addImpulse(0.0, 0.15, 0.06);
      if (kind === "overdrive") cameraRig.addImpulse(0.0, 0.2, 0.12);
      if (kind === "phase") cameraRig.addImpulse(0.0, 0.1, -0.08);
      if (kind === "magnet") cameraRig.addImpulse(0.0, 0.08, 0.03);
    },
    onCollision: () => {
      cameraRig.addImpulse(0.0, 0.4, -0.25);
    }
  });

  let state: GameState = "boot";
  let dynamicResolution = 1;
  let lastSnapshot: SessionSnapshot | null = null;
  let fpsTimerSec = 0;
  let frames = 0;
  let fps = 0;
  const showDebug = new URLSearchParams(window.location.search).has("debug");

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    sceneBuilder.resize(width, height);
    postfx.setSize(width, height);
    updateRendererScale();
  }

  function updateRendererScale(): void {
    const dpr = window.devicePixelRatio || 1;
    const pixelRatio = Math.min(2.4, dpr * quality.pixelRatioScale * dynamicResolution);
    sceneBuilder.setPixelRatio(pixelRatio);
  }

  function setState(next: GameState): void {
    state = next;
    stateMachine.set(next);
    if (next === "menu") {
      hud.setVisible(false);
      menu.showMainMenu(highscores);
      return;
    }
    if (next === "playing") {
      menu.hideAll();
      hud.setVisible(true);
      return;
    }
    if (next === "paused") {
      menu.showPause();
      hud.setVisible(true);
      return;
    }
    if (next === "gameover") {
      hud.setVisible(true);
      if (lastSnapshot) {
        menu.showGameOver(
          {
            score: lastSnapshot.score.score,
            length: lastSnapshot.segments.length + 1
          },
          highscores
        );
      }
      return;
    }
  }

  function startGame(): void {
    session.reset();
    lastSnapshot = session.getSnapshot();
    sceneBuilder.updateFromSnapshot(lastSnapshot);
    const renderHead = sceneBuilder.renderPositionOf(lastSnapshot.head.position);
    cameraRig.reset(renderHead.x, renderHead.y, renderHead.z, lastSnapshot.head.headingRad);
    setState("playing");
  }

  function updateHud(snapshot: SessionSnapshot): void {
    const activePowerup = snapshot.activePowerup
      ? `${t(snapshot.activePowerup.kind)} ${snapshot.activePowerup.ttlSec.toFixed(1)}s`
      : t("none");
    hud.update({
      score: snapshot.score.score,
      speed: snapshot.head.speed,
      length: snapshot.segments.length + 1,
      combo: snapshot.score.combo,
      multiplier: snapshot.score.multiplier,
      powerupLabel: activePowerup,
      headPosition: snapshot.head.position,
      foods: snapshot.foods,
      pickups: snapshot.pickups,
      obstacles: snapshot.obstacles
    });
  }

  const loop = new GameLoop({
    update: (dt) => {
      if (state !== "playing") {
        return;
      }
      const result = session.update(dt, input.getInput());
      lastSnapshot = session.getSnapshot();
      if (result.gameOver) {
        setState("gameover");
      }
    },
    render: (_alpha, frameDeltaSec) => {
      if (!lastSnapshot) {
        return;
      }

      frames += 1;
      fpsTimerSec += frameDeltaSec;
      if (fpsTimerSec >= 1) {
        fps = Math.round(frames / fpsTimerSec);
        frames = 0;
        fpsTimerSec = 0;
      }

      dynamicResolution = clamp(
        dynamicResolution + (frameDeltaSec > 0.022 ? -0.03 : frameDeltaSec < 0.016 ? 0.015 : 0),
        0.7,
        1
      );
      updateRendererScale();

      sceneBuilder.updateFromSnapshot(lastSnapshot);
      const renderHead = sceneBuilder.renderPositionOf(lastSnapshot.head.position);
      cameraRig.update(
        frameDeltaSec,
        renderHead.x,
        renderHead.y,
        renderHead.z,
        lastSnapshot.head.headingRad,
        lastSnapshot.speed01
      );
      postfx.render();
      updateHud(lastSnapshot);

      if (showDebug) {
        const calls = sceneBuilder.renderer.info.render.calls;
        const tris = sceneBuilder.renderer.info.render.triangles;
        hud.setDebugLine(`FPS ${fps} • ${(frameDeltaSec * 1000).toFixed(1)} ms • calls ${calls} • tris ${tris}`);
      } else {
        hud.setDebugLine("");
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (state === "playing") {
      setState("paused");
    } else if (state === "paused") {
      setState("playing");
    }
  });
  window.addEventListener("resize", resize);

  (window as unknown as {
    __snake3d?: {
      getState: () => GameState;
      forceGameOver: () => void;
      startGame: () => void;
    };
  }).__snake3d = {
    getState: () => state,
    forceGameOver: () => {
      if (!lastSnapshot) return;
      setState("gameover");
    },
    startGame
  };

  resize();
  session.reset();
  lastSnapshot = session.getSnapshot();
  sceneBuilder.updateFromSnapshot(lastSnapshot);
  {
    const renderHead = sceneBuilder.renderPositionOf(lastSnapshot.head.position);
    cameraRig.reset(renderHead.x, renderHead.y, renderHead.z, lastSnapshot.head.headingRad);
  }
  menu.applyTranslations();
  hud.applyTranslations();
  settingsUi.applyTranslations();
  setState("menu");
  loop.start();
}

void bootstrap();
