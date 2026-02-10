import { t } from "../i18n";
import type { SettingsState } from "../types";

export interface SettingsCallbacks {
  onChange: (next: SettingsState) => void;
}

export class SettingsUI {
  readonly root: HTMLDivElement;
  private readonly callbacks: SettingsCallbacks;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly languageSelect: HTMLSelectElement;
  private readonly postfxCheckbox: HTMLInputElement;
  private readonly sensitivityRange: HTMLInputElement;
  private readonly sensitivityValue: HTMLSpanElement;
  private current: SettingsState;

  constructor(parent: HTMLElement, initial: SettingsState, callbacks: SettingsCallbacks) {
    this.current = { ...initial };
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "settings-layer hidden";
    this.root.innerHTML = `
      <div class="settings-panel">
        <h2 data-i18n="settings"></h2>
        <label>
          <span data-i18n="quality"></span>
          <select id="quality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          <span data-i18n="language"></span>
          <select id="language">
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </label>
        <label class="checkbox-row">
          <span data-i18n="postfx"></span>
          <input id="postfx" type="checkbox" />
        </label>
        <label>
          <span data-i18n="sensitivity"></span>
          <div class="range-row">
            <input id="sensitivity" type="range" min="0.55" max="1.65" step="0.01" />
            <span id="sensitivity-value"></span>
          </div>
        </label>
        <button class="btn-primary" data-action="close" data-i18n="close"></button>
      </div>
    `;
    parent.appendChild(this.root);

    this.qualitySelect = this.root.querySelector("#quality") as HTMLSelectElement;
    this.languageSelect = this.root.querySelector("#language") as HTMLSelectElement;
    this.postfxCheckbox = this.root.querySelector("#postfx") as HTMLInputElement;
    this.sensitivityRange = this.root.querySelector("#sensitivity") as HTMLInputElement;
    this.sensitivityValue = this.root.querySelector("#sensitivity-value") as HTMLSpanElement;
    this.bindEvents();
    this.syncUI(this.current);
    this.applyTranslations();
  }

  open(): void {
    this.root.classList.remove("hidden");
  }

  close(): void {
    this.root.classList.add("hidden");
  }

  applyTranslations(): void {
    this.root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n ?? "";
      node.textContent = t(key);
    });
  }

  setState(next: SettingsState): void {
    this.current = { ...next };
    this.syncUI(this.current);
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "close") {
        this.close();
      }
    });

    this.qualitySelect.addEventListener("change", () => {
      this.current.quality = this.qualitySelect.value as SettingsState["quality"];
      this.emitChange();
    });
    this.languageSelect.addEventListener("change", () => {
      this.current.language = this.languageSelect.value as SettingsState["language"];
      this.emitChange();
    });
    this.postfxCheckbox.addEventListener("change", () => {
      this.current.postfxEnabled = this.postfxCheckbox.checked;
      this.emitChange();
    });
    this.sensitivityRange.addEventListener("input", () => {
      this.current.inputSensitivity = Number(this.sensitivityRange.value);
      this.sensitivityValue.textContent = this.current.inputSensitivity.toFixed(2);
      this.emitChange();
    });
  }

  private syncUI(settings: SettingsState): void {
    this.qualitySelect.value = settings.quality;
    this.languageSelect.value = settings.language;
    this.postfxCheckbox.checked = settings.postfxEnabled;
    this.sensitivityRange.value = settings.inputSensitivity.toFixed(2);
    this.sensitivityValue.textContent = settings.inputSensitivity.toFixed(2);
  }

  private emitChange(): void {
    this.callbacks.onChange({ ...this.current });
  }
}
