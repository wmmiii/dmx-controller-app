import {
  Effect_RampEffect,
  Effect_RampEffect_EasingFunction,
} from "@dmx-controller/proto/effect_pb";
import { RenderContext } from "./universe";
import { applyState } from "./effect";
import { interpolateUniverses } from "./utils";

export function rampEffect(
  context: RenderContext,
  effect: Effect_RampEffect,
  t: number,
): void {
  const start = [...context.universe];
  const end = [...context.universe];

  if (effect.stateStart == null) {
    throw new Error("Tried to render ramp effect without start state!");
  }
  const startContext = Object.assign({}, context, { universe: start });
  applyState(effect.stateStart, startContext);

  if (effect.stateEnd == null) {
    throw new Error("Tried to render ramp effect without end state!");
  }
  const endContext = Object.assign({}, context, { universe: end });
  applyState(effect.stateEnd, endContext);

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

  interpolateUniverses(
    context.universe,
    easedT,
    start,
    end,
    context.nonInterpolatedIndices,
  );
}
