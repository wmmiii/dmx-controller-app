import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, Effect_RampEffect, Effect_StaticEffect, FixtureState } from "@dmx-controller/proto/effect_pb";
import { Project } from "@dmx-controller/proto/project_pb";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";

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

    for (const track of show.lightTracks) {
      for (const layer of track.layers) {
        const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
        if (effect) {
          // TODO: Calculate beat and pass it in.
          applyEffect(t, effect, track.output, project, universe);
        }
      }
    }
  }

  return universe;
}

function applyEffect(
  t: number,
  effect: Effect,
  output: Show_LightTrack['output'],
  project: Project,
  universe: DmxUniverse): void {
  const e = effect.effect.value;
  switch (effect.effect.case) {
    case 'staticEffect':
      const device = getDevice(output, project, universe);
      applyState((e as Effect_StaticEffect).state, device);
      break;
    case 'rampEffect':
      rampEffect(
        t,
        effect.effect.value,
        effect.startMs,
        effect.endMs,
        output,
        project,
        universe);
      break;
  }
}

function applyState(state: FixtureState, device: WritableDevice): void {
  const color = state.color.value;
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
  globalT: number,
  effect: Effect_RampEffect,
  startMs: number,
  endMs: number,
  output: Show_LightTrack['output'],
  project: Project,
  universe: DmxUniverse): void {
  // TODO: Support different time mappings.
  const t = Math.min(Math.max((globalT - startMs) / (endMs - startMs), 0), 1);

  const start = new Uint8Array(universe);
  const end = new Uint8Array(universe);

  applyState(effect.start, getDevice(output, project, start));
  applyState(effect.end, getDevice(output, project, end));

  for (let i = 0; i < universe.length; ++i) {
    // TODO: Support different easing functions.
    universe[i] = Math.floor(start[i] * (1 - t) + end[i] * t);
  }
}
