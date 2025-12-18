/**
 * Render Worker Entry Point
 *
 * Thin entry point - all logic lives in renderer/ domain module.
 */
import * as Comlink from "comlink";
import { createRenderApi } from "../renderer";

Comlink.expose(createRenderApi());
