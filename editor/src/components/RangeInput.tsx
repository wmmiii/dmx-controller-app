import React, { useCallback, useMemo } from "react";

interface RangeInputProps {
  className?: string;
  value: number;
  onChange: (value: number) => void;
  max: '1' | '255';
}

export default function RangeInput(
  { className, value, onChange, max }: RangeInputProps): JSX.Element {
  const set = useCallback((value: number) => {
    if (max === '255') {
      onChange(Math.min(value));
    } else {
      onChange(value);
    }
  }, [max]);

  const step = useMemo(() => {
    switch (max) {
      case "1":
        return 1 / 256;
      case "255":
        return 1;
    }
  }, [max]);

  return (
    <span className={className}>
      <input
        type="number"
        value={value}
        onChange={(e) => set(parseFloat(e.target.value))} />
      <input
        type="range"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(parseFloat(e.target.value))} />&nbsp;
    </span>
  );
}
