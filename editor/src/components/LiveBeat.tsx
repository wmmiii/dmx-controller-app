import React, { useContext, useEffect, useMemo } from 'react';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { BeatContext } from '../contexts/BeatContext';


interface LiveBeatProps {
  className?: string;
}

export function LiveBeat({ className }: LiveBeatProps): JSX.Element {
  const { beat, sampleQuality, addBeatSample } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(() => setShortcuts([
    {
      shortcut: {
        key: 'Space',
      },
      action: () => addBeatSample(new Date().getTime()),
      description: 'Sample beat',
    },
  ]), [addBeatSample, setShortcuts]);

  const beatEmoji = useMemo(() => {
    switch (sampleQuality) {
      case 'excellent': return '🤩';
      case 'fair': return '🙂';
      case 'idle': return '😎';
      case 'not enough samples': return '😄';
      case 'poor': return '😵‍💫';
    }
  }, [sampleQuality]);

  return (
    <div className={className}>
      {beatEmoji}
      &nbsp;BPM: {Math.floor(60_000 / (beat?.lengthMs || NaN))}
    </div>
  );
}
