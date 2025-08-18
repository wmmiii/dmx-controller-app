import { Effect_RandomEffect } from '@dmx-controller/proto/effect_pb';

import { EVEN_SUM, LARGE_PRIME, ODD_SUM, RANDOM_NUMBERS } from '../util/random';

import { RenderContext } from './context';
import { applyState } from './effect';
import { rampEffect } from './rampEffect';
import { strobeEffect } from './strobeEffect';

export function randomEffect(
  context: RenderContext,
  effect: Effect_RandomEffect,
  frame: number,
  seed = 0,
): void {
  const windowSize =
    ODD_SUM * effect.effectAVariation +
    (RANDOM_NUMBERS.length / 2) * effect.effectAMin +
    EVEN_SUM * effect.effectBVariation +
    (RANDOM_NUMBERS.length / 2) * effect.effectBMin;
  const effectT =
    (context.globalT + (effect.seed + seed) * LARGE_PRIME) % windowSize;
  let counter = 0;
  let subEffect:
    | Effect_RandomEffect['effectA']
    | Effect_RandomEffect['effectB']
    | undefined;
  let subEffectT = 0;

  for (let i = 0; i < RANDOM_NUMBERS.length; ++i) {
    const prevCounter = counter;
    if (i % 2 === 0) {
      counter +=
        RANDOM_NUMBERS[i] * effect.effectAVariation + effect.effectAMin;
    } else {
      counter +=
        RANDOM_NUMBERS[i] * effect.effectBVariation + effect.effectBMin;
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
    throw new Error(
      `Could not determine sub effect of random effect!\tWindow size: ${windowSize}\nEffect time: ${effectT}`,
    );
  }

  switch (subEffect.case) {
    case 'aStaticEffect':
    case 'bStaticEffect':
      applyState(subEffect.value.state!, context);
      break;
    case 'aRampEffect':
    case 'bRampEffect':
      const ramp = subEffect.value;
      const relativeT =
        subEffectT * (ramp.timingMultiplier || 1) * (ramp.mirrored ? 2 : 1);

      let rampT = relativeT % 1;
      if (ramp.mirrored && Math.floor(relativeT) % 2) {
        rampT = 1 - rampT;
      }
      rampEffect(context, subEffect.value, rampT);
      break;
    case 'aStrobeEffect':
    case 'bStrobeEffect':
      strobeEffect(context, subEffect.value, frame);
      break;
  }
}
