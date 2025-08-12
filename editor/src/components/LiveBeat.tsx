import { create } from '@bufbuild/protobuf';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { JSX, useContext, useEffect, useMemo } from 'react';

import { BeatContext } from '../contexts/BeatContext';
import { ShortcutContext } from '../contexts/ShortcutContext';

import { ControllerConnection } from './ControllerConnection';
import { NumberInput } from './Input';
import styles from './LiveBeat.module.scss';

interface LiveBeatProps {
  className?: string;
}

export function LiveBeat({ className }: LiveBeatProps): JSX.Element {
  const {
    beat,
    setBeat,
    sampleQuality,
    addBeatSample,
    detectionStrategy,
    setDetectionStrategy,
  } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: {
            key: 'Space',
          },
          action: () => addBeatSample(new Date().getTime()),
          description: 'Sample beat.',
        },
      ]),
    [addBeatSample, setShortcuts],
  );

  const beatEmoji = useMemo(() => {
    switch (sampleQuality) {
      case 'excellent':
        return '🤩';
      case 'fair':
        return '🙂';
      case 'idle':
        return '😎';
      case 'not enough samples':
        return '😄';
      case 'poor':
        return '😵‍💫';
    }
  }, [sampleQuality]);

  const action = useMemo(
    () =>
      create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      }),
    [],
  );

  const classes = [styles.liveBeat];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {beatEmoji}&nbsp; &nbsp;BPM:{' '}
      <NumberInput
        type="integer"
        min={0}
        max={300}
        value={Math.floor(60_000 / (beat?.lengthMs || NaN))}
        onChange={(v) => setBeat(60_000 / v)}
      />
      &nbsp;
      <select
        value={detectionStrategy}
        onChange={(e) => setDetectionStrategy(e.target.value as any)}
      >
        <option value="manual">Manual</option>
        <option value="microphone">Microphone</option>
      </select>
      <ControllerConnection
        title="Beat Match"
        iconOnly={false}
        action={action}
        requiredType="button"
      />
    </div>
  );
}
