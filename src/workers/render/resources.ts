import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EventEmitter } from "~/shared/utils";
import type { ResourceItem, Source } from "~/shared/types";

type ResourcesEvents = {
  progress: {
    url: string;
    loaded: number;
    total: number;
    progress: number;
  };
  ready: {
    itemsLoaded: number;
  };
};

/**
 * Resources - Worker-compatible asset loader
 *
 * Uses fetch + createImageBitmap for textures (no DOM dependency).
 * GLTFLoader works natively in workers.
 */
export default class Resources extends EventEmitter<ResourcesEvents> {
  items: Record<string, ResourceItem>;
  toLoad: number;
  loaded: number;

  private gltfLoader: GLTFLoader;
  private baseUrl: string;

  constructor(sources: Source[]) {
    super();

    this.items = {};
    this.toLoad = sources.length;
    this.loaded = 0;

    // Get base URL for resolving relative paths in worker
    this.baseUrl = self.location.origin + "/";

    // GLTFLoader works in workers
    this.gltfLoader = new GLTFLoader();

    this.startLoading(sources);
  }

  private getAbsoluteUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    return this.baseUrl + path;
  }

  private startLoading(sources: Source[]): void {
    for (const source of sources) {
      switch (source.type) {
        case "texture":
          this.loadTexture(source);
          break;
        case "cubeTexture":
          this.loadCubeTexture(source);
          break;
        case "gltfModel":
          this.loadGLTF(source);
          break;
        default:
          console.error(`Unknown source type: ${source.type}`);
      }
    }
  }

  private async loadTexture(source: Source): Promise<void> {
    const path = this.getAbsoluteUrl(source.path as string);

    try {
      const response = await fetch(path);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob, {
        imageOrientation: "flipY",
      });

      const texture = new THREE.CanvasTexture(
        imageBitmap as unknown as HTMLCanvasElement,
      );
      texture.needsUpdate = true;
      this.sourceLoaded(source, texture);
    } catch (error) {
      console.error(`Failed to load texture: ${path}`, error);
      this.sourceLoaded(source, new THREE.Texture());
    }
  }

  private async loadCubeTexture(source: Source): Promise<void> {
    const paths = (source.path as string[]).map((p) => this.getAbsoluteUrl(p));

    try {
      const imageBitmaps = await Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path);
          const blob = await response.blob();
          return createImageBitmap(blob);
        }),
      );

      const cubeTexture = new THREE.CubeTexture(
        imageBitmaps as unknown as HTMLImageElement[],
      );
      cubeTexture.needsUpdate = true;
      this.sourceLoaded(source, cubeTexture);
    } catch (error) {
      console.error(`Failed to load cube texture: ${source.name}`, error);
      this.sourceLoaded(source, new THREE.CubeTexture());
    }
  }

  private loadGLTF(source: Source): void {
    const path = this.getAbsoluteUrl(source.path as string);

    this.gltfLoader.load(
      path,
      (gltf) => {
        this.sourceLoaded(source, gltf);
      },
      undefined,
      (error) => {
        console.error(`Failed to load GLTF: ${path}`, error);
      },
    );
  }

  private sourceLoaded(source: Source, file: ResourceItem): void {
    this.items[source.name] = file;
    this.loaded++;

    const url = Array.isArray(source.path) ? source.path[0] : source.path;
    this.emit("progress", {
      url,
      loaded: this.loaded,
      total: this.toLoad,
      progress: this.loaded / this.toLoad,
    });

    if (this.loaded === this.toLoad) {
      this.emit("ready", {
        itemsLoaded: this.loaded,
      });
    }
  }
}
