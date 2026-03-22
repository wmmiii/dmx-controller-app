import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { Scene_Tile } from '@dmx-controller/proto/scene_pb';

export function tileActiveAmount(
  tile: Scene_Tile,
  beat: BeatMetadata | undefined,
  t: bigint,
): number {
  if (tile.transition.case === 'startFadeInMs') {
    if (tile.timingDetails.case == 'oneShot') {
      const duration = tile.timingDetails.value.duration?.amount;
      let ms: number;
      switch (duration?.case) {
        case 'ms':
          ms = duration.value;
          break;
        case 'beat':
          ms = duration.value * (beat?.lengthMs ?? 0);
          break;
        default:
          ms = 0;
      }
      return t < tile.transition.value + BigInt(ms) ? 1 : 0;
    } else {
      return 1;
    }
  } else if (tile.transition.case === 'absoluteStrength') {
    return tile.transition.value;
  }
  return 0;
}
