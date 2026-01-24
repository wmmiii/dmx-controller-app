import { Duration } from '@dmx-controller/proto/duration_pb';
import { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from './Duration.module.scss';
import { NumberInput, ToggleInput } from './Input';

interface DurationInputProps {
  duration: Duration;
  className?: string;
}

export function DurationInput({ duration, className }: DurationInputProps) {
  const { save } = useContext(ProjectContext);

  const classes = [styles.container];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      <ToggleInput
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
            type="float"
            value={duration.amount.value / 1000}
            onChange={(sec) => {
              duration.amount = {
                case: 'ms',
                value: Math.floor(sec * 1000),
              };
            }}
            onFinalize={(sec) => save(`Set duration to ${sec} seconds.`)}
            min={0}
            max={120}
          />
        ) : (
          <NumberInput
            type="float"
            value={duration.amount!.value!}
            onChange={(beat) => {
              duration.amount = {
                case: 'beat',
                value: beat,
              };
            }}
            onFinalize={(beat) => save(`Set duration to ${beat} beats.`)}
            min={0}
            max={512}
          />
        )}
      </span>
    </div>
  );
}
