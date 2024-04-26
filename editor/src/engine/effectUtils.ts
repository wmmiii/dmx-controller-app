import { FixtureState, SequenceMapping } from "@dmx-controller/proto/effect_pb";
import { WritableDevice } from "./fixture";

export function isFixtureState(effect: FixtureState | SequenceMapping): effect is FixtureState {
  return !('sequenceId' in effect);
}

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
