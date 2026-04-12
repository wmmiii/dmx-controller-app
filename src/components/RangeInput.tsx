import { JSX } from 'react';

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
  if (max === '1') {
    return (
      <NumberInput
        className={className}
        title={title}
        normalized
        value={value}
        onChange={onChange}
        onFinalize={onFinalize}
      />
    );
  }
  return (
    <NumberInput
      className={className}
      title={title}
      type="integer"
      min={0}
      max={255}
      value={value}
      onChange={onChange}
      onFinalize={onFinalize}
    />
  );
}
