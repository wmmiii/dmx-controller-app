import {
  JSX,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import {
  Effect_SequenceEffect,
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
  sequenceRef: Effect_SequenceEffect['sequence'];
}

export function SequenceEditor({
  className,
  sequenceRef,
}: SequenceEditorProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [selectedEffectAddress, setSelectedEffectAddress] = useState<{
    layer: number;
    index: number;
  } | null>(null);
  const [copyEffect, setCopyEffect] = useState<TimecodedEffect | null>(null);
  const [beatSubdivisions, setBeatSubdivisions] = useState(4);

  const sequence = useMemo(() => {
    switch (sequenceRef.case) {
      case 'sequenceId':
        return project.sequences[sequenceRef.value.toString()];
      case 'sequenceImpl':
        return sequenceRef.value;
      default:
        throw Error('Unknown sequence ref type!');
    }
  }, [project, sequenceRef]);

  if (!sequence) {
    throw new Error(
      `Could ont find sequence with reference ${JSON.stringify(sequenceRef)}!`,
    );
  }

  const selectedEffect = useMemo(() => {
    const address = selectedEffectAddress;
    if (!address) {
      return null;
    }

    return sequence.layers[selectedEffectAddress.layer].effects[
      selectedEffectAddress.index
    ];
  }, [selectedEffectAddress, project]);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Escape' },
          action: () => setSelectedEffectAddress(null),
          description: 'Deselect the currently selected effect.',
        },
        {
          shortcut: { key: 'KeyC', modifiers: ['ctrl'] },
          action: () => setCopyEffect(selectedEffect),
          description: 'Copy currently selected effect to clipboard.',
        },
      ]),
    [setSelectedEffectAddress, setCopyEffect, selectedEffect],
  );

  const msToPx = useCallback(
    (ms: number) => {
      if (!panelElement) {
        return 0;
      }
      const width = panelElement.getBoundingClientRect().width;
      return (ms * width) / SEQUENCE_BEAT_RESOLUTION;
    },
    [panelElement],
  );

  const pxToMs = useCallback(
    (px: number) => {
      if (!panelElement) {
        return 0;
      }
      const width = panelElement.getBoundingClientRect().width;
      return Math.floor((px * SEQUENCE_BEAT_RESOLUTION) / width);
    },
    [panelElement],
  );

  const snapToBeat = useCallback(
    (t: number) => {
      if (!panelElement) {
        return t;
      }
      const width = panelElement.getBoundingClientRect().width;

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
    },
    [panelElement],
  );

  const classes = [styles.SequenceEditor, className];

  return (
    <HorizontalSplitPane
      className={classes.join(' ')}
      defaultAmount={0.8}
      left={
        <div className={styles.sequenceEditor} ref={setPanelElement}>
          <label>
            Subdivide beat
            <NumberInput
              value={beatSubdivisions}
              onChange={setBeatSubdivisions}
              min={1}
              max={16}
            />
          </label>
          <br />
          <Layers
            layers={sequence.layers}
            selectedEffect={selectedEffect}
            setSelectedEffectAddress={setSelectedEffectAddress}
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
  setSelectedEffectAddress: (
    address: { layer: number; index: number } | null,
  ) => void;
  copyEffect: TimecodedEffect | null;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function Layers({
  layers,
  selectedEffect,
  setSelectedEffectAddress,
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
          setSelectedEffectAddress={(address) => {
            if (address == null) {
              setSelectedEffectAddress(null);
            } else {
              setSelectedEffectAddress({
                layer: i,
                index: address,
              });
            }
          }}
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
