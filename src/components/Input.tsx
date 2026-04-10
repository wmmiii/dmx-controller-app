import {
  JSX,
  createRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { DRAG_DISTANCE_PX_SQ, LONG_PRESS_MS } from '../util/browserUtils';
import styles from './Input.module.css';

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

  return (
    <input
      ref={inputRef}
      className={styles.input}
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
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!edit) {
      setDraft(value);
    }
  }, [value, edit]);

  useEffect(() => {
    if (edit && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [edit]);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEdit(true);
  }, [value]);

  const commit = useCallback(() => {
    if (draft !== value) {
      onChange(draft);
    }
    setEdit(false);
  }, [draft, value, onChange]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEdit(false);
  }, [value]);

  if (edit) {
    return (
      <input
        ref={inputRef}
        className={styles.editableInput}
        value={draft}
        size={Math.max(draft.length, 1)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.preventDefault();
          } else if (e.key === 'Escape') {
            cancel();
            e.preventDefault();
          }
          e.stopPropagation();
        }}
      />
    );
  } else {
    return (
      <span
        className={styles.editableText}
        onDoubleClick={startEdit}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
          longPressTimer.current = setTimeout(startEdit, LONG_PRESS_MS);
        }}
        onTouchEnd={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          touchStart.current = null;
        }}
        onTouchMove={(e) => {
          if (longPressTimer.current && touchStart.current) {
            const touch = e.touches[0];
            const dist =
              Math.pow(touch.clientX - touchStart.current.x, 2) +
              Math.pow(touch.clientY - touchStart.current.y, 2);
            if (dist > DRAG_DISTANCE_PX_SQ) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
              touchStart.current = null;
            }
          }
        }}
      >
        {value}
      </span>
    );
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
  onFinalize?: (value: number) => void;
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
  onFinalize,
  min,
  max,
}: NumberInputProps): JSX.Element {
  const { update } = useContext(ProjectContext);
  const inputRef = createRef<HTMLInputElement>();
  const [input, setInput] = useState(String(value));

  const step = useMemo(() => (max > 1 ? 1 : 1 / 16), [max]);

  // Sync internal state when value prop changes externally
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
    [type],
  );

  const onChangeImpl = (newInput: string) => {
    setInput(newInput);

    const parsed = parseValue(newInput);
    // Only fire onChange if value is valid and within range
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
      update();
    }
  };

  // Check if current input is valid
  const parsed = parseValue(input);
  const isValid = !isNaN(parsed) && parsed >= min && parsed <= max;

  const classes = [styles.input, styles.numberInput];
  if (!isValid) {
    classes.push(styles.parseError);
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
            inputRef.current?.blur();
            break;
          case 'ArrowUp':
            const upValue = String(parseValue(input) + step);
            onChangeImpl(upValue);
            update();
            break;
          case 'ArrowDown':
            const downValue = String(parseValue(input) - step);
            onChangeImpl(downValue);
            update();
            break;
        }
      }}
      value={input}
      onInput={(e) => onChangeImpl((e.target as HTMLInputElement).value)}
      onBlur={() => {
        if (onFinalize) {
          const inputValue = parseValue(input);
          onFinalize(isNaN(inputValue) ? value : inputValue);
        }
      }}
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
