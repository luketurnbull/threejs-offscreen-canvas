import type {
  VirtualJoystick,
  JoystickState,
} from "../components/virtual-joystick";
import type { JumpButton } from "../components/jump-button";
import type InputRouter from "../routing/input-router";
import type { MovementInput } from "~/shared/types";

/**
 * TouchInputHandler - Bridges touch components to InputRouter
 *
 * Listens to joystick and jump button events, converts to MovementInput,
 * and routes to physics worker via InputRouter.
 */
export default class TouchInputHandler {
  private joystick: VirtualJoystick;
  private jumpButton: JumpButton;
  private inputRouter: InputRouter;
  private currentInput: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };

  constructor(
    joystick: VirtualJoystick,
    jumpButton: JumpButton,
    inputRouter: InputRouter,
  ) {
    this.joystick = joystick;
    this.jumpButton = jumpButton;
    this.inputRouter = inputRouter;
    this.addEventListeners();
  }

  private addEventListeners(): void {
    this.joystick.addEventListener("joystick-move", ((
      e: CustomEvent<JoystickState>,
    ) => {
      this.handleJoystickMove(e.detail);
    }) as EventListener);

    this.jumpButton.addEventListener("jump-start", () => {
      this.handleJump(true);
    });

    this.jumpButton.addEventListener("jump-end", () => {
      this.handleJump(false);
    });
  }

  private handleJoystickMove(state: JoystickState): void {
    const movement = this.joystickToMovement(state);
    this.currentInput = {
      ...this.currentInput,
      forward: movement.forward ?? false,
      backward: movement.backward ?? false,
      left: movement.left ?? false,
      right: movement.right ?? false,
      sprint: movement.sprint ?? false,
    };
    this.inputRouter.setMovementInput(this.currentInput);
  }

  private handleJump(pressed: boolean): void {
    this.currentInput = { ...this.currentInput, jump: pressed };
    this.inputRouter.setMovementInput(this.currentInput);
  }

  /**
   * Convert joystick state to movement booleans
   *
   * Angle convention: 0 = up (forward), PI/2 = right, PI = down, -PI/2 = left
   * Distance > 0.7 triggers sprint
   *
   * Uses separate thresholds for smooth diagonal movement:
   * - Forward zone: 0° to ±78° (forwardThreshold = 0.2)
   * - Turn zone: ±30° to ±150° (turnThreshold = 0.5)
   * - Diagonal overlap: ±30° to ±78° (both forward + turn active)
   */
  private joystickToMovement(state: JoystickState): Partial<MovementInput> {
    if (!state.active || state.distance < 0.1) {
      return {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
      };
    }

    // Decompose angle into axes
    // cos(0) = 1 = forward, cos(PI) = -1 = backward
    // sin(PI/2) = 1 = right, sin(-PI/2) = -1 = left
    const forwardAmount = Math.cos(state.angle);
    const rightAmount = Math.sin(state.angle);

    // Separate thresholds for smooth diagonal transitions
    // forwardThreshold 0.2 = forward active until ~78° from up
    // turnThreshold 0.5 = turn starts at ~30° from up
    // This creates diagonal zones where both are active
    const forwardThreshold = 0.2;
    const turnThreshold = 0.5;

    return {
      forward: forwardAmount > forwardThreshold,
      backward: false, // Backward movement disabled
      right: rightAmount > turnThreshold,
      left: rightAmount < -turnThreshold,
      sprint: state.distance > 0.7,
    };
  }

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
    this.inputRouter.setMovementInput(this.currentInput);
  }
}
