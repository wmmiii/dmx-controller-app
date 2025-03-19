import { Effect_RandomEffect } from "@dmx-controller/proto/effect_pb";
import { RenderContext } from "./universe";
import { applyState } from "./effect";
import { EVEN_SUM, LARGE_PRIME, ODD_SUM, RANDOM_NUMBERS } from "../util/random";
import { rampEffect } from "./rampEffect";
import { strobeEffect } from "./strobeEffect";

export function randomEffect(
  context: RenderContext,
  effect: Effect_RandomEffect,
  frame: number,
  seed = 0): void {
  const windowSize =
    ODD_SUM * effect.effectAVariation +
    RANDOM_NUMBERS.length / 2 * effect.effectAMin +
    EVEN_SUM * effect.effectBVariation +
    RANDOM_NUMBERS.length / 2 * effect.effectBMin;
  const effectT = (
    context.globalT +
    (effect.seed + seed) * LARGE_PRIME
  ) % windowSize;
  let counter = 0;
  let subEffect: Effect_RandomEffect['effectA'] | Effect_RandomEffect['effectB'] | undefined;
  let subEffectT = 0;

  for (let i = 0; i < RANDOM_NUMBERS.length; ++i) {
    const prevCounter = counter;
    if (i % 2 === 0) {
      counter += RANDOM_NUMBERS[i] * effect.effectAVariation + effect.effectAMin;
    } else {
      counter += RANDOM_NUMBERS[i] * effect.effectBVariation + effect.effectBMin;
    }

    if (effectT < counter) {
      subEffectT = (effectT - prevCounter) / (counter - prevCounter);
      if (i % 2 == 0) {
        subEffect = effect.effectA;
      } else {
        subEffect = effect.effectB;
      }
      break;
    }
  }

  if (!subEffect) {
    throw new Error(`Could not determine sub effect of random effect!\tWindow size: ${windowSize}\nEffect time: ${effectT}`);
  }

  switch (subEffect.case) {
    case 'aStaticEffect':
    case 'bStaticEffect':
      applyState(subEffect.value.state!, context);
      break;
    case 'aRampEffect':
    case 'bRampEffect':
      rampEffect(context, subEffect.value, subEffectT);
      break;
    case 'aStrobeEffect':
    case 'bStrobeEffect':
      strobeEffect(context, subEffect.value, frame);
      break;
  }
}
