import type { SerializedInputEvent } from "~/shared/types";

export type InputHandler = (event: SerializedInputEvent) => void;

/**
 * InputManager - Captures DOM input events and serializes them for workers
 */
export default class InputManager {
  private canvas: HTMLCanvasElement;
  private handler: InputHandler | null = null;
  private abortController: AbortController;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

    // Pointer events
    this.canvas.addEventListener("pointerdown", this.handlePointer, options);
    this.canvas.addEventListener("pointermove", this.handlePointer, options);
    this.canvas.addEventListener("pointerup", this.handlePointer, options);
    this.canvas.addEventListener("pointercancel", this.handlePointer, options);

    // Wheel event
    this.canvas.addEventListener("wheel", this.handleWheel, {
      ...options,
      passive: false,
    });

    // Context menu (prevent default)
    this.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
      options,
    );

    // Keyboard events (on window to capture regardless of focus)
    window.addEventListener("keydown", this.handleKeyboard, options);
    window.addEventListener("keyup", this.handleKeyboard, options);
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!this.handler) return;

    // Only capture movement keys (expand as needed)
    const movementKeys = ["w", "a", "s", "d", "W", "A", "S", "D", "Shift"];
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

  private handlePointer = (event: PointerEvent): void => {
    if (!this.handler) return;

    const serialized: SerializedInputEvent = {
      type: event.type as
        | "pointerdown"
        | "pointermove"
        | "pointerup"
        | "pointercancel",
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    };

    this.handler(serialized);
  };

  private handleWheel = (event: WheelEvent): void => {
    if (!this.handler) return;

    event.preventDefault();

    const serialized: SerializedInputEvent = {
      type: "wheel",
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    };

    this.handler(serialized);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    if (!this.handler) return;

    event.preventDefault();

    const serialized: SerializedInputEvent = {
      type: "contextmenu",
    };

    this.handler(serialized);
  };

  dispose(): void {
    this.abortController.abort();
  }
}
