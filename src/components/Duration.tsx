import { Duration } from '@dmx-controller/proto/duration_pb';
import { useContext } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import clsx from 'clsx';
import styles from './Duration.module.css';
import { NumberInput } from './Input';
import { Toggle } from './Toggle';

interface DurationInputProps {
  duration: Duration;
  className?: string;
}

export function DurationInput({ duration, className }: DurationInputProps) {
  const { save } = useContext(ProjectContext);

  return (
    <div className={clsx(styles.container, className)}>
      <Toggle
        title="Specify duration in beats or seconds."
        labels={{
          left: 'Beats',
          right: 'Seconds',
        }}
        value={duration.amount.case === 'ms'}
        onChange={(isMs) => {
          if (isMs && duration.amount.case !== 'ms') {
            duration.amount = {
              case: 'ms',
              value: Math.floor((duration.amount.value ?? 0) * 1000),
            };
            save('Set duration to seconds.');
          } else {
            duration.amount = {
              case: 'beat',
              value: (duration.amount.value ?? 0) / 1000,
            };
            save('Set duration to beats.');
          }
        }}
      />
      <span>
        {duration.amount.case === 'ms' ? (
          <NumberInput
            mode="seconds"
            value={duration.amount.value / 1000}
            onChange={(sec) => {
              duration.amount = {
                case: 'ms',
                value: Math.floor(sec * 1000),
              };
            }}
            onFinalize={(sec) => save(`Set duration to ${sec} seconds.`)}
          />
        ) : (
          <NumberInput
            mode="beat"
            value={duration.amount!.value!}
            onChange={(beat) => {
              duration.amount = {
                case: 'beat',
                value: beat,
              };
            }}
            onFinalize={(beat) => save(`Set duration to ${beat} beats.`)}
          />
        )}
      </span>
    </div>
  );
}
