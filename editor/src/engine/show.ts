import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Effect } from "@dmx-controller/proto/effect_pb";
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
    case 'channelEffect':
      device.setChannel(e.channel, e.value);
      break;
    case 'colorEffect':
      device.setRGB(e.r, e.g, e.b);
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
