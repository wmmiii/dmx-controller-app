import { create } from '@bufbuild/protobuf';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { JSX, useContext, useEffect, useMemo, useState } from 'react';

import { BeatContext } from '../contexts/BeatContext';
import { ShortcutContext } from '../contexts/ShortcutContext';

import { BiPulse } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
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

  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let cont = true;
    (async () => {
      while (cont) {
        setAmount(
          ((new Date().getTime() - Number(project.liveBeat!.offsetMs)) %
            project.liveBeat!.lengthMs) /
            project.liveBeat!.lengthMs,
        );
        await new Promise((resolve) => setTimeout(() => resolve(null), 10));
      }
    })();

    return () => {
      cont = false;
    };
  }, [project, setAmount]);

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
      <div
        className={indicatorClasses.join(' ')}
        style={{ opacity: 1 - amount }}
      >
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
