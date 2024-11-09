import { Effect_StrobeEffect } from "@dmx-controller/proto/effect_pb";
import { applyState } from "./effect";
import { RenderContext } from "./universe";

export function strobeEffect(
  context: RenderContext,
  effect: Effect_StrobeEffect,
  frame: number): void {
  if (frame % (effect.stateAFames + effect.stateBFames) < effect.stateAFames) {
    if (effect.stateA.case === 'fixtureStateA') {
      applyState(effect.stateA.value, context);
    }
  } else {
    if (effect.stateB.case === 'fixtureStateB') {
      applyState(effect.stateB.value, context);
    }
  }
}
