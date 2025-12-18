import { EventEmitter } from "~/shared/utils";
import type { ResourceItem } from "~/shared/types";

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
 * Resources - Type definition for asset loader
 * Used as type reference for World components
 */
export default class Resources extends EventEmitter<ResourcesEvents> {
  items: Record<string, ResourceItem> = {};
  toLoad: number = 0;
  loaded: number = 0;
}
