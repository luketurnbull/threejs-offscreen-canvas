import EventEmitter from "./events";

type TimeEvents = {
  tick: {
    delta: number;
    elapsed: number;
  };
};

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

    window.requestAnimationFrame(() => {
      this.tick();
    });
  }

  private tick(): void {
    const currentTime = Date.now();
    this.delta = currentTime - this.current;
    this.current = currentTime;
    this.elapsed = this.current - this.start;

    this.emit("tick", {
      delta: this.delta,
      elapsed: this.elapsed,
    });

    window.requestAnimationFrame(() => {
      this.tick();
    });
  }
}
