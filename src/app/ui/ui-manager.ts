import { ErrorOverlay } from "../components/error-overlay";
import { LoadingScreen } from "../components/loading-screen";
import { EntitySpawnerUI } from "../components/entity-spawner-ui";
import { KeyboardControlsUI } from "../components/keyboard-controls-ui";

/**
 * UIManager - Manages UI component lifecycle
 */
export default class UIManager {
  private errorOverlay: ErrorOverlay | null = null;
  private loadingScreen: LoadingScreen | null = null;
  private spawnerUI: EntitySpawnerUI | null = null;
  private keyboardControlsUI: KeyboardControlsUI | null = null;

  showLoadingScreen(onStart: () => void): void {
    this.loadingScreen = new LoadingScreen();
    this.loadingScreen.setOnStart(onStart);
    document.body.appendChild(this.loadingScreen);
  }

  updateLoadProgress(progress: number): void {
    const percentage = Math.round(progress * 100);
    this.loadingScreen?.setProgress(
      progress,
      `Loading assets... ${percentage}%`,
    );
  }

  showStartButton(): void {
    this.loadingScreen?.showStartButton();
  }

  createSpawnerUI(): EntitySpawnerUI {
    this.spawnerUI = new EntitySpawnerUI();
    document.body.appendChild(this.spawnerUI);
    return this.spawnerUI;
  }

  createKeyboardControlsUI(): KeyboardControlsUI {
    this.keyboardControlsUI = new KeyboardControlsUI();
    document.body.appendChild(this.keyboardControlsUI);
    return this.keyboardControlsUI;
  }

  showError(message: string, details?: string): void {
    if (!this.errorOverlay) {
      this.errorOverlay = new ErrorOverlay();
      document.body.appendChild(this.errorOverlay);
    }
    this.errorOverlay.show(message, details);
  }

  dispose(): void {
    this.errorOverlay?.remove();
    this.loadingScreen?.remove();
    this.spawnerUI?.remove();
    this.keyboardControlsUI?.remove();
    this.errorOverlay = null;
    this.loadingScreen = null;
    this.spawnerUI = null;
    this.keyboardControlsUI = null;
  }
}

export { ErrorOverlay };
