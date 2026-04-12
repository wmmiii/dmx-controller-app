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

export type NumberInputType = 'float' | 'integer';

type NumberInputBaseProps = {
  className?: string;
  title?: string;
  disabled?: boolean;
  value: number;
  onChange: (value: number) => void;
  onFinalize?: (value: number) => void;
};

// When normalized is true, the value is always in the 0–1 range internally.
// The display unit (and min/max) are derived from the project's NumberInputMode.
type NormalizedNumberInputProps = NumberInputBaseProps & {
  normalized: true;
};

// When normalized is absent/false, min, max, and type must be supplied explicitly.
type RawNumberInputProps = NumberInputBaseProps & {
  normalized?: false;
  type?: NumberInputType;
  min: number;
  max: number;
};

export type NumberInputProps = NormalizedNumberInputProps | RawNumberInputProps;

type DisplayConfig = {
  min: number;
  max: number;
  effectiveType: NumberInputType | undefined;
  // Multiplier: internal → display (e.g. 255 for DMX, 100 for %)
  scale: number;
  // Whether to round the internal→display conversion (DMX integers)
  rounded: boolean;
};

function getDisplayConfig(
  props: NumberInputProps,
  mode: NumberInputMode,
): DisplayConfig {
  if (props.normalized) {
    switch (mode) {
      case NumberInputMode.DMX:
        return {
          min: 0,
          max: 255,
          effectiveType: 'integer',
          scale: 255,
          rounded: true,
        };
      case NumberInputMode.PERCENTAGE:
        return {
          min: 0,
          max: 100,
          effectiveType: 'float',
          scale: 100,
          rounded: false,
        };
      default: // NORMALIZED
        return {
          min: 0,
          max: 1,
          effectiveType: 'float',
          scale: 1,
          rounded: false,
        };
    }
  }
  return {
    min: props.min,
    max: props.max,
    effectiveType: props.type,
    scale: 1,
    rounded: false,
  };
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const { update, numberInputMode } = useContext(ProjectContext);
  const { className, title, disabled, value, onChange, onFinalize } = props;

  // Extract raw-mode props for use in useMemo deps (undefined when normalized)
  const minProp = props.normalized ? undefined : props.min;
  const maxProp = props.normalized ? undefined : props.max;
  const typeProp = props.normalized ? undefined : props.type;

  const { min, max, effectiveType, scale, rounded } = useMemo(
    () => getDisplayConfig(props, numberInputMode),
    [props.normalized, numberInputMode, minProp, maxProp, typeProp],
  );

  const inputRef = createRef<HTMLInputElement>();

  const toDisplay = (v: number) =>
    rounded ? Math.round(v * scale) : v * scale;

  const [input, setInput] = useState(String(toDisplay(value)));

  const step = useMemo(() => (max > 1 ? 1 : 1 / 16), [max]);

  // Re-sync display string when the external value or display config changes.
  // toDisplay is a closure over scale/rounded; those are the real deps.
  useEffect(() => setInput(String(toDisplay(value))), [value, scale, rounded]);

  const parseValue = useCallback(
    (raw: string) => {
      try {
        if (effectiveType === 'float') {
          return parseFloat(raw);
        } else {
          return parseInt(raw);
        }
      } catch (e) {
        return NaN;
      }
    },
    [effectiveType],
  );

  const onChangeImpl = (newInput: string) => {
    setInput(newInput);

    const parsed = parseValue(newInput);
    // Only fire onChange if value is valid and within the display range
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed / scale);
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

  const indicator =
    props.normalized && numberInputMode === NumberInputMode.DMX
      ? '#'
      : props.normalized && numberInputMode === NumberInputMode.PERCENTAGE
        ? '%'
        : null;

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
