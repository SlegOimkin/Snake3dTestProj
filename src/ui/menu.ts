import type { HighscoreEntry } from "../types";
import { t } from "../i18n";

export interface GameOverModel {
  score: number;
  length: number;
}

export interface MenuCallbacks {
  onStart: (name: string) => void;
  onOpenSettings: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSaveScore: (name: string) => void;
}

export class MenuUI {
  readonly root: HTMLDivElement;
  private readonly callbacks: MenuCallbacks;

  private readonly mainPanel: HTMLDivElement;
  private readonly pausePanel: HTMLDivElement;
  private readonly gameOverPanel: HTMLDivElement;
  private readonly highscoreListMain: HTMLUListElement;
  private readonly highscoreListGameOver: HTMLUListElement;
  private readonly scoreSummary: HTMLDivElement;
  private readonly playerNameInput: HTMLInputElement;
  private readonly saveResultText: HTMLDivElement;
  private readonly mainPlayerNameInput: HTMLInputElement;
  private readonly mainStatusText: HTMLDivElement;
  private readonly mainPlayButton: HTMLButtonElement;
  private connecting = false;

  constructor(parent: HTMLElement, callbacks: MenuCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "menu-layer";
    parent.appendChild(this.root);

    this.mainPanel = document.createElement("div");
    this.mainPanel.className = "menu-panel main-panel";
    this.mainPanel.innerHTML = `
      <h1>\u041a\u043e\u0441\u043c\u043e\u0433\u043b\u0438\u0441\u0442\u044b: \u0442\u0435\u043f\u0435\u0440\u044c 3\u0414</h1>
      <p class="subtitle" data-i18n="subtitle"></p>
      <label class="name-input">
        <span data-i18n="playerName"></span>
        <input class="menu-player-name" maxlength="16" placeholder="Player" />
      </label>
      <div class="buttons">
        <button class="btn-primary" data-action="play" data-i18n="onlineArena"></button>
        <button class="btn-outline" data-action="settings" data-i18n="settings"></button>
      </div>
      <div class="menu-status"></div>
      <h3 data-i18n="highscores"></h3>
      <ul class="highscore-list"></ul>
    `;
    this.mainPlayerNameInput = this.mainPanel.querySelector(".menu-player-name") as HTMLInputElement;
    this.mainStatusText = this.mainPanel.querySelector(".menu-status") as HTMLDivElement;
    this.mainPlayButton = this.mainPanel.querySelector("[data-action='play']") as HTMLButtonElement;
    this.highscoreListMain = this.mainPanel.querySelector(".highscore-list") as HTMLUListElement;
    this.root.appendChild(this.mainPanel);

    this.pausePanel = document.createElement("div");
    this.pausePanel.className = "menu-panel pause-panel hidden";
    this.pausePanel.innerHTML = `
      <h2 data-i18n="paused"></h2>
      <div class="buttons">
        <button class="btn-primary" data-action="resume" data-i18n="resume"></button>
        <button class="btn-outline" data-action="restart" data-i18n="restart"></button>
        <button class="btn-outline" data-action="settings" data-i18n="settings"></button>
        <button class="btn-outline" data-action="mainmenu" data-i18n="mainMenu"></button>
      </div>
    `;
    this.root.appendChild(this.pausePanel);

    this.gameOverPanel = document.createElement("div");
    this.gameOverPanel.className = "menu-panel gameover-panel hidden";
    this.gameOverPanel.innerHTML = `
      <h2 data-i18n="gameOver"></h2>
      <div class="summary"></div>
      <label class="name-input">
        <span data-i18n="playerName"></span>
        <input maxlength="16" placeholder="Player" />
      </label>
      <div class="buttons">
        <button class="btn-primary" data-action="save" data-i18n="saveScore"></button>
        <button class="btn-outline" data-action="restart" data-i18n="restart"></button>
        <button class="btn-outline" data-action="mainmenu" data-i18n="mainMenu"></button>
      </div>
      <div class="save-result"></div>
      <h3 data-i18n="highscores"></h3>
      <ul class="highscore-list"></ul>
    `;
    this.scoreSummary = this.gameOverPanel.querySelector(".summary") as HTMLDivElement;
    this.playerNameInput = this.gameOverPanel.querySelector("input") as HTMLInputElement;
    this.saveResultText = this.gameOverPanel.querySelector(".save-result") as HTMLDivElement;
    this.highscoreListGameOver = this.gameOverPanel.querySelector(".highscore-list") as HTMLUListElement;
    this.root.appendChild(this.gameOverPanel);

    this.bindEvents();
    this.applyTranslations();
    this.updatePlayButtonState();
  }

  applyTranslations(): void {
    this.root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n ?? "";
      node.textContent = t(key);
    });
    this.playerNameInput.placeholder = t("playerName");
    this.mainPlayerNameInput.placeholder = t("playerName");
  }

  hideAll(): void {
    this.mainPanel.classList.add("hidden");
    this.pausePanel.classList.add("hidden");
    this.gameOverPanel.classList.add("hidden");
    this.root.classList.add("hidden");
  }

  showMainMenu(highscores: HighscoreEntry[]): void {
    this.root.classList.remove("hidden");
    this.mainPanel.classList.remove("hidden");
    this.pausePanel.classList.add("hidden");
    this.gameOverPanel.classList.add("hidden");
    this.saveResultText.textContent = "";
    this.renderHighscores(this.highscoreListMain, highscores);
  }

  showPause(): void {
    this.root.classList.remove("hidden");
    this.mainPanel.classList.add("hidden");
    this.pausePanel.classList.remove("hidden");
    this.gameOverPanel.classList.add("hidden");
  }

  showGameOver(model: GameOverModel, highscores: HighscoreEntry[]): void {
    this.root.classList.remove("hidden");
    this.mainPanel.classList.add("hidden");
    this.pausePanel.classList.add("hidden");
    this.gameOverPanel.classList.remove("hidden");
    this.scoreSummary.textContent = `${t("score")}: ${model.score} | ${t("length")}: ${model.length}`;
    this.renderHighscores(this.highscoreListGameOver, highscores);
    this.saveResultText.textContent = "";
  }

  showSavedMessage(): void {
    this.saveResultText.textContent = t("newRecord");
  }

  setMainStatus(text: string, isError = false): void {
    this.mainStatusText.textContent = text;
    this.mainStatusText.classList.toggle("error", isError);
  }

  setConnecting(connecting: boolean): void {
    this.connecting = connecting;
    this.updatePlayButtonState();
  }

  getMainPlayerName(): string {
    return this.mainPlayerNameInput.value.trim().slice(0, 16);
  }

  setMainPlayerName(name: string): void {
    this.mainPlayerNameInput.value = name.trim().slice(0, 16);
    this.updatePlayButtonState();
  }

  private bindEvents(): void {
    this.mainPlayerNameInput.addEventListener("input", () => {
      if (this.mainStatusText.textContent) {
        this.setMainStatus("");
      }
      this.updatePlayButtonState();
    });

    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      if (!action) return;
      if (action === "play") this.callbacks.onStart(this.getMainPlayerName());
      if (action === "settings") this.callbacks.onOpenSettings();
      if (action === "resume") this.callbacks.onResume();
      if (action === "restart") this.callbacks.onRestart();
      if (action === "mainmenu") this.callbacks.onMainMenu();
      if (action === "save") this.callbacks.onSaveScore(this.playerNameInput.value);
    });
  }

  private renderHighscores(container: HTMLUListElement, highscores: HighscoreEntry[]): void {
    container.innerHTML = "";
    if (highscores.length === 0) {
      const li = document.createElement("li");
      li.textContent = "-";
      container.appendChild(li);
      return;
    }
    highscores.forEach((entry, index) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.textContent = `${index + 1}. ${entry.name}`;
      const right = document.createElement("span");
      right.textContent = String(entry.score);
      li.append(left, right);
      container.appendChild(li);
    });
  }

  private updatePlayButtonState(): void {
    this.mainPlayButton.disabled = this.connecting || this.getMainPlayerName().length === 0;
  }
}
