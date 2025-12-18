import { EventEmitter } from "~/shared/utils";

type TimeEvents = {
  tick: {
    delta: number;
    elapsed: number;
  };
};

/**
 * Time - Animation loop manager
 * Used as type reference for World components
 */
export default class Time extends EventEmitter<TimeEvents> {
  start: number;
  current: number;
  elapsed: number;
  delta: number;

  constructor() {
    super();

    this.start = Date.now();
    this.current = this.start;
    this.elapsed = 0;
    this.delta = 16;
  }
}
