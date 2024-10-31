
import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import IconBxPulse from '../icons/IconBxPulse';
import IconBxZoomIn from '../icons/IconBxZoomin';
import IconBxZoomOut from '../icons/IconBxZoomOut';
import styles from "./LightTimeline.module.scss";
import { AudioController, AudioTrackVisualizer } from './AudioTrackVisualizer';
import { Button } from './Button';
import { EffectDetails, EffectSelectContext, SelectedEffect } from './Effect';
import { HorizontalSplitPane } from './SplitPane';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { LightTrack, MappingFunctions } from './LightTrack';
import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { NumberInput } from './Input';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { Effect as EffectProto } from '@dmx-controller/proto/effect_pb';


export const LEFT_WIDTH = 180;

type LightTimelineProps = TracksProps & DetailsPaneProps;

export default function LightTimeline(props: LightTimelineProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [selectedEffect, setSelectedEffect] = useState<SelectedEffect | null>(null);
  const [copyEffect, setCopyEffect] = useState<EffectProto | null>(null);

  useEffect(() => setShortcuts([
    {
      shortcut: { key: 'Escape' },
      action: () => setSelectedEffect(null),
      description: 'Deselect the currently selected effect.',
    },
    {
      shortcut: { key: 'Delete' },
      action: () => {
        selectedEffect?.delete();
        setSelectedEffect(null);
      },
      description: 'Delete the currently selected effect.',
    },
    {
      shortcut: { key: 'KeyC', modifiers: ['ctrl'] },
      action: () => setCopyEffect(selectedEffect.effect),
      description: 'Copy currently selected effect to clipboard.'
    },
  ]), [selectedEffect, setSelectedEffect]);

  return (
    <EffectSelectContext.Provider value={{
      selectedEffect: selectedEffect?.effect || null,
      deleteSelectedEffect: () => {
        selectedEffect?.delete();
        setSelectedEffect(null);
      },
      selectEffect: (effect) => setSelectedEffect(effect),
      copyEffect: copyEffect,
    }}>
      <HorizontalSplitPane
        className={styles.wrapper}
        defaultAmount={0.8}
        left={<Tracks {...props} />}
        right={<DetailsPane {...props} />} />
    </EffectSelectContext.Provider>
  );
}

interface TracksProps {
  audioBlob: Blob;
  audioDuration: number;
  setAudioDuration: (duration: number) => void;
  loop?: boolean;
  beatMetadata: BeatMetadata;
  beatSubdivisions: number;
  setBeatSubdivisions: (subdivisions: number) => void;
  headerOptions: JSX.Element;
  headerControls?: JSX.Element;
  leftOptions: JSX.Element;
  lightTracks: LightTrackProto[];
  save: () => void;
  swap?: (a: number, b: number) => void;
  addLayer?: () => void;
  panelRef: React.MutableRefObject<HTMLDivElement>;
  audioToTrack?: (t: number) => number;
  t: React.MutableRefObject<number>;
}

function Tracks({
  audioBlob,
  audioDuration,
  setAudioDuration,
  loop,
  beatMetadata,
  beatSubdivisions,
  setBeatSubdivisions,
  headerOptions,
  headerControls,
  leftOptions,
  lightTracks,
  save,
  swap,
  addLayer,
  panelRef,
  audioToTrack,
  t,
}: TracksProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);

  const [visible, setVisible] = useState({ startMs: 0, endMs: 1000 });
  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const [tState, setTState] = useState(0);

  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({ startMs, endMs }),
    [setVisible]);
  const [minPxPerSec, setMinPxPerSec] = useState(16);
  const [snapToBeat, setSnapToBeat] = useState(true);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => {
    if (audioToTrack) {
      ts = audioToTrack(ts);
    }
    t.current = ts;
    setTState(ts);
  }, [t, audioToTrack]);


  const nearestBeat = useCallback((t: number) => {
    if (beatMetadata) {
      const lengthMs = beatMetadata.lengthMs / beatSubdivisions;
      // WARNING: Converting BigInt to Number looses 7 bits of precision!
      const beatNumber = Math.round((t - Number(beatMetadata.offsetMs)) / lengthMs);
      return Math.floor(Number(beatMetadata.offsetMs) + beatNumber * lengthMs);
    }
    return undefined;
  }, [beatMetadata, beatSubdivisions]);

  const mappingFunctions: MappingFunctions = useMemo(() => {
    let msToPx = (_ms: number) => 0;
    let pxToMs = (_px: number) => 0;
    let snapToBeat = (_t: number) => 0;

    if (panelRef.current) {
      const startT = audioToTrack ? audioToTrack(visible.startMs) : visible.startMs;
      const endT = audioToTrack ? audioToTrack(visible.endMs) : visible.endMs;
      const bounding = panelRef.current.getBoundingClientRect();
      const width = panelRef.current.getBoundingClientRect().width - LEFT_WIDTH;
      const left = bounding.left + LEFT_WIDTH;

      msToPx = (ms: number) => {
        return ((ms - startT) * width) /
          (endT - startT);
      };

      pxToMs = (px: number) => {
        return Math.floor(((px - left) / width) *
          (endT - startT) + startT);
      };

      const beatSnapRangeMs = Math.floor(10 * (endT - startT) / width);

      snapToBeat = (t: number) => {
        const beat = nearestBeat(t);
        if (Math.abs(beat - t) < beatSnapRangeMs) {
          return beat;
        }
        return t;
      };
    }

    return {
      msToPx,
      pxToMs,
      snapToBeat,
    };
  }, [visible, panelRef, nearestBeat, audioToTrack]);

  useEffect(() => setShortcuts([
    {
      shortcut: { key: 'Space' },
      action: () => {
        if (playing) {
          audioController?.current.pause();
        } else {
          audioController?.current.play();
        }
      },
      description: 'Play/pause show.',
    },
  ]), [audioController.current, playing]);

  let beatNumber: number | undefined;
  if (beatMetadata) {
    beatNumber = Math.floor(
      // WARNING: Converting BigInt to Number looses 7 bits of precision!
      (tState - Number(beatMetadata.offsetMs)) /
      beatMetadata.lengthMs) + 1;
  } else {
    beatNumber = undefined;
  }

  return (
    <div
      ref={panelRef}
      className={styles.trackContainer}>
      <div className={styles.timelineOptions}>
        <div className={styles.meta} style={{ width: LEFT_WIDTH }}>
          {headerOptions}
        </div>
        <div className={styles.right}>
          <Button
            icon={<IconBxZoomIn />}
            onClick={() => setMinPxPerSec(minPxPerSec * 2)}>
            Zoom In
          </Button>
          <Button
            icon={<IconBxZoomOut />}
            onClick={() => setMinPxPerSec(minPxPerSec / 2)}>
            Zoom Out
          </Button>
          <Button
            variant={snapToBeat ? 'primary' : 'default'}
            icon={<IconBxPulse />}
            onClick={() => setSnapToBeat(!snapToBeat)}>
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
              onChange={setBeatSubdivisions} />
          </span>
          <div className={styles.spacer}></div>
          <span>
            MS: {Math.floor(tState)}
          </span>
          {
            beatNumber != null &&
            <span>
              Beat number: {beatNumber}
            </span>
          }
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
          loop={loop} />
      </div>
      <div className={styles.lightTracks}>
        <div
          className={styles.cursor}
          style={{ left: mappingFunctions.msToPx(tState) + LEFT_WIDTH }}>
        </div>
        <div className={styles.tracks}>
          {
            lightTracks.map((t: LightTrackProto, i) => (
              <LightTrack
                key={i}
                track={t}
                maxMs={audioToTrack ?
                  audioToTrack(audioDuration) :
                  audioDuration}
                leftWidth={LEFT_WIDTH}
                mappingFunctions={mappingFunctions}
                save={save}
                swapUp={
                  i == 0 || swap === undefined ?
                    undefined :
                    () => {
                      swap(i, i - 1);
                      save();
                    }
                } />
            ))
          }
          <div className={styles.newOutput} style={{ width: LEFT_WIDTH }}>
            {
              addLayer &&
              <Button onClick={addLayer}>
                + New Output
              </Button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

interface DetailsPaneProps {
  fixtureSequenceId?: number;
}

function DetailsPane({ fixtureSequenceId }: DetailsPaneProps): JSX.Element {
  const { save } = useContext(ProjectContext);
  const { selectedEffect } = useContext(EffectSelectContext);

  if (selectedEffect == null) {
    return (
      <div className={styles.effectDetails}>
        Select an effect to view details.
      </div>
    );
  }

  return (
    <EffectDetails
      fixtureSequenceId={fixtureSequenceId}
      className={styles.effectDetails}
      effect={selectedEffect}
      onChange={save} />
  );
}
