import { FixtureState } from "@dmx-controller/proto/effect_pb";
import { DmxUniverse, WritableDevice, getPhysicalWritableDevice, getPhysicalWritableDeviceFromGroup } from "./fixture";
import { Show_LightTrack } from "@dmx-controller/proto/show_pb";
import { Project } from "@dmx-controller/proto/project_pb";

export function applyState(state: FixtureState, device: WritableDevice): void {
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

export function getDevice(
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