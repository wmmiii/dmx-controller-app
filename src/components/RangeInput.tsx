import { JSX, useCallback } from 'react';

import { NumberInput } from './Input';

interface RangeInputProps {
  className?: string;
  title?: string;
  value: number;
  onChange: (value: number) => void;
  onFinalize?: (value: number) => void;
  max: '1' | '255';
}

export default function RangeInput({
  className,
  title,
  value,
  onChange,
  onFinalize,
  max,
}: RangeInputProps): JSX.Element {
  const set = useCallback(
    (value: number) => {
      if (max === '255') {
        onChange(Math.min(value));
      } else {
        onChange(value);
      }
    },
    [max],
  );

  return (
    <NumberInput
      className={className}
      title={title}
      type={max === '1' ? 'float' : 'integer'}
      value={value}
      min={0}
      max={parseInt(max)}
      onChange={set}
      onFinalize={onFinalize}
    />
  );
}
