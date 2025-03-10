import { Effect_StrobeEffect } from "@dmx-controller/proto/effect_pb";
import { applyState } from "./effect";
import { RenderContext } from "./universe";

export function strobeEffect(
  context: RenderContext,
  effect: Effect_StrobeEffect,
  frame: number): void {
  if (effect.stateA == null || effect.stateB == null) {
    throw new Error('Tried to render strobe effect without state!');
  }
  if (frame % (effect.stateAFames + effect.stateBFames) < effect.stateAFames) {
    applyState(effect.stateA, context);
  } else {
    applyState(effect.stateB, context);
  }
}
