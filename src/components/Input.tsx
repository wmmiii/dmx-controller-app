import { NumberInputMode as NumberInputModeProto } from '@dmx-controller/proto/settings_pb';
import clsx from 'clsx';
import {
  JSX,
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

const DEBOUNCE_MS = 300;

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps): JSX.Element {
  const [input, setInput] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

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
  className?: string;
  value: string;
  onChange: (value: string) => void;
}

export function EditableText({
  className,
  value,
  onChange,
}: EditableTextProps) {
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
        className={clsx(className, styles.editableInput)}
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
        className={clsx(className, styles.editableText)}
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
  | 'db'
  | 'degree'
  | 'dmx'
  | 'dmx_channel'
  | 'float'
  | 'integer'
  | 'milliseconds'
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
  onFinalize: (value: number) => void;
  onChange?: (value: number) => void;
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
    case 'db':
      return {
        min: 0,
        max: 40,
        step: 1,
        integer: true,
        indicator: 'dB',
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
    case 'milliseconds':
      return {
        min: 0,
        max: 3_600_000,
        step: 1,
        integer: true,
        indicator: 'ms',
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
  const { numberInputMode } = useContext(ProjectContext);

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

  // Parse display string to internal value, returns NaN if not parsable or out of range
  const parseDisplay = useCallback(
    (s: string): number => {
      const v = integer ? parseInt(s) : parseFloat(s);
      if (isNaN(v) || v < min || v > max) {
        return NaN;
      }
      if (normalized) {
        return (v - min) / (max - min);
      }
      return v;
    },
    [integer, min, max, normalized],
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

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input, setInput] = useState(String(mapToDisplay(value)));

  // Re-sync display string when the external value or display config changes.
  useEffect(() => setInput(mapToDisplay(value)), [value, mapToDisplay]);

  // Clear out any pending timers on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const scheduleOnChange = useCallback(
    (internal: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(
        () => onChange?.(internal),
        DEBOUNCE_MS,
      );
    },
    [onChange],
  );

  const inputEl = (
    <input
      ref={inputRef}
      type="number"
      className={clsx(
        className,
        { [styles.parseError]: isNaN(parseDisplay(input)) },
        styles.numberInput,
        styles.input,
      )}
      title={title}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onKeyDown={(e) => {
        switch (e.code) {
          case 'Enter':
            inputRef.current?.blur();
            break;
          case 'Escape':
            setInput(mapToDisplay(value));
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
              debounceTimerRef.current = null;
            }
            inputRef.current?.blur();
            break;
        }
      }}
      value={input}
      onInput={(e) => {
        const newInput = (e.target as HTMLInputElement).value;
        setInput(newInput);
        const parsed = parseDisplay(newInput);
        if (!isNaN(parsed)) {
          scheduleOnChange(parsed);
        }
      }}
      onBlur={() => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }

        const parsed = parseDisplay(input);
        if (isNaN(parsed)) {
          setInput(mapToDisplay(value));
          onFinalize(value);
        } else {
          const clamped = clamp(parsed);
          setInput(mapToDisplay(clamped));
          onFinalize(clamped);
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
