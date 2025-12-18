import EventEmitter from "./events";

type SizesEvents = {
  resize: {
    width: number;
    height: number;
    pixelRatio: number;
  };
};

export default class Sizes extends EventEmitter<SizesEvents> {
  public width: number;
  public height: number;
  public pixelRatio: number;

  constructor() {
    super();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = this.getPixelRatio();

    window.addEventListener("resize", () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.pixelRatio = this.getPixelRatio();

      this.emit("resize", {
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      });
    });
  }

  private getPixelRatio() {
    return Math.min(window.devicePixelRatio, 2);
  }
}
