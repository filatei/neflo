import type { NgnRail } from "./types";
import { SquadRail } from "./squad";

let rail: NgnRail | null = null;

/** The active NGN collection rail. Squad today; swap/extend here later. */
export function getNgnRail(): NgnRail {
  if (!rail) rail = new SquadRail();
  return rail;
}

export type { NgnRail } from "./types";
