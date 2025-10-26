import { Effect_RampEffect } from '@dmx-controller/proto/effect_pb';

import { RenderContext } from './context';
import { applyState } from './effect';

export function rampEffect(
  context: RenderContext,
  effect: Effect_RampEffect,
  t: number,
): void {
  const start = context.output.clone();
  const end = context.output.clone();

  if (effect.stateStart == null) {
    throw new Error('Tried to render ramp effect without start state!');
  }
  const startContext = Object.assign({}, context, { output: start });
  applyState(effect.stateStart, startContext);

  if (effect.stateEnd == null) {
    throw new Error('Tried to render ramp effect without end state!');
  }
  const endContext = Object.assign({}, context, { output: end });
  applyState(effect.stateEnd, endContext);

  let easedT: number;
  switch (effect.easing) {
    case Effect_EasingFunction.EASE_IN:
      easedT = t * t * t;
      break;
    case Effect_EasingFunction.EASE_OUT:
      easedT = 1 - Math.pow(1 - t, 3);
      break;
    case Effect_EasingFunction.EASE_IN_OUT:
      easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      break;
    case Effect_EasingFunction.SINE:
      easedT = -(Math.cos(Math.PI * t) - 1) / 2;
      break;
    case Effect_EasingFunction.LINEAR: // Fall-through
    default:
      easedT = t;
  }

  context.output.interpolate(start, end, easedT);
}
