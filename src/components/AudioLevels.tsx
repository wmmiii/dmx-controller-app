import clsx from 'clsx';
import { useCallback, useEffect, useRef } from 'react';
import { addAudioAnalysisListener } from '../system_interfaces/audio_input';
import styles from './AudioLevels.module.css';

const NUM_BANDS = 16;

interface AudioLevelsProps {
  className?: string;
  minRange?: number;
  maxRange?: number;
}

export function AudioLevels({
  className,
  minRange,
  maxRange,
}: AudioLevelsProps) {
  const renderRef = useRef<any>(null);
  const bandRefs = useRef<(HTMLDivElement | null)[]>(
    new Array(NUM_BANDS).fill(null),
  );

  const setRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      bandRefs.current[index] = el;
    },
    [],
  );

  useEffect(() => {
    return addAudioAnalysisListener((levels) => {
      cancelAnimationFrame(renderRef.current);
      renderRef.current = requestAnimationFrame(() => {
        for (let i = 0; i < NUM_BANDS; i++) {
          const ref = bandRefs.current[i];
          if (ref != null) {
            ref.style.height = levels.bands[i] * 100 + '%';
          }
        }
      });
    });
  });

  return (
    <div className={clsx(className, styles.container)}>
      {Array.from({ length: NUM_BANDS }, (_, i) => (
        <div
          key={i}
          ref={setRef(i)}
          className={clsx(styles.band, {
            [styles.dull]: i < (minRange ?? 0) || i > (maxRange ?? 16),
          })}
        ></div>
      ))}
    </div>
  );
}
