import type { SerializedInputEvent } from "~/shared/types";

export type InputHandler = (event: SerializedInputEvent) => void;

/**
 * InputManager - Captures DOM input events and serializes them for workers
 *
 * Currently handles keyboard events for player movement (WASD + Shift).
 * Can be extended for pointer/wheel events when needed (e.g., camera orbit).
 */
export default class InputManager {
  private handler: InputHandler | null = null;
  private abortController: AbortController;

  constructor(_canvas: HTMLCanvasElement) {
    this.abortController = new AbortController();
    this.setupEventListeners();
  }

  /**
   * Set the callback for input events
   */
  setEventCallback(handler: InputHandler): void {
    this.handler = handler;
  }

  private setupEventListeners(): void {
    const options = { signal: this.abortController.signal };

    // Keyboard events (on window to capture regardless of focus)
    window.addEventListener("keydown", this.handleKeyboard, options);
    window.addEventListener("keyup", this.handleKeyboard, options);
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!this.handler) return;

    // Only capture movement keys (including spacebar for jump)
    const movementKeys = ["w", "a", "s", "d", "W", "A", "S", "D", "Shift", " "];
    if (!movementKeys.includes(event.key)) return;

    // Prevent default to avoid scrolling etc.
    event.preventDefault();

    const serialized: SerializedInputEvent = {
      type: event.type as "keydown" | "keyup",
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
    };

    this.handler(serialized);
  };

  dispose(): void {
    this.abortController.abort();
  }
}
