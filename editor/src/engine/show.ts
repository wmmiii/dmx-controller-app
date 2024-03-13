import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect, Effect_StaticEffect } from "@dmx-controller/proto/effect_pb";
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
      const device = getDevice(track.output, project, universe);
      if (!device) {
        continue;
      }

      for (const layer of track.layers) {
        const effect = layer.effects.find((e) => e.startMs <= t && e.endMs > t);
        if (effect) {
          // TODO: Calculate beat and pass it in.
          applyEffect(t, effect, device);
        }
      }
    }
  }

  return universe;
}

function applyEffect(t: number, effect: Effect, device: WritableDevice): void {
  const e = effect.effect.value;
  switch (effect.effect.case) {
    case 'staticEffect':
      const state = (e as Effect_StaticEffect).state;
      const color = state.color.value;
      switch (state.color.case) {
        case 'rgb':
          device.setRGB(color.red, color.green, color.blue);
          break;
        case 'rgbw':
          device.setRGBW(color.red, color.green, color.blue, color.white);
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
      break;
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
