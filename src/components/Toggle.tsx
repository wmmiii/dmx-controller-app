import { Switch } from '@base-ui/react/switch';
import clsx from 'clsx';
import { JSX } from 'react';
import styles from './Toggle.module.css';

interface ToggleProps {
  className?: string;
  title?: string;
  disabled?: boolean;
  value: boolean;
  labels?: {
    left: string;
    right: string;
  };
  onChange: (value: boolean) => void;
}

export function Toggle({
  className,
  title,
  disabled,
  value,
  labels,
  onChange,
}: ToggleProps): JSX.Element {
  return (
    <div className={clsx(styles.wrapper, className)} title={title}>
      {labels && (
        <label
          className={clsx(styles.label, styles.labelLeft, {
            [styles.active]: !value,
          })}
          onClick={() => {
            if (!disabled) {
              onChange(false);
            }
          }}
        >
          {labels.left}
        </label>
      )}
      <Switch.Root
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        className={styles.root}
      >
        <Switch.Thumb className={styles.thumb} />
      </Switch.Root>
      {labels && (
        <label
          className={clsx(styles.label, styles.labelRight, {
            [styles.active]: value,
          })}
          onClick={() => {
            if (!disabled) {
              onChange(true);
            }
          }}
        >
          {labels.right}
        </label>
      )}
    </div>
  );
}
