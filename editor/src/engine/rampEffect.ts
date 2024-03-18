import { ChannelTypes, DmxUniverse, WritableDevice } from "./fixture";
import { Effect_RampEffect, Effect_RampEffect_EasingFunction } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";
import { applyState, getDevice } from "./effectUtils";

export function rampEffect(
  effect: Effect_RampEffect,
  t: number,
  output: Show_LightTrack['output'],
  project: Project,
  universe: DmxUniverse): void {
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

  const before = new Uint8Array(universe);
  const start = new Uint8Array(universe);
  const end = new Uint8Array(universe);

  applyState(effect.start, getDevice(output, project, start));
  applyState(effect.end, getDevice(output, project, end));

  // First do a dumb interpolation of all the channels to set coarse values.
  for (let i = 0; i < universe.length; ++i) {
    universe[i] = Math.floor(start[i] * (1 - effectT) + end[i] * effectT);
  }

  const outputDevice = getDevice(output, project, universe);

  // Next fixup all the fine values.
  outputDevice.channelTypes.forEach((type, i) => {
    if (type.indexOf('-fine') >= 0) {
      const coarseType = type.substring(0, type.length - 5) as ChannelTypes;
      const coarseIndex = outputDevice.channelTypes.indexOf(coarseType);
      const coarseValue = start[coarseIndex] * (1 - effectT) +
        end[coarseIndex] * effectT;
      universe[i] = Math.floor(coarseValue * 255) % 255;
    }
  });
}
