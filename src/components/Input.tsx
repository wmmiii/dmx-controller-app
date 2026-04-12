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

import { NumberInputMode } from '@dmx-controller/proto/settings_pb';
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

// The mode controls how the value is displayed and whether the system
// NumberInputMode setting applies:
//
//   undefined  — value is 0-1 internally; display unit follows the project
//                NumberInputMode setting (NORMALIZED / DMX / PERCENTAGE).
//   'normalized' — value is 0-1; always display as 0-1 regardless of setting.
//   'dmx'        — value is already in 0-255 space; always display as 0-255.
//   'percent'    — value is already in 0-100 space; always display as 0-100.
//   'degree'     — value is in degrees; unconstrained, shows '°' suffix.
//   'beat'       — value is a beat count; unconstrained, shows ♩ suffix.
//   'bpm'        — unconstrained pass-through (beats per minute, durations,
//                  frame counts, and any other non-normalised quantity).
export type InputMode =
  | 'normalized'
  | 'dmx'
  | 'percent'
  | 'degree'
  | 'beat'
  | 'bpm';

export interface NumberInputProps {
  className?: string;
  title?: string;
  disabled?: boolean;
  mode?: InputMode;
  value: number;
  onChange: (value: number) => void;
  onFinalize?: (value: number) => void;
}

type DisplayConfig = {
  min: number | null; // null = no lower bound
  max: number | null; // null = no upper bound
  isInteger: boolean;
  scale: number; // internal × scale = display value
  indicator: string | null;
};

function getDisplayConfig(
  inputMode: InputMode | undefined,
  systemMode: NumberInputMode,
): DisplayConfig {
  if (inputMode !== undefined) {
    switch (inputMode) {
      case 'normalized':
        return { min: 0, max: 1, isInteger: false, scale: 1, indicator: null };
      case 'dmx':
        return {
          min: 0,
          max: 255,
          isInteger: true,
          scale: 1,
          indicator: '#',
        };
      case 'percent':
        return {
          min: 0,
          max: 100,
          isInteger: false,
          scale: 1,
          indicator: '%',
        };
      case 'degree':
        return {
          min: null,
          max: null,
          isInteger: false,
          scale: 1,
          indicator: '°',
        };
      case 'beat':
        return {
          min: null,
          max: null,
          isInteger: false,
          scale: 1,
          indicator: '♩',
        };
      case 'bpm':
        return {
          min: null,
          max: null,
          isInteger: false,
          scale: 1,
          indicator: null,
        };
    }
  }
  // mode undefined → value is 0-1, follow project-level NumberInputMode
  switch (systemMode) {
    case NumberInputMode.DMX:
      return { min: 0, max: 255, isInteger: true, scale: 255, indicator: '#' };
    case NumberInputMode.PERCENTAGE:
      return {
        min: 0,
        max: 100,
        isInteger: false,
        scale: 100,
        indicator: '%',
      };
    default: // NORMALIZED
      return { min: 0, max: 1, isInteger: false, scale: 1, indicator: null };
  }
}

export function NumberInput({
  className,
  title,
  disabled,
  mode,
  value,
  onChange,
  onFinalize,
}: NumberInputProps): JSX.Element {
  const { update, numberInputMode } = useContext(ProjectContext);

  const { min, max, isInteger, scale, indicator } = useMemo(
    () => getDisplayConfig(mode, numberInputMode),
    [mode, numberInputMode],
  );

  const inputRef = createRef<HTMLInputElement>();

  const toDisplay = (v: number) =>
    isInteger ? Math.round(v * scale) : v * scale;

  const [input, setInput] = useState(String(toDisplay(value)));

  // 1-unit steps for ranges > 1 or unconstrained; fine steps for 0-1
  const step = max === null ? 1 : max > 1 ? 1 : 1 / 16;

  // Re-sync display string when the external value or display config changes.
  // toDisplay is a closure over isInteger/scale; those are the real deps.
  useEffect(
    () => setInput(String(toDisplay(value))),
    [value, scale, isInteger],
  );

  const parseValue = useCallback(
    (raw: string): number => {
      try {
        return isInteger ? parseInt(raw) : parseFloat(raw);
      } catch {
        return NaN;
      }
    },
    [isInteger],
  );

  const onChangeImpl = (newInput: string) => {
    setInput(newInput);
    const parsed = parseValue(newInput);
    const inRange =
      (min === null || parsed >= min) && (max === null || parsed <= max);
    if (!isNaN(parsed) && inRange) {
      onChange(parsed / scale);
      update();
    }
  };

  const parsed = parseValue(input);
  const inRange =
    (min === null || parsed >= min) && (max === null || parsed <= max);
  const isValid = !isNaN(parsed) && inRange;

  const classes = [styles.input, styles.numberInput];
  if (!isValid) {
    classes.push(styles.parseError);
  }
  if (className) {
    classes.push(className);
  }

  const inputEl = (
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
          onFinalize(isNaN(inputValue) ? value : inputValue / scale);
        }
      }}
    />
  );

  if (indicator != null) {
    return (
      <span className={styles.numberInputWrapper}>
        {inputEl}
        <span className={styles.numberInputSuffix}>{indicator}</span>
      </span>
    );
  }
  return inputEl;
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
