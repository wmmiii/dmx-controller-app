import { useCallback, useEffect, useMemo, useState } from "react";

import styles from './Input.module.scss';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps): JSX.Element {
  const [input, setInput] = useState(String(value));

  useEffect(() => setInput(String(value)), [value]);

  const flushValue = useCallback(() => onChange(input), [input]);

  const classes = [styles.input];
  if (input != value) {
    classes.push(styles.modified);
  }

  return (
    <input
      className={classes.join(' ')}
      onKeyDown={(e) => {
        switch (e.code) {
          case 'Enter':
            flushValue();
            break;
          case 'Escape':
            setInput(String(value));
            break;
        }
      }}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onBlur={flushValue} />
  )
}


interface NumberInputProps {
  className?: string;
  title?: string;
  disabled?: boolean;
  type?: 'float' | 'integer';
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

export function NumberInput({
  className,
  title,
  disabled,
  type,
  value,
  onChange,
  min,
  max,
}: NumberInputProps): JSX.Element {
  const [input, setInput] = useState(String(value));

  const step = useMemo(() => max > 1 ? 1 : 1 / 16, [max]);

  useEffect(() => setInput(String(value)), [value]);

  const parseValue = useCallback((input: string) => {
    try {
      if (type === 'float') {
        return parseFloat(input);
      } else {
        return parseInt(input);
      }
    } catch (e) {
      return NaN;
    }
  }, [type, min, max]);

  const flushValue = useCallback(() => {
    const parsed = Math.max(Math.min(parseValue(input), max), min);
    if (!isNaN(parsed)) {
      onChange(parsed);
      setInput(String(parsed));
    } else {
      setInput(String(value));
    }
  }, [parseValue, input, value]);

  const classes = [styles.input, styles.numberInput];
  const parsed = parseValue(input);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    classes.push(styles.parseError);
  } else if (parsed != value) {
    classes.push(styles.modified);
  }
  if (className) {
    classes.push(className);
  }

  return (
    <input
      className={classes.join(' ')}
      title={title}
      disabled={disabled}
      onKeyDown={(e) => {
        switch (e.code) {
          case 'Enter':
            flushValue();
            break;
          case 'Escape':
            setInput(String(value));
            break;
          case 'ArrowUp':
            if (parsed != null) {
              setInput(String(parsed + step));
            };
            break;
          case 'ArrowDown':
            if (parsed != null) {
              setInput(String(parsed - step));
            };
            break;
        }
      }}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onBlur={flushValue} />
  )
}
