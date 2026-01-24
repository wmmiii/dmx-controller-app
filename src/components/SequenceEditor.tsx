import React, {
  createRef,
  JSX,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { create } from '@bufbuild/protobuf';
import {
  Layer as LayerProto,
  LayerSchema,
  TimecodedEffect,
} from '@dmx-controller/proto/effect_pb';
import { BiPlus } from 'react-icons/bi';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { ALL_CHANNELS } from '../engine/channel';
import { IconButton } from './Button';
import { NumberInput, TextInput } from './Input';
import { Layer } from './Layer';
import styles from './SequenceEditor.module.scss';
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
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const panelElement = createRef<HTMLDivElement>();
  const [panelWidth, setPanelWidth] = useState(100);
  const [selectedEffectAddress, setSelectedEffectAddress] = useState<{
    layer: number;
    index: number;
  } | null>(null);
  const [copyEffect, setCopyEffect] = useState<TimecodedEffect | null>(null);
  const [beatSubdivisions, setBeatSubdivisions] = useState(4);

  const sequence = project.sequences[String(sequenceId)];

  if (!sequence) {
    throw new Error(`Could ont find sequence with id ${sequenceId}!`);
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

  useEffect(() => {
    if (panelElement.current) {
      const observer = new ResizeObserver(() => {
        if (panelElement.current) {
          setPanelWidth(panelElement.current.getBoundingClientRect().width);
        }
      });

      observer.observe(panelElement.current);
      return () => observer.disconnect();
    }
    return () => {};
  }, [panelElement, setPanelWidth]);

  const msToPx = useCallback(
    (ms: number) =>
      (ms * panelWidth) / SEQUENCE_BEAT_RESOLUTION / sequence.nativeBeats,
    [panelWidth],
  );

  const pxToMs = useCallback(
    (px: number) =>
      Math.floor(
        (px * SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats) / panelWidth,
      ),
    [panelWidth],
  );

  const snapToBeat = useCallback(
    (t: number) => {
      const beatSnapRangeMs = Math.floor(panelWidth / 32);

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
    [panelWidth],
  );

  const classes = [styles.sequenceEditor, className];

  return (
    <div className={classes.join(' ')}>
      <div className={styles.sequence} ref={panelElement}>
        <label>
          Name
          <TextInput
            value={sequence.name}
            onChange={(n) => {
              sequence.name = n;
              save(`Set sequence name to ${n}.`);
            }}
          />
        </label>
        <label>
          Sequence length in beats
          <NumberInput
            value={sequence.nativeBeats}
            onChange={(i) => {
              sequence.nativeBeats = i;
            }}
            onFinalize={(i) => save(`Set number of beats in sequence to ${i}.`)}
            min={1}
            max={16}
          />
        </label>
        <label>
          Subdivide beat
          <NumberInput
            value={beatSubdivisions}
            onChange={setBeatSubdivisions}
            min={1}
            max={16}
          />
        </label>
        <hr />
        <Layers
          layers={sequence.layers}
          nativeBeats={sequence.nativeBeats}
          beatSubdivisions={beatSubdivisions}
          selectedEffect={selectedEffect}
          setSelectedEffectAddress={setSelectedEffectAddress}
          copyEffect={copyEffect}
          msToPx={msToPx}
          pxToMs={pxToMs}
          snapToBeat={snapToBeat}
        />
      </div>
      {selectedEffect ? (
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
      )}
    </div>
  );
}

interface LayersProps {
  layers: LayerProto[];
  nativeBeats: number;
  beatSubdivisions: number;
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
  nativeBeats,
  beatSubdivisions,
  selectedEffect,
  setSelectedEffectAddress,
  copyEffect,
  msToPx,
  pxToMs,
  snapToBeat,
}: LayersProps) {
  const { save } = useContext(ProjectContext);
  return (
    <>
      <div className={styles.layerContainer}>
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
            onDelete={() => {
              setSelectedEffectAddress(null);
              layers.splice(i, 1);
              save('Delete layer from sequence');
            }}
            maxMs={SEQUENCE_BEAT_RESOLUTION * nativeBeats}
            msToPx={msToPx}
            pxToMs={pxToMs}
            snapToBeat={snapToBeat}
          />
        ))}
        <div className={styles.verticalRules}>
          {new Array(nativeBeats).fill(0).map((_, i) => (
            <React.Fragment key={i}>
              {new Array(beatSubdivisions - 1).fill(0).map((_, i) => (
                <div key={i} className={styles.ruleFaint}></div>
              ))}
              <div key={i} className={styles.rule}></div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className={styles.newLayerRow}>
        <IconButton
          title="Add new layer"
          onClick={() => {
            layers.push(create(LayerSchema, { effects: [] }));
            save('Add layer to sequence');
          }}
        >
          <BiPlus />
        </IconButton>
      </div>
    </>
  );
}
