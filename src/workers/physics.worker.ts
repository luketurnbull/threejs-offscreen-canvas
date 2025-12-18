/**
 * Physics Worker Entry Point
 *
 * Thin entry point - all logic lives in physics/ domain module.
 */
import * as Comlink from "comlink";
import { createPhysicsApi } from "../physics";

Comlink.expose(createPhysicsApi());
