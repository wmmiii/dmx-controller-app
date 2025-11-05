import { create } from '@bufbuild/protobuf';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { createRef, JSX, useContext, useEffect, useMemo } from 'react';

import { BeatContext } from '../contexts/BeatContext';
import { ShortcutContext } from '../contexts/ShortcutContext';

import { BiPulse } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
import { listenToTick } from '../util/time';
import { ControllerConnection } from './ControllerConnection';
import { NumberInput } from './Input';
import styles from './LiveBeat.module.scss';

interface LiveBeatProps {
  className?: string;
}

export function LiveBeat({ className }: LiveBeatProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { setBeat, addBeatSample, sampling } = useContext(BeatContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const indicatorRef = createRef<HTMLDivElement>();

  useEffect(() => {
    return listenToTick((t) => {
      if (!indicatorRef.current) {
        return;
      }
      const amount =
        1 -
        (Number(t - project.liveBeat!.offsetMs) % project.liveBeat!.lengthMs) /
          project.liveBeat!.lengthMs;
      indicatorRef.current.style.opacity = String(amount);
    });
  }, [indicatorRef, project]);

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

  const beatMatchAction = useMemo(
    () =>
      create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      }),
    [],
  );

  const firstBeatAction = useMemo(
    () =>
      create(ControllerMapping_ActionSchema, {
        action: {
          case: 'firstBeat',
          value: {},
        },
      }),
    [],
  );

  const classes = [styles.liveBeat];
  if (className) {
    classes.push(className);
  }

  const indicatorClasses = [styles.beatIndicator];
  if (sampling) {
    indicatorClasses.push(styles.sampling);
  }

  return (
    <div className={classes.join(' ')}>
      <div ref={indicatorRef} className={indicatorClasses.join(' ')}>
        <BiPulse size={24} />
      </div>
      <NumberInput
        type="integer"
        min={0}
        max={300}
        value={Math.floor(60_000 / (project.liveBeat!.lengthMs || NaN))}
        onChange={(v) => setBeat(60_000 / v)}
      />
      <ControllerConnection
        title="Tap to learn"
        iconOnly={false}
        action={beatMatchAction}
        requiredType="button"
      />
      <ControllerConnection
        title="Set first beat"
        iconOnly={false}
        action={firstBeatAction}
        requiredType="button"
      />
    </div>
  );
}
