import { FixtureState, FixtureSequenceMapping } from "@dmx-controller/proto/effect_pb";
import { RenderContext, getDevice } from "./universe";

export function isFixtureState(effect: FixtureState | FixtureSequenceMapping): effect is FixtureState {
  return !('fixtureSequenceId' in effect);
}

export function applyState(state: FixtureState, context: RenderContext): void {
  const device = getDevice(context);
  if (device == null) {
    return;
  }

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

  if (state.zoom != null) {
    device.setZoom(state.zoom);
  }

  for (const channel of state.channels) {
    device.setChannel(channel.index, channel.value);
  }
}
