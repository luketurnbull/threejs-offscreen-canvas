import type * as Comlink from "comlink";
import type {
  RenderApi,
  PhysicsApi,
  SerializedInputEvent,
  MovementInput,
} from "~/shared/types";

/**
 * InputRouter - Routes input events to appropriate workers
 *
 * Single responsibility: Convert DOM input events to worker commands.
 * Keyboard events become physics movement input.
 * All events are forwarded to render for camera control.
 */
export default class InputRouter {
  private physicsApi: Comlink.Remote<PhysicsApi>;
  private renderApi: Comlink.Remote<RenderApi>;

  private currentInput: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };

  constructor(
    physicsApi: Comlink.Remote<PhysicsApi>,
    renderApi: Comlink.Remote<RenderApi>,
  ) {
    this.physicsApi = physicsApi;
    this.renderApi = renderApi;
  }

  /**
   * Handle an input event from InputManager
   */
  handleInput(event: SerializedInputEvent): void {
    // Forward to render for camera/UI interaction
    this.renderApi.handleInput(event);

    // Convert keyboard events to movement input for physics
    if (event.type === "keydown" || event.type === "keyup") {
      const pressed = event.type === "keydown";
      const key = event.key.toLowerCase();

      let inputChanged = false;

      switch (key) {
        case "w":
          this.currentInput.forward = pressed;
          inputChanged = true;
          break;
        case "s":
          this.currentInput.backward = pressed;
          inputChanged = true;
          break;
        case "a":
          this.currentInput.left = pressed;
          inputChanged = true;
          break;
        case "d":
          this.currentInput.right = pressed;
          inputChanged = true;
          break;
        case " ":
          this.currentInput.jump = pressed;
          inputChanged = true;
          break;
        case "shift":
          this.currentInput.sprint = pressed;
          inputChanged = true;
          break;
      }

      if (inputChanged) {
        this.physicsApi.setPlayerInput({ ...this.currentInput });
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Reset input state
    this.currentInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
    };
  }
}
