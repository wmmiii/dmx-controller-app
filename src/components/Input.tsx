import {
  JSX,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import styles from './Input.module.scss';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps): JSX.Element {
  const [input, setInput] = useState(String(value));
  const inputRef = createRef<HTMLInputElement>();

  useEffect(() => setInput(String(value)), [value]);

  const flushValue = useCallback(() => {
    if (input !== value) {
      onChange(input);
    }
  }, [input]);

  const classes = [styles.input];
  if (input != value) {
    classes.push(styles.modified);
  }

  return (
    <input
      ref={inputRef}
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
      onBlur={flushValue}
    />
  );
}

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
}

export function EditableText({ value, onChange }: EditableTextProps) {
  const [edit, setEdit] = useState(false);

  if (edit) {
    return (
      <TextInput
        value={value}
        onChange={(value) => {
          onChange(value);
          setEdit(false);
        }}
      />
    );
  } else {
    return <span onDoubleClick={() => setEdit(true)}>{value}</span>;
  }
}

export type NumberInputType = 'float' | 'integer';

interface NumberInputProps {
  className?: string;
  title?: string;
  disabled?: boolean;
  type?: NumberInputType;
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
  const inputRef = createRef<HTMLInputElement>();

  const step = useMemo(() => (max > 1 ? 1 : 1 / 16), [max]);

  useEffect(() => setInput(String(value)), [value]);

  const parseValue = useCallback(
    (input: string) => {
      try {
        if (type === 'float') {
          return parseFloat(input);
        } else {
          return parseInt(input);
        }
      } catch (e) {
        return NaN;
      }
    },
    [type, min, max],
  );

  const flushValue = useCallback(() => {
    const parsed = Math.max(Math.min(parseValue(input), max), min);
    if (!isNaN(parsed)) {
      if (parsed != value) {
        onChange(parsed);
        setInput(String(parsed));
      }
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
      ref={inputRef}
      className={classes.join(' ')}
      title={title}
      disabled={disabled}
      onKeyDown={(e) => {
        switch (e.code) {
          case 'Enter':
            inputRef.current?.blur();
            break;
          case 'Escape':
            setInput(String(value));
            inputRef.current?.blur();
            break;
          case 'ArrowUp':
            if (parsed != null) {
              setInput(String(parsed + step));
            }
            break;
          case 'ArrowDown':
            if (parsed != null) {
              setInput(String(parsed - step));
            }
            break;
        }
      }}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onBlur={flushValue}
    />
  );
}

interface ToggleInputProps {
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

export function ToggleInput({
  className,
  title,
  disabled,
  value,
  labels,
  onChange,
}: ToggleInputProps): JSX.Element {
  const toggle = useCallback(() => {
    if (!disabled) {
      onChange(!value);
    }
  }, [disabled, onChange, value]);

  const classes = [styles.toggleInput];
  if (value) {
    classes.push(styles.enabled);
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')} title={title} onClick={toggle}>
      {labels && (
        <label
          onClick={(ev) => {
            if (!disabled) {
              onChange(false);
            }
            ev.stopPropagation();
          }}
        >
          {labels.left}
        </label>
      )}
      <div className={styles.toggleSlide}>
        <div className={styles.toggleSwitch}></div>
      </div>
      {labels && (
        <label
          onClick={(ev) => {
            if (!disabled) {
              onChange(true);
            }
            ev.stopPropagation();
          }}
        >
          {labels.right}
        </label>
      )}
    </div>
  );
}
