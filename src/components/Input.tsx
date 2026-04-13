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

import { NumberInputMode as NumberInputModeProto } from '@dmx-controller/proto/settings_pb';
import clsx from 'clsx';
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

// The mode controls how the value is displayed.
export type NumberInputMode =
  | 'beat'
  | 'bpm'
  | 'counting'
  | 'degree'
  | 'dmx'
  | 'dmx_channel'
  | 'float'
  | 'integer'
  | 'normalized'
  | 'percent'
  | 'seconds';

export interface NumberInputProps {
  className?: string;
  title?: string;
  disabled?: boolean;
  mode?: NumberInputMode;
  normalized?: boolean;
  value: number;
  onChange: (value: number) => void;
  onFinalize?: (value: number) => void;
}

function getNumberDisplayConfig(
  inputMode: NumberInputMode | undefined,
  systemMode: NumberInputModeProto,
) {
  if (!inputMode) {
    switch (systemMode) {
      case NumberInputModeProto.PERCENT:
        inputMode = 'percent';
        break;
      case NumberInputModeProto.DMX:
        inputMode = 'dmx';
        break;
      case NumberInputModeProto.NORMALIZED:
        inputMode = 'normalized';
        break;
    }
  }

  switch (inputMode) {
    case 'beat':
      return {
        min: 0,
        max: 128,
        step: 1,
        integer: false,
        indicator: '𝅗𝅥𝅗𝅥',
      };
    case 'bpm':
      return {
        min: 80,
        max: 207,
        step: 1,
        integer: true,
        indicator: '𝅗𝅥𝅗𝅥',
      };
    case 'counting':
      return {
        min: 0,
        max: 1024,
        step: 1,
        integer: true,
        indicator: '#',
      };
    case 'degree':
      return {
        min: -720,
        max: 720,
        step: 15,
        integer: false,
        indicator: '°',
      };
    case 'dmx':
      return {
        min: 0,
        max: 255,
        step: 16,
        integer: true,
        indicator: '@',
      };
    case 'dmx_channel':
      return {
        min: 1,
        max: 512,
        step: 1,
        integer: true,
        indicator: '@',
      };
    case 'float':
      return {
        min: -1024,
        max: 1024,
        step: 0.25,
        integer: false,
        indicator: '.',
      };
    case 'integer':
      return {
        min: -1024,
        max: 1024,
        step: 1,
        integer: true,
        indicator: '#',
      };
    case 'normalized':
      return {
        min: 0,
        max: 1,
        step: 0.125,
        integer: false,
        indicator: '.',
      };
    case 'percent':
      return {
        min: 0,
        max: 100,
        step: 10,
        integer: false,
        indicator: '%',
      };
    case 'seconds':
      return {
        min: 0,
        max: 300,
        step: 1,
        integer: false,
        indicator: '⏲',
      };
    default:
      throw Error(`Unrecognized number type: ${inputMode}`);
  }
}

export function NumberInput({
  className,
  title,
  disabled,
  mode,
  normalized: normalizedProp,
  value,
  onChange,
  onFinalize,
}: NumberInputProps): JSX.Element {
  const { update, numberInputMode } = useContext(ProjectContext);

  // If normalized is not explicitly provided, infer from mode:
  // - undefined mode means system default (percent/dmx/normalized) for 0-1 values
  // - explicit mode means values are already in the correct range
  const normalized = normalizedProp ?? mode === undefined;

  const { min, max, step, integer, indicator } = useMemo(
    () => getNumberDisplayConfig(mode, numberInputMode),
    [mode, numberInputMode],
  );

  const mapToDisplay = useCallback(
    (v: number) => {
      let mapped: number;
      if (normalized) {
        mapped = v * (max - min) + min;
      } else {
        mapped = v;
      }
      return String(integer ? Math.round(mapped) : mapped);
    },
    [normalized, max, min, integer],
  );

  // Parse display string to internal value (no range validation)
  const parseDisplay = useCallback(
    (s: string): number => {
      const v = integer ? parseInt(s) : parseFloat(s);
      if (isNaN(v)) {
        return NaN;
      }
      if (normalized) {
        return (v - min) / (max - min);
      }
      return v;
    },
    [integer, min, max, normalized],
  );

  // Check if display string is in valid range
  const isInRange = useCallback(
    (s: string): boolean => {
      const v = integer ? parseInt(s) : parseFloat(s);
      return !isNaN(v) && v >= min && v <= max;
    },
    [integer, min, max],
  );

  // Clamp internal value to valid range
  const clamp = useCallback(
    (v: number): number => {
      if (normalized) {
        return Math.max(0, Math.min(1, v));
      }
      return Math.max(min, Math.min(max, v));
    },
    [normalized, min, max],
  );

  const inputRef = createRef<HTMLInputElement>();

  const [input, setInput] = useState(String(mapToDisplay(value)));

  // Step by delta in display units, snapping to step grid to avoid floating point errors
  const stepBy = useCallback(
    (delta: number) => {
      const displayValue = integer ? parseInt(input) : parseFloat(input);
      if (isNaN(displayValue)) return;

      const snapped = Math.round((displayValue + delta) / step) * step;
      const clampedDisplay = Math.max(min, Math.min(max, snapped));
      const internal = normalized
        ? (clampedDisplay - min) / (max - min)
        : clampedDisplay;

      onChange(internal);
      setInput(String(integer ? Math.round(clampedDisplay) : clampedDisplay));
      update();
    },
    [input, integer, step, min, max, normalized, onChange, update],
  );

  // Re-sync display string when the external value or display config changes.
  useEffect(() => setInput(mapToDisplay(value)), [value, mapToDisplay]);

  const onChangeImpl = (newInput: string) => {
    setInput(newInput);
    if (isInRange(newInput)) {
      onChange(parseDisplay(newInput));
      update();
    }
  };

  const isValid = isInRange(input);

  const inputEl = (
    <input
      ref={inputRef}
      className={clsx(
        className,
        { [styles.parseError]: !isValid },
        styles.numberInput,
        styles.input,
      )}
      title={title}
      disabled={disabled}
      onKeyDown={(e) => {
        switch (e.code) {
          case 'Enter':
          case 'Escape':
            inputRef.current?.blur();
            break;
          case 'ArrowUp':
            stepBy(step);
            break;
          case 'ArrowDown':
            stepBy(-step);
            break;
        }
      }}
      value={input}
      onInput={(e) => onChangeImpl((e.target as HTMLInputElement).value)}
      onBlur={() => {
        const parsed = parseDisplay(input);
        if (isNaN(parsed)) {
          // Invalid input - revert to original value
          setInput(mapToDisplay(value));
          onFinalize?.(value);
        } else {
          // Valid number - clamp if out of range
          const clamped = clamp(parsed);
          setInput(mapToDisplay(clamped));
          onChange(clamped);
          onFinalize?.(clamped);
          update();
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
