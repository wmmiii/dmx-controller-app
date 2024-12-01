import { FixtureState } from "@dmx-controller/proto/effect_pb";
import { RenderContext } from "./universe";

export function applyState(state: FixtureState, context: RenderContext): void {
  const device = context.output;
  if (state == null || device == null) {
    return;
  }

  const universe = context.universe;
  switch (state.color.case) {
    case 'rgb':
      {
        const color = state.color.value;
        device.setColor(universe, color.red, color.green, color.blue);
      }
      break;
    case 'rgbw':
      {
        const color = state.color.value;
        device.setColor(universe, color.red, color.green, color.blue, color.white);
      }
      break;
  }

  if (state.pan != null) {
    device.setAngle(universe, 'pan', state.pan);
  }

  if (state.tilt != null) {
    device.setAngle(universe, 'tilt', state.tilt);
  }

  if (state.brightness != null) {
    device.setAmount(universe, 'brightness', state.brightness);
  }

  if (state.strobe != null) {
    device.setAmount(universe, 'strobe', state.strobe);
  }

  if (state.width != null) {
    device.setAmount(universe, 'width', state.width);
  }

  if (state.height != null) {
    device.setAmount(universe, 'height', state.height);
  }

  if (state.zoom != null) {
    device.setAmount(universe, 'zoom', state.zoom);
  }

  for (const channel of state.channels) {
    device.setChannel(universe, channel.index, channel.value);
  }
}
