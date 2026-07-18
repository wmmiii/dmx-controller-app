import { create } from '@bufbuild/protobuf';
import {
  InputBindingSchema,
  InputType,
} from '@dmx-controller/proto/controller_pb';
import { JSX, useContext, useEffect, useMemo, useRef } from 'react';
import { BiPulse } from 'react-icons/bi';

import { BeatContext } from '../contexts/BeatContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { listenToTick } from '../util/time';
import { getBeatTSync } from '../wasm/engine';

import clsx from 'clsx';
import { ControllerConnection } from './ControllerConnection';
import { NumberInput } from './Input';
import styles from './LiveBeat.module.css';

interface LiveBeatProps {
  className?: string;
}

export function LiveBeat({ className }: LiveBeatProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { setBeat, addBeatSample, sampling } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return listenToTick(() => {
      const beatT = getBeatTSync(project);
      if (!indicatorRef.current || beatT === null) {
        return;
      }
      indicatorRef.current.style.opacity = String(1 - (beatT % 1));
    });
  }, [indicatorRef, project]);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: {
            key: 'Space',
          },
          action: () => addBeatSample(),
          description: 'Sample beat.',
        },
      ]),
    [addBeatSample, setShortcuts],
  );

  const beatMatchAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      }),
    [],
  );

  const setTempoAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'setTempo',
          value: {},
        },
      }),
    [],
  );

  const firstBeatAction = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'firstBeat',
          value: {},
        },
      }),
    [],
  );

  return (
    <div className={clsx(styles.liveBeat, className)}>
      <div
        ref={indicatorRef}
        className={clsx(styles.beatIndicator, { [styles.sampling]: sampling })}
      >
        <BiPulse size={24} />
      </div>

      <NumberInput
        mode="bpm"
        value={Math.floor(60_000 / (project.liveBeat!.lengthMs || NaN))}
        onChange={(v) => setBeat(60_000 / v)}
      />

      <ControllerConnection
        title="Set BPM"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={setTempoAction}
        requiredType="slider"
      />
      <ControllerConnection
        title="Set first beat"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={firstBeatAction}
        requiredType="button"
      />
      <ControllerConnection
        title="Tap to learn"
        iconOnly={false}
        context={{ type: 'live_page' }}
        action={beatMatchAction}
        requiredType="button"
      />
    </div>
  );
}
