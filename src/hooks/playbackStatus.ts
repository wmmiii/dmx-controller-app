import { useCallback, useSyncExternalStore } from 'react';

import {
  PlaybackStatus,
  getPlaybackStatus,
  subscribeToPlayback,
} from '../audio/audioTrackRegistry';

export function usePlaybackStatus(trackId: bigint): PlaybackStatus {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToPlayback(trackId, onStoreChange),
    [trackId],
  );
  return useSyncExternalStore(subscribe, () => getPlaybackStatus(trackId));
}
