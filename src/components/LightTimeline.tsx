import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import {
  JSX,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { EffectRenderingContext } from '../contexts/EffectRenderingContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';

import { TimecodedEffect } from '@dmx-controller/proto/effect_pb';
import { OutputTarget } from '@dmx-controller/proto/output_pb';
import { Show_Output } from '@dmx-controller/proto/show_pb';
import { BiPlus, BiZoomIn, BiZoomOut } from 'react-icons/bi';
import { getAvailableChannels } from '../engine/fixtures/fixture';
import { AudioController, AudioTrackVisualizer } from './AudioTrackVisualizer';
import { Button } from './Button';
import { NumberInput } from './Input';
import styles from './LightTimeline.module.scss';
import { LightTrack, MappingFunctions } from './LightTrack';
import { getOutputTargetName } from './OutputSelector';
import { Spacer } from './Spacer';
import { HorizontalSplitPane } from './SplitPane';
import { EffectDetails } from './TimecodeEffect';

export const LEFT_WIDTH = 180;

export default function LightTimeline(props: TracksProps): JSX.Element {
  const { project } = useContext(ProjectContext);

  const [selectedEffect, outputTarget, availableChannels] = useMemo(() => {
    const address = props.selectedEffectAddress;
    if (!address) {
      return [undefined, undefined, []];
    }

    const output = props.outputs[address.output];
    return [
      output.layers[address.layer].effects[address.index],
      output.outputTarget,
      getAvailableChannels(output.outputTarget, project),
    ];
  }, [props.selectedEffectAddress, props.outputs, project]);

  return (
    <HorizontalSplitPane
      className={styles.wrapper}
      defaultAmount={0.8}
      left={<Tracks {...props} />}
      right={
        selectedEffect ? (
          <EffectDetails
            className={styles.effectDetails}
            effect={selectedEffect.effect!}
            showPhase={
              outputTarget?.output.case == null ||
              outputTarget?.output.case === 'group'
            }
            availableChannels={availableChannels}
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

export interface LightTimelineEffect {
  effect: TimecodedEffect;
  outputTarget: OutputTarget | null;
}

interface EffectAddress {
  output: number;
  layer: number;
  index: number;
}

interface TracksProps {
  audioBlob: Blob | undefined;
  audioDuration: number;
  setAudioDuration: (duration: number) => void;
  selectedEffect: TimecodedEffect | null;
  selectedEffectAddress: EffectAddress | null;
  setSelectedEffectAddress: (a: EffectAddress | null) => void;
  copyEffect: TimecodedEffect | null;
  beatMetadata: BeatMetadata | undefined;
  beatSubdivisions: number;
  setBeatSubdivisions: (subdivisions: number) => void;
  headerOptions: JSX.Element;
  headerControls?: JSX.Element;
  leftOptions: JSX.Element;
  outputs: Show_Output[];
  swap?: (a: number, b: number) => void;
  addLayer?: () => void;
  audioToTrack?: (t: number) => number;
  t: React.MutableRefObject<number>;
}

function Tracks({
  audioBlob,
  audioDuration,
  setAudioDuration,
  selectedEffect,
  setSelectedEffectAddress,
  copyEffect,
  beatMetadata,
  beatSubdivisions,
  setBeatSubdivisions,
  headerOptions,
  headerControls,
  leftOptions,
  outputs,
  swap,
  addLayer,
  audioToTrack,
  t,
}: TracksProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  const [visible, setVisible] = useState({ startMs: 0, endMs: 1000 });
  const [playing, setPlaying] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const audioController = useRef<AudioController>(null);
  const [tState, setTState] = useState(0);

  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({ startMs, endMs }),
    [setVisible],
  );
  const [minPxPerSec, setMinPxPerSec] = useState(16);
  const [snapToBeat, setSnapToBeat] = useState(true);

  const setAudioController = useCallback(
    (c: AudioController) => (audioController.current = c),
    [audioController],
  );
  const setT = useCallback(
    (ts: number) => {
      if (audioToTrack) {
        ts = audioToTrack(ts);
      }
      t.current = ts;
      setTState(ts);
    },
    [t, audioToTrack],
  );

  const nearestBeat = useCallback(
    (t: number) => {
      if (beatMetadata != null) {
        const lengthMs = beatMetadata.lengthMs / beatSubdivisions;
        // WARNING: Converting BigInt to Number looses 7 bits of precision!
        const beatNumber = Math.round(
          (t - Number(beatMetadata.offsetMs)) / lengthMs,
        );
        return Math.floor(
          Number(beatMetadata.offsetMs) + beatNumber * lengthMs,
        );
      }
      return undefined;
    },
    [beatMetadata, beatSubdivisions],
  );

  const mappingFunctions: MappingFunctions = useMemo(() => {
    let msWidthToPxWidth = (_ms: number) => 0;
    let msToPx = (_ms: number) => 0;
    let pxToMs = (_px: number) => 0;
    let snapToBeat = (_t: number) => 0;

    if (panelRef.current) {
      const startT = audioToTrack
        ? audioToTrack(visible.startMs)
        : visible.startMs;
      const endT = audioToTrack ? audioToTrack(visible.endMs) : visible.endMs;
      const bounding = panelRef.current.getBoundingClientRect();
      const width = panelRef.current.getBoundingClientRect().width - LEFT_WIDTH;
      const left = bounding.left + LEFT_WIDTH;

      msWidthToPxWidth = (ms: number) => {
        return (ms * width) / (endT - startT);
      };

      msToPx = (ms: number) => {
        return ((ms - startT) * width) / (endT - startT);
      };

      pxToMs = (px: number) => {
        return Math.floor(((px - left) / width) * (endT - startT) + startT);
      };

      const beatSnapRangeMs = Math.floor((10 * (endT - startT)) / width);

      snapToBeat = (t: number) => {
        const beat = nearestBeat(t);
        if (beat == null) {
          return t;
        } else if (Math.abs(beat - t) < beatSnapRangeMs) {
          return beat;
        } else {
          return t;
        }
      };
    }

    return {
      msWidthToPxWidth,
      msToPx,
      pxToMs,
      snapToBeat,
    };
  }, [visible, panelRef, nearestBeat, audioToTrack]);

  useEffect(
    () =>
      setShortcuts([
        {
          shortcut: { key: 'Space' },
          action: () => {
            if (audioController.current != null) {
              if (playing) {
                audioController?.current.pause();
              } else {
                audioController?.current.play();
              }
            }
          },
          description: 'Play/pause show.',
        },
      ]),
    [audioController.current, playing],
  );

  let beatNumber: number | undefined;
  if (beatMetadata) {
    beatNumber =
      Math.floor(
        // WARNING: Converting BigInt to Number looses 7 bits of precision!
        (tState - Number(beatMetadata.offsetMs)) / beatMetadata.lengthMs,
      ) + 1;
  } else {
    beatNumber = undefined;
  }

  return (
    <div ref={panelRef} className={styles.trackContainer}>
      <div className={styles.timelineOptions}>
        <div className={styles.meta} style={{ width: LEFT_WIDTH }}>
          {headerOptions}
        </div>
        <div className={styles.right}>
          <Button
            icon={<BiZoomIn />}
            onClick={() => setMinPxPerSec(minPxPerSec * 2)}
          >
            Zoom In
          </Button>
          <Button
            icon={<BiZoomOut />}
            onClick={() => setMinPxPerSec(minPxPerSec / 2)}
          >
            Zoom Out
          </Button>
          <Button
            variant={snapToBeat ? 'primary' : 'default'}
            icon={<BiPlus />}
            onClick={() => setSnapToBeat(!snapToBeat)}
          >
            Snap to Beat
          </Button>
          {headerControls}
          <span>
            Subdivide beat&nbsp;
            <NumberInput
              disabled={!snapToBeat}
              min={1}
              max={16}
              value={beatSubdivisions}
              onChange={setBeatSubdivisions}
            />
          </span>
          <Spacer />
          <span>MS: {Math.floor(tState)}</span>
          {beatNumber != null && <span>Beat number: {beatNumber}</span>}
        </div>
      </div>
      <div className={styles.audioVisualizer}>
        <div className={styles.meta} style={{ width: LEFT_WIDTH }}>
          {leftOptions}
        </div>
        <AudioTrackVisualizer
          className={styles.right}
          audioBlob={audioBlob}
          beatMetadata={beatMetadata}
          setController={setAudioController}
          setPlaying={setPlaying}
          setVisible={setVisibleCallback}
          setTotalDuration={setAudioDuration}
          minPxPerSec={minPxPerSec}
          beatSubdivisions={beatSubdivisions}
          onProgress={setT}
        />
      </div>
      <div className={styles.lightTracks}>
        <div
          className={styles.cursor}
          style={{ left: mappingFunctions.msToPx(tState) + LEFT_WIDTH }}
        ></div>
        <EffectRenderingContext.Provider
          value={{
            beatWidthPx: beatMetadata
              ? mappingFunctions.msWidthToPxWidth(beatMetadata.lengthMs)
              : 64,
            msWidthToPxWidth: mappingFunctions.msWidthToPxWidth,
          }}
        >
          <div className={styles.tracks}>
            {outputs.map((o, i) => (
              <LightTrack
                key={i}
                output={o}
                selectedEffect={selectedEffect}
                setSelectedEffectAddress={(address) => {
                  if (!address) {
                    setSelectedEffectAddress(null);
                  } else {
                    setSelectedEffectAddress({
                      output: i,
                      layer: address.layer,
                      index: address.index,
                    });
                  }
                }}
                copyEffect={copyEffect}
                maxMs={
                  audioToTrack ? audioToTrack(audioDuration) : audioDuration
                }
                leftWidth={LEFT_WIDTH}
                mappingFunctions={mappingFunctions}
                deleteTrack={() => {
                  const name = getOutputTargetName(project, o.outputTarget);
                  outputs.splice(i, 1);
                  save(`Delete track for ${name}.`);
                }}
                swapUp={
                  i == 0 || swap === undefined
                    ? undefined
                    : () => {
                        swap(i, i - 1);
                        save('Rearrange track order.');
                      }
                }
              />
            ))}
            <div className={styles.newOutput} style={{ width: LEFT_WIDTH }}>
              {addLayer && <Button onClick={addLayer}>+ New Output</Button>}
            </div>
          </div>
        </EffectRenderingContext.Provider>
      </div>
    </div>
  );
}
