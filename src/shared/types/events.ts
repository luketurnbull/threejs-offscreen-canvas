// ============================================
// Input Events (Main Thread → Workers)
// ============================================

export type InputEventType =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel"
  | "wheel"
  | "contextmenu"
  | "keydown"
  | "keyup";

export interface SerializedPointerEvent {
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  pointerType: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface SerializedWheelEvent {
  type: "wheel";
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface SerializedKeyboardEvent {
  type: "keydown" | "keyup";
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export interface SerializedContextMenuEvent {
  type: "contextmenu";
}

export type SerializedInputEvent =
  | SerializedPointerEvent
  | SerializedWheelEvent
  | SerializedKeyboardEvent
  | SerializedContextMenuEvent;

// ============================================
// Viewport / Sizing
// ============================================

export interface ViewportSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ============================================
// Debug Events (Bidirectional)
// ============================================

export interface DebugBinding {
  id: string;
  folder: string;
  label: string;
  value: unknown;
  type: "number" | "boolean" | "color" | "select" | "button";
  options?: {
    min?: number;
    max?: number;
    step?: number;
    choices?: Record<string, unknown>;
  };
}

export interface DebugUpdateEvent {
  id: string;
  value: unknown;
}

export interface DebugButtonEvent {
  id: string;
}
