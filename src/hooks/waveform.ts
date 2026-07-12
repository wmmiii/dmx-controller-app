import { Track } from '@dmx-controller/proto/audio_pb';
import { useQuery } from '@tanstack/react-query';

import { getWaveform } from '../audio/audioTrackRegistry';

export function useWaveform(track: Track | undefined) {
  return useQuery({
    queryKey: ['waveform', track?.digest],
    queryFn: () => getWaveform(track!.digest),
    enabled: track != null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
