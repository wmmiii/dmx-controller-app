import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { Scene_Tile } from '@dmx-controller/proto/scene_pb';

export function getTileDurationMs(tile: Scene_Tile, beat: BeatMetadata) {
  switch (tile.duration.case) {
    case 'durationBeat':
      if (tile.description.case === 'sequence') {
        return tile.description.value.nativeBeats * beat.lengthMs;
      } else {
        return beat.lengthMs;
      }
    case 'durationMs':
      return tile.duration.value;
    default:
      return beat.lengthMs;
  }
}

export function tileActiveAmount(
  tile: Scene_Tile,
  beat: BeatMetadata,
  t: bigint,
): number {
  if (tile.transition.case === 'startFadeInMs') {
    if (tile.oneShot) {
      const duration = getTileDurationMs(tile, beat);
      return t < tile.transition.value + BigInt(Math.floor(duration)) ? 1 : 0;
    } else {
      return 1;
    }
  } else if (tile.transition.case === 'absoluteStrength') {
    return tile.transition.value;
  }
  return 0;
}

export function toggleTile(tile: Scene_Tile, beat: BeatMetadata) {
  const enabled =
    tile.oneShot ||
    tile.transition.case === 'startFadeOutMs' ||
    (tile.transition.case === 'absoluteStrength' &&
      tile.transition.value < 0.1);

  const t = BigInt(new Date().getTime());
  if (
    tile.transition.case === undefined ||
    tile.transition.case === 'absoluteStrength'
  ) {
    tile.transition = {
      case: 'startFadeOutMs',
      value: 0n,
    };
  }

  // One shot tiles should always restart now.
  if (enabled && tile.oneShot) {
    tile.transition = {
      case: 'startFadeInMs',
      value: t,
    };
    return [true, enabled];
  }

  const fadeInMs =
    tile.fadeInDuration.case === 'fadeInBeat'
      ? (tile.fadeInDuration.value || 0) * beat.lengthMs
      : tile.fadeInDuration.value || 0;

  const fadeOutMs =
    tile.fadeOutDuration.case === 'fadeOutBeat'
      ? (tile.fadeOutDuration.value || 0) * beat.lengthMs
      : tile.fadeOutDuration.value || 0;

  if (!enabled && tile.transition.case === 'startFadeInMs') {
    // Calculate fade in amount.
    const since = Number(t - tile.transition.value);
    const amount = since === 0 ? 0 : Math.min(1, since / fadeInMs);

    // Set fade out such that effect is contiguous.
    tile.transition = {
      case: 'startFadeOutMs',
      value: t - BigInt(Math.floor((1 - amount) * fadeOutMs)),
    };
    return [true, enabled];
  } else if (enabled && tile.transition.case === 'startFadeOutMs') {
    // Calculate fade out amount.
    const since = Number(t - tile.transition.value);
    const amount = since === 0 ? 0 : Math.max(0, 1 - since / fadeOutMs);

    // Set fade in such that effect is contiguous.
    tile.transition = {
      case: 'startFadeInMs',
      value: t - BigInt(Math.floor(amount * fadeInMs)),
    };
    return [true, enabled];
  } else {
    return [false, enabled];
  }
}
