import { WritableDevice } from './writableDevice';

export function getWledWritableDevice(segmentId: number): WritableDevice {
  return {
    setColor: (output, red, green, blue) => {
      if (output.type === 'wled') {
        output.segments[segmentId].primaryColor = {
          red: red,
          green: green,
          blue: blue,
        };
      }
    },
    setAngle: () => {},
    setAmount: (output, type, amount) => {
      if (output.type === 'wled') {
        switch (type) {
          case 'dimmer':
            output.segments[segmentId].brightness = amount;
            break;
          case 'speed':
            output.segments[segmentId].speed = amount;
            break;
        }
      }
    },
    setDmxChannel: () => {},
    setWledEffect: (output, effectId) => {
      if (output.type === 'wled') {
        output.segments[segmentId].effect = effectId;
      }
    },
    setWledPalette: (output, paletteId) => {
      if (output.type === 'wled') {
        output.segments[segmentId].palette = paletteId;
      }
    },
  };
}
