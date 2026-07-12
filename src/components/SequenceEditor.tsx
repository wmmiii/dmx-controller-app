import { create } from '@bufbuild/protobuf';
import {
  Layer as LayerProto,
  LayerSchema,
  TimecodedEffect,
} from '@dmx-controller/proto/effect_pb';
import clsx from 'clsx';
import React, {
  JSX,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BiPlus, BiTrash } from 'react-icons/bi';

import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { ALL_CHANNELS } from '../engine/channel';
import { LaneInteraction, useLaneInteraction } from '../hooks/laneInteraction';
import {
  BeatMappings,
  TimelineViewport,
  snapPointsMs,
} from '../util/timecodeUtils';

import { Button, IconButton } from './Button';
import { NumberInput, TextInput } from './Input';
import styles from './SequenceEditor.module.css';
import { EffectDetails } from './TimecodeEffect';
import { LaneDragMask, TrackLane } from './TrackLane';

// Good resolution, nice divisors (2^5 * 3^2 * 5^2.)
const SEQUENCE_BEAT_RESOLUTION = 7200;

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
  const lanesElement = useRef<HTMLDivElement>(null);
  const [lanesWidth, setLanesWidth] = useState(100);
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
        {
          shortcut: { key: 'Delete' },
          action: () => {
            const address = selectedEffectAddress;
            if (address == null) {
              return;
            }
            sequence.layers[address.layer]?.effects.splice(address.index, 1);
            setSelectedEffectAddress(null);
            save('Delete effect.');
          },
          description: 'Delete the currently selected effect.',
        },
      ]),
    [
      setSelectedEffectAddress,
      setCopyEffect,
      selectedEffect,
      selectedEffectAddress,
      sequence,
      save,
    ],
  );

  useEffect(() => {
    if (lanesElement.current) {
      const observer = new ResizeObserver(() => {
        if (lanesElement.current) {
          setLanesWidth(lanesElement.current.getBoundingClientRect().width);
        }
      });

      observer.observe(lanesElement.current);
      return () => observer.disconnect();
    }
    return () => {};
  }, [lanesElement, setLanesWidth]);

  const viewEndMs = SEQUENCE_BEAT_RESOLUTION * sequence.nativeBeats;
  const viewport: TimelineViewport = {
    viewStartMs: 0,
    viewEndMs,
    widthPx: lanesWidth,
  };
  const beatMapping: BeatMappings = {
    msToBeat: (t) => t / SEQUENCE_BEAT_RESOLUTION,
    beatToMs: (beat) => beat * SEQUENCE_BEAT_RESOLUTION,
  };
  const snapPoints = snapPointsMs(beatMapping, beatSubdivisions, 0, viewEndMs);

  const drag = useLaneInteraction(
    (laneIndex) => sequence.layers[laneIndex].effects,
    viewport,
    () =>
      Array.from(
        lanesElement.current?.querySelectorAll<HTMLElement>(
          '[data-track-lane]',
        ) ?? [],
      ).map((lane) => lane.getBoundingClientRect()),
    lanesElement,
    beatMapping,
    snapPoints,
    viewEndMs,
    (laneIndex, effectIndex) =>
      setSelectedEffectAddress({ layer: laneIndex, index: effectIndex }),
  );

  return (
    <div className={clsx(styles.sequenceEditor, className)}>
      <div className={styles.header}>
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
            mode="beat"
            value={sequence.nativeBeats}
            onChange={(i) => {
              sequence.nativeBeats = i;
            }}
            onFinalize={(i) => save(`Set number of beats in sequence to ${i}.`)}
          />
        </label>
        <label>
          Subdivide beat
          <NumberInput
            mode="counting"
            value={beatSubdivisions}
            onChange={setBeatSubdivisions}
          />
        </label>
      </div>
      <div className={styles.main}>
        <div className={styles.sequence}>
          <Layers
            layers={sequence.layers}
            nativeBeats={sequence.nativeBeats}
            beatSubdivisions={beatSubdivisions}
            viewport={viewport}
            drag={drag}
            selectedEffect={selectedEffect}
            setSelectedEffectAddress={setSelectedEffectAddress}
            copyEffect={copyEffect}
            lanesRef={lanesElement}
          />
          <LaneDragMask interaction={drag} />
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
    </div>
  );
}

interface LayersProps {
  layers: LayerProto[];
  nativeBeats: number;
  beatSubdivisions: number;
  viewport: TimelineViewport;
  drag: LaneInteraction;
  selectedEffect: TimecodedEffect | null;
  setSelectedEffectAddress: (
    address: { layer: number; index: number } | null,
  ) => void;
  copyEffect: TimecodedEffect | null;
  lanesRef: React.RefObject<HTMLDivElement | null>;
}

function Layers({
  layers,
  nativeBeats,
  beatSubdivisions,
  viewport,
  drag,
  selectedEffect,
  setSelectedEffectAddress,
  copyEffect,
  lanesRef,
}: LayersProps) {
  const { save } = useContext(ProjectContext);
  return (
    <>
      <div className={styles.layersGrid}>
        {layers.map((l, i) => (
          <React.Fragment key={i}>
            <div className={styles.deleteCell} style={{ gridRow: i + 1 }}>
              <IconButton
                title="Delete layer"
                variant="warning"
                onClick={() => {
                  setSelectedEffectAddress(null);
                  layers.splice(i, 1);
                  save('Delete layer from sequence');
                }}
              >
                <BiTrash />
              </IconButton>
            </div>
            <TrackLane
              className={styles.lane}
              style={{ gridRow: i + 1 }}
              laneIndex={i}
              layer={l}
              viewport={viewport}
              drag={drag}
              selectedEffect={selectedEffect}
              onSelectEffect={(index) =>
                setSelectedEffectAddress({ layer: i, index })
              }
              copyEffect={copyEffect}
            />
          </React.Fragment>
        ))}
        <div
          ref={lanesRef}
          className={styles.lanesOverlay}
          style={{ gridRow: `1 / span ${Math.max(layers.length, 1)}` }}
        >
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
      </div>
      <div className={styles.newLayerRow}>
        <Button
          icon={<BiPlus size={18} />}
          onClick={() => {
            layers.push(create(LayerSchema, { effects: [] }));
            save('Add layer to sequence');
          }}
        >
          Add layer
        </Button>
      </div>
    </>
  );
}
