import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, Effect_RampEffect, Effect_RampEffect_EasingFunction, Effect_StaticEffect, EffectTiming, FixtureState } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";

interface RenderContext {
  t: number;
  output: Show_LightTrack['output'];
  project: Project;
  universe: DmxUniverse;
}

export function renderUniverse(t: number, project: Project):
  DmxUniverse {
  const universe = new Uint8Array(512);

  const show = project.show;

  if (show) {
    for (const defaultValues of show.defaultChannelValues) {
      const device = getDevice(defaultValues.output, project, universe);
      if (!device) {
        continue;
      }

      for (const channel of defaultValues.channels) {
        device.setChannel(channel.index, channel.value);
      }
    }


    const context: Partial<RenderContext> = {
      t: t,
      project: project,
      universe: universe,
    };
    const beat = project.assets?.audioFiles[show.audioTrack?.audioFileId]?.beatMetadata;
    let beatAmount: number = undefined;
    let beatIndex: number = undefined;
    if (beat) {
      beatAmount = ((t - beat.offsetMs) % beat.lengthMs) / beat.lengthMs;
      beatIndex = Math.floor((t - beat.offsetMs) / beat.lengthMs);
    }

    for (const track of show.lightTracks) {
      for (const layer of track.layers) {
        const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
        if (effect) {
          applyEffect(
            Object.assign({ output: track.output }, context) as RenderContext,
            effect,
            beatAmount,
            beatIndex);
        }
      }
    }
  }

  return universe;
}

function applyEffect(context: RenderContext, effect: Effect, beatAmount: number, beatIndex: number): void {
  // Calculate timing
  let t: number;
  switch (effect.timingMode) {
    case EffectTiming.ONE_SHOT:
      t = (context.t - effect.startMs) / (effect.endMs - effect.startMs);
      break;
    case EffectTiming.BEAT:
      t = beatAmount || 0;
      break;
    case EffectTiming.ABSOLUTE:
    default:
      t = context.t;
  }

  context.t = t;

  const e = effect.effect.value;
  switch (effect.effect.case) {
    case 'staticEffect':
      const device = getDevice(
        context.output,
        context.project,
        context.universe);
      applyState((e as Effect_StaticEffect).state, device);
      break;
    case 'rampEffect':
      rampEffect(context, e as Effect_RampEffect);
      break;
  }
}

function applyState(state: FixtureState, device: WritableDevice): void {
  switch (state.color.case) {
    case 'rgb':
      {
        const color = state.color.value;
        device.setRGB(color.red, color.green, color.blue);
      }
      break;
    case 'rgbw':
      {
        const color = state.color.value;
        device.setRGBW(color.red, color.green, color.blue, color.white);
      }
      break;
  }

  if (state.brightness != null) {
    device.setBrightness(state.brightness);
  }

  if (state.pan != null) {
    device.setPan(state.pan);
  }

  if (state.tilt != null) {
    device.setTilt(state.tilt);
  }

  for (const channel of state.channels) {
    device.setChannel(channel.index, channel.value);
  }
}

function getDevice(
  output: Show_LightTrack['output'],
  project: Project,
  universe: DmxUniverse): WritableDevice | undefined {

  switch (output.case) {
    case 'physicalFixtureId':
      return getPhysicalWritableDevice(
        project,
        output.value,
        universe);
    case 'physicalFixtureGroupId':
      return getPhysicalWritableDeviceFromGroup(
        project,
        output.value,
        universe);
    default:
      throw Error('Unknown device!');
  }
}

function rampEffect(
  {
    t,
    output,
    project,
    universe,
  }: RenderContext,
  effect: Effect_RampEffect): void {
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

  const start = new Uint8Array(universe);
  const end = new Uint8Array(universe);

  applyState(effect.start, getDevice(output, project, start));
  applyState(effect.end, getDevice(output, project, end));

  for (let i = 0; i < universe.length; ++i) {
    universe[i] = Math.floor(start[i] * (1 - effectT) + end[i] * effectT);
  }
}
