import { ChannelTypes } from "./fixture";
import { Effect_RampEffect, Effect_RampEffect_EasingFunction } from "@dmx-controller/proto/effect_pb";
import { applyState } from "./effect";
import { RenderContext, getDevice } from "./universe";
import { applyFixtureSequence } from "./fixtureSequence";
import { interpolateUniverses } from "./utils";

export function rampEffect(
  context: RenderContext,
  effect: Effect_RampEffect,
  t: number,
  beatIndex: number,
  beatT: number): void {

  const start = new Uint8Array(context.universe);
  const end = new Uint8Array(context.universe);

  const startContext = Object.assign({}, context, { universe: start });
  if (effect.start.case === 'fixtureStateStart') {
    applyState(effect.start.value, startContext);
  } else {
    applyFixtureSequence(
      startContext,
      effect.start.value,
      t,
      beatIndex,
      beatT);
  }

  const endContext = Object.assign({}, context, { universe: end });
  if (effect.end.case === 'fixtureStateEnd') {
    applyState(effect.end.value, endContext);
  } else {
    applyFixtureSequence(
      endContext,
      effect.end.value,
      t,
      beatIndex,
      beatT);
  }

  let easedT: number;
  switch (effect.easing) {
    case Effect_RampEffect_EasingFunction.EASE_IN:
      easedT = t * t * t;
      break;
    case Effect_RampEffect_EasingFunction.EASE_OUT:
      easedT = 1 - Math.pow(1 - t, 3);
      break;
    case Effect_RampEffect_EasingFunction.EASE_IN_OUT:
      easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      break;
    case Effect_RampEffect_EasingFunction.SINE:
      easedT = -(Math.cos(Math.PI * t) - 1) / 2;
      break;
    case Effect_RampEffect_EasingFunction.LINEAR: // Fall-through
    default:
      easedT = t;
  }

  interpolateUniverses(context.universe, context.project, t, start, end);
}
