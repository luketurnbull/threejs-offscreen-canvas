import { ErrorOverlay } from "../components/error-overlay";
import { LoadingScreen } from "../components/loading-screen";
import { EntitySpawnerUI } from "../components/entity-spawner-ui";
import { KeyboardControlsUI } from "../components/keyboard-controls-ui";
import { VirtualJoystick } from "../components/virtual-joystick";
import { JumpButton } from "../components/jump-button";
import { MobileSpawnerMenu } from "../components/mobile-spawner-menu";
import { isMobile } from "../utils/device-detector";

/**
 * UIManager - Manages UI component lifecycle
 *
 * Detects mobile devices and shows appropriate controls:
 * - Desktop: EntitySpawnerUI (bottom-left), KeyboardControlsUI (bottom-right)
 * - Mobile: MobileSpawnerMenu (top-left), VirtualJoystick (bottom-right), JumpButton (bottom-left)
 */
export default class UIManager {
  readonly isMobileDevice: boolean;
  private errorOverlay: ErrorOverlay | null = null;
  private loadingScreen: LoadingScreen | null = null;
  private spawnerUI: EntitySpawnerUI | null = null;
  private keyboardControlsUI: KeyboardControlsUI | null = null;
  private joystick: VirtualJoystick | null = null;
  private jumpButton: JumpButton | null = null;
  private mobileSpawner: MobileSpawnerMenu | null = null;

  constructor() {
    this.isMobileDevice = isMobile();
  }

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

  createSpawnerUI(): EntitySpawnerUI | MobileSpawnerMenu {
    if (this.isMobileDevice) {
      this.mobileSpawner = new MobileSpawnerMenu();
      document.body.appendChild(this.mobileSpawner);
      return this.mobileSpawner;
    }
    this.spawnerUI = new EntitySpawnerUI();
    document.body.appendChild(this.spawnerUI);
    return this.spawnerUI;
  }

  createKeyboardControlsUI(): KeyboardControlsUI | null {
    if (this.isMobileDevice) return null;
    this.keyboardControlsUI = new KeyboardControlsUI();
    document.body.appendChild(this.keyboardControlsUI);
    return this.keyboardControlsUI;
  }

  createMobileControls(): {
    joystick: VirtualJoystick;
    jumpButton: JumpButton;
  } {
    this.joystick = new VirtualJoystick();
    this.jumpButton = new JumpButton();
    document.body.appendChild(this.joystick);
    document.body.appendChild(this.jumpButton);
    return { joystick: this.joystick, jumpButton: this.jumpButton };
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
    this.joystick?.remove();
    this.jumpButton?.remove();
    this.mobileSpawner?.remove();
    this.errorOverlay = null;
    this.loadingScreen = null;
    this.spawnerUI = null;
    this.keyboardControlsUI = null;
    this.joystick = null;
    this.jumpButton = null;
    this.mobileSpawner = null;
  }
}

export { ErrorOverlay };
