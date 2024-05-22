
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
import { AudioFile_BeatMetadata } from '@dmx-controller/proto/audio_pb';


export default function LightTimeline(props: TracksProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [selectedEffect, setSelectedEffect] = useState<SelectedEffect | null>(null);

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
  ]), [selectedEffect, setSelectedEffect]);

  return (
    <EffectSelectContext.Provider value={{
      selectedEffect: selectedEffect?.effect || null,
      deleteSelectedEffect: () => {
        selectedEffect?.delete();
        setSelectedEffect(null);
      },
      selectEffect: (effect) => setSelectedEffect(effect),
    }}>
      <HorizontalSplitPane
        className={styles.wrapper}
        defaultAmount={0.8}
        left={<Tracks {...props} />}
        right={<DetailsPane />} />
    </EffectSelectContext.Provider>
  );
}

interface TracksProps {
  audioBlob: Blob;
  beatMetadata: AudioFile_BeatMetadata;
  headerOptions: JSX.Element;
  leftOptions: JSX.Element;
  lightTracks: LightTrackProto[];
  save: () => void;
  swap?: (a: number, b: number) => void;
  addLayer?: () => void;
  t: React.MutableRefObject<number>;
}

function Tracks({
  audioBlob,
  beatMetadata,
  headerOptions,
  leftOptions,
  lightTracks,
  save,
  swap,
  addLayer,
  t,
}: TracksProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);

  const panelRef = useRef<HTMLDivElement>();

  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const [tState, setTState] = useState(0);

  const [leftWidth, _setLeftWidth] = useState(180);
  const [visible, setVisible] = useState({ startMs: 0, endMs: 1000 });
  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({ startMs, endMs }),
    [setVisible]);
  const [minPxPerSec, setMinPxPerSec] = useState(16);
  const [snapToBeat, setSnapToBeat] = useState(true);
  const [beatSubdivisions, setBeatSubdivisions] = useState(1);
  const [audioDuration, setAudioDuration] = useState(1);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => {
    t.current = ts;
    setTState(ts);
  }, [t]);

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
      (tState - beatMetadata.offsetMs) /
      beatMetadata.lengthMs) + 1;
  } else {
    beatNumber = undefined;
  }

  const nearestBeat = useCallback((t: number) => {
    if (beatMetadata) {
      const lengthMs = beatMetadata.lengthMs / beatSubdivisions;
      const beatNumber = Math.round((t - beatMetadata.offsetMs) / lengthMs);
      return Math.floor(beatMetadata.offsetMs + beatNumber * lengthMs);
    }
    return undefined;
  }, [beatMetadata, beatSubdivisions]);

  const mappingFunctions: MappingFunctions = useMemo(() => {
    let msToPx = (_ms: number) => 0;
    let pxToMs = (_px: number) => 0;
    let snapToBeat = (_t: number) => 0;

    if (panelRef.current) {
      const bounding = panelRef.current.getBoundingClientRect();
      const width = panelRef.current.getBoundingClientRect().width - leftWidth;
      const left = bounding.left + leftWidth;

      msToPx = (ms: number) => {
        return ((ms - visible.startMs) * width) /
          (visible.endMs - visible.startMs);
      };

      pxToMs = (px: number) => {
        return Math.floor(((px - left) / width) *
          (visible.endMs - visible.startMs) + visible.startMs);
      };

      const beatSnapRangeMs =
        Math.floor(10 * (visible.endMs - visible.startMs) / width);

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
  }, [visible, panelRef, leftWidth, nearestBeat]);

  return (
    <div
      ref={panelRef}
      className={styles.trackContainer}>
      <div className={styles.timelineOptions}>
        <div className={styles.meta} style={{ width: leftWidth }}>
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
        <div className={styles.meta} style={{ width: leftWidth }}>
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
          onProgress={setT} />
      </div>
      <div className={styles.lightTracks}>
        <div
          className={styles.cursor}
          style={{ left: mappingFunctions.msToPx(tState) + leftWidth }}>
        </div>
        <div className={styles.tracks}>
          {
            lightTracks.map((t: LightTrackProto, i) => (
              <LightTrack
                track={t}
                maxMs={audioDuration}
                leftWidth={leftWidth}
                mappingFunctions={mappingFunctions}
                forceUpdate={save}
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
          <div className={styles.newOutput} style={{ width: leftWidth }}>
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


function DetailsPane(): JSX.Element {
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
      className={styles.effectDetails}
      effect={selectedEffect}
      onChange={save} />
  );
}
