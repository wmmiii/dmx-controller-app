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
  return (
    <NumberInput
      className={className}
      title={title}
      mode={max === '255' ? 'dmx' : undefined}
      value={value}
      onChange={onChange}
      onFinalize={onFinalize}
    />
  );
}
