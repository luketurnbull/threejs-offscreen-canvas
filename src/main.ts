import Experience from "~/experience/index";

// Get the canvas element
const canvas = document.querySelector("canvas#webgl") as HTMLCanvasElement;

// Initialize the experience
new Experience(canvas);
