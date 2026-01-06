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

export function toggleTile(tile: Scene_Tile, beat: BeatMetadata) {
  const t = BigInt(new Date().getTime());

  // One shot tiles should always restart now.
  if (tile.timingDetails.case === 'oneShot') {
    tile.transition = {
      case: 'startFadeInMs',
      value: t,
    };
    return [true, true];
  } else if (tile.timingDetails.case == undefined) {
    throw new Error('Tile without timing details!');
  }

  const setEnabled =
    tile.transition.case === 'startFadeOutMs' ||
    (tile.transition.case === 'absoluteStrength' &&
      tile.transition.value < 0.1);

  if (
    tile.transition.case === undefined ||
    tile.transition.case === 'absoluteStrength'
  ) {
    tile.transition = {
      case: 'startFadeOutMs',
      value: 0n,
    };
    return [true, false];
  }

  const duration = tile.timingDetails.value;

  const fadeInMs =
    duration.fadeIn?.amount.case === 'beat'
      ? duration.fadeIn.amount.value * beat.lengthMs
      : (duration.fadeIn?.amount.value ?? 0);

  const fadeOutMs =
    duration.fadeOut?.amount.case === 'beat'
      ? duration.fadeOut.amount.value * beat.lengthMs
      : (duration.fadeOut?.amount.value ?? 0);

  if (!setEnabled && tile.transition.case === 'startFadeInMs') {
    // Calculate fade in amount.
    const since = Number(t - tile.transition.value);
    const amount = since === 0 ? 0 : Math.min(1, since / fadeInMs);

    // Set fade out such that effect is contiguous.
    tile.transition = {
      case: 'startFadeOutMs',
      value: t - BigInt(Math.floor((1 - amount) * fadeOutMs)),
    };
    return [true, setEnabled];
  } else if (setEnabled && tile.transition.case === 'startFadeOutMs') {
    // Calculate fade out amount.
    const since = Number(t - tile.transition.value);
    const amount = since === 0 ? 0 : Math.max(0, 1 - since / fadeOutMs);

    // Set fade in such that effect is contiguous.
    tile.transition = {
      case: 'startFadeInMs',
      value: t - BigInt(Math.floor(amount * fadeInMs)),
    };
    return [true, setEnabled];
  } else {
    return [false, setEnabled];
  }
}
