import { Slider } from '@base-ui/react/slider';
import { useEffect, useState } from 'react';
import styles from './RangeSlider.module.css';

interface RangeSliderProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min: number;
  max: number;
  step?: number;
}

export function RangeSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
}: RangeSliderProps) {
  const [low, high] = value;
  const [draft, setDraft] = useState<[number, number]>([low, high]);

  useEffect(() => {
    setDraft([low, high]);
  }, [low, high]);

  return (
    <Slider.Root
      value={draft}
      onValueChange={(v) => setDraft(v as [number, number])}
      onValueCommitted={(v) => onChange(v as [number, number])}
      min={min}
      max={max}
      step={step}
      minStepsBetweenValues={1}
      className={styles.root}
    >
      <Slider.Control className={styles.control}>
        <Slider.Track className={styles.track}>
          <Slider.Indicator className={styles.indicator} />
          <Slider.Thumb className={styles.thumb} />
          <Slider.Thumb className={styles.thumb} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
