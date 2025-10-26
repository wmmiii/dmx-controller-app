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

import {
  Layer as LayerProto,
  TimecodedEffect,
} from '@dmx-controller/proto/effect_pb';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { ALL_CHANNELS } from '../engine/channel';
import { NumberInput } from './Input';
import { Layer } from './Layer';
import styles from './SequenceEditor.module.scss';
import { HorizontalSplitPane } from './SplitPane';
import { EffectDetails } from './TimecodeEffect';

// Good resolution, nice divisors (2^5 * 3^2 * 5^2.)
export const SEQUENCE_BEAT_RESOLUTION = 7200;

interface SequenceEditorProps {
  className?: string;
  sequenceId: bigint;
}

export function SequenceEditor({
  className,
  sequenceId,
}: SequenceEditorProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedEffect, setSelectedEffect] = useState<TimecodedEffect | null>(
    null,
  );
  const [copyEffect, setCopyEffect] = useState<TimecodedEffect | null>(null);
  const [beatSubdivisions, setBeatSubdivisions] = useState(4);

  const sequence = useMemo(
    () => project.sequences[sequenceId.toString()],
    [project, sequenceId],
  );

  if (!sequence) {
    throw new Error(`Could ont find sequence with ID ${sequenceId}!`);
  }

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Escape' },
          action: () => setSelectedEffect(null),
          description: 'Deselect the currently selected effect.',
        },
        {
          shortcut: { key: 'KeyC', modifiers: ['ctrl'] },
          action: () => setCopyEffect(selectedEffect),
          description: 'Copy currently selected effect to clipboard.',
        },
      ]),
    [setSelectedEffect, setCopyEffect, selectedEffect],
  );

  const msToPx = useCallback(
    (ms: number) => {
      if (!panelRef.current) {
        return 0;
      }
      const width = panelRef.current.getBoundingClientRect().width;
      return (ms * width) / SEQUENCE_BEAT_RESOLUTION;
    },
    [panelRef],
  );

  const pxToMs = useCallback(
    (px: number) => {
      if (!panelRef.current) {
        return 0;
      }
      const width = panelRef.current.getBoundingClientRect().width;
      return Math.floor(px / width) * SEQUENCE_BEAT_RESOLUTION;
    },
    [panelRef],
  );

  const snapToBeat = useCallback((t: number) => {
    if (!panelRef.current) {
      return t;
    }
    const width = panelRef.current.getBoundingClientRect().width;

    const beatSnapRangeMs = Math.floor(
      (10 * SEQUENCE_BEAT_RESOLUTION) / 10 / width,
    );

    const lengthMs =
      SEQUENCE_BEAT_RESOLUTION / sequence.nativeBeats / beatSubdivisions;
    const beatNumber = Math.round(t / lengthMs);
    const beatT = Math.floor(beatNumber * lengthMs);

    if (Math.abs(beatT - t) < beatSnapRangeMs) {
      return beatT;
    } else {
      return t;
    }
  }, []);

  const classes = [styles.SequenceEditor, className];

  return (
    <HorizontalSplitPane
      className={classes.join(' ')}
      left={
        <div className={styles.sequenceEditor} ref={panelRef}>
          <label>
            Subdivide beat
            <NumberInput
              value={beatSubdivisions}
              onChange={setBeatSubdivisions}
              min={1}
              max={16}
            />
          </label>
          <Layers
            layers={sequence.layers}
            selectedEffect={selectedEffect}
            setSelectedEffect={setSelectedEffect}
            copyEffect={copyEffect}
            msToPx={msToPx}
            pxToMs={pxToMs}
            snapToBeat={snapToBeat}
          />
        </div>
      }
      right={
        selectedEffect ? (
          <EffectDetails
            className={styles.effectDetails}
            effect={selectedEffect.effect!}
            showPhase={true}
            availableChannels={ALL_CHANNELS}
          />
        ) : (
          <div className={styles.effectDetailsPlaceholder}>
            Select an effect to view details.
          </div>
        )
      }
    />
  );
}

interface LayersProps {
  layers: LayerProto[];
  selectedEffect: TimecodedEffect | null;
  setSelectedEffect: (e: TimecodedEffect | null) => void;
  copyEffect: TimecodedEffect | null;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function Layers({
  layers,
  selectedEffect,
  setSelectedEffect,
  copyEffect,
  msToPx,
  pxToMs,
  snapToBeat,
}: LayersProps) {
  return (
    <>
      {layers.map((l, i) => (
        <Layer
          key={i}
          layer={l}
          selectedEffect={selectedEffect}
          setSelectedEffect={setSelectedEffect}
          copyEffect={copyEffect}
          maxMs={SEQUENCE_BEAT_RESOLUTION}
          msToPx={msToPx}
          pxToMs={pxToMs}
          snapToBeat={snapToBeat}
        />
      ))}
    </>
  );
}
