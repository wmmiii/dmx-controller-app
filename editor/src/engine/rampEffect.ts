import { ChannelTypes } from "./fixture";
import { Effect_RampEffect, Effect_RampEffect_EasingFunction } from "@dmx-controller/proto/effect_pb";
import { applyState } from "./effect";
import { RenderContext, getDevice } from "./universe";
import { applySequence } from "./sequence";

export function rampEffect(
  context: RenderContext,
  effect: Effect_RampEffect,
  amountT: number,
  beatIndex: number,
  beatT: number): void {

  const start = new Uint8Array(context.universe);
  const end = new Uint8Array(context.universe);

  const startContext = Object.assign({}, context, { universe: start });
  if (effect.start.case === 'fixtureStateStart') {
    applyState(effect.start.value, startContext);
  } else {
    applySequence(
      startContext,
      effect.start.value,
      amountT,
      beatIndex,
      beatT);
  }

  const endContext = Object.assign({}, context, { universe: end });
  if (effect.end.case === 'fixtureStateEnd') {
    applyState(effect.end.value, endContext);
  } else {
    applySequence(
      endContext,
      effect.end.value,
      amountT,
      beatIndex,
      beatT);
  }

  const t = context.t;
  let effectT: number;
  switch (effect.easing) {
    case Effect_RampEffect_EasingFunction.EASE_IN:
      effectT = t * t * t;
      break;
    case Effect_RampEffect_EasingFunction.EASE_OUT:
      effectT = 1 - Math.pow(1 - t, 3);
      break;
    case Effect_RampEffect_EasingFunction.EASE_IN_OUT:
      effectT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      break;
    case Effect_RampEffect_EasingFunction.SINE:
      effectT = -(Math.cos(Math.PI * t) - 1) / 2;
      break;
    case Effect_RampEffect_EasingFunction.LINEAR: // Fall-through
    default:
      effectT = t;
  }

  // First do a dumb interpolation of all the channels to set coarse values.
  for (let i = 0; i < context.universe.length; ++i) {
    context.universe[i] = Math.floor(start[i] * (1 - effectT) + end[i] * effectT);
  }

  const outputDevice = getDevice(context);

  // Next fixup all the fine values.
  outputDevice.channelTypes.forEach((type, i) => {
    if (type.indexOf('-fine') >= 0) {
      const coarseType = type.substring(0, type.length - 5) as ChannelTypes;
      const coarseIndex = outputDevice.channelTypes.indexOf(coarseType);
      const coarseValue = start[coarseIndex] * (1 - effectT) +
        end[coarseIndex] * effectT;
      context.universe[i] = Math.floor(coarseValue * 255) % 255;
    }
  });
}
