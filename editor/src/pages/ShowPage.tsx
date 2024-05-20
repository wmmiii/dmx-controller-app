import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import IconBxPulse from '../icons/IconBxPulse';
import IconBxZoomIn from '../icons/IconBxZoomin';
import IconBxZoomOut from '../icons/IconBxZoomOut';
import styles from "./ShowPage.module.scss";
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { Button } from '../components/Button';
import { EffectDetails, EffectSelectContext, SelectedEffect } from '../components/Effect';
import { HorizontalSplitPane } from '../components/SplitPane';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { LightTrack, MappingFunctions } from '../components/LightTrack';
import { Modal } from '../components/Modal';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { Show, Show_AudioTrack } from '@dmx-controller/proto/show_pb';
import { UNSET_INDEX, idMapToArray } from '../util/mapUtils';
import { renderShowToUniverse } from '../engine/universe';
import { NumberInput, TextInput } from '../components/Input';

const DEFAULT_SHOW = new Show({
  name: 'Untitled Show',
  audioTrack: {
    audioFileId: UNSET_INDEX + 1,
  },
  lightTracks: [
    {
      name: 'Fixture',
      output: {
        value: 0,
        case: 'physicalFixtureId',
      },
      layers: [
        {
          effects: [],
        }
      ]
    },
  ],
});

export default function ShowPage(): JSX.Element {
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
        left={<Tracks />}
        right={<DetailsPane />} />
    </EffectSelectContext.Provider>
  );
}

function Tracks(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const t = useRef<number>(0);
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

  const show =
    useMemo(() => project?.shows[project.selectedShow || 0], [project]);

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
  ]), [audioController.current, playing, project]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderShowToUniverse(t.current, project);
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, playing, t]);

  const audioFile = useMemo(
    () => project?.assets?.audioFiles[show?.audioTrack.audioFileId],
    [show?.audioTrack.audioFileId, project]);
  const audioBlob = useMemo(() => {
    if (!audioFile) {
      return undefined;
    }
    return new Blob([audioFile.contents], {
      type: audioFile.mime,
    });
  }, [audioFile]);

  const beatMetadata = audioFile?.beatMetadata;

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
          Show:
          <br />
          <select
            onChange={(e) => {
              if (e.target.value === '-1') {
                project.shows.push(DEFAULT_SHOW);
                project.selectedShow = project.shows.length - 1;
                save();
              } else {
                project.selectedShow = parseInt(e.target.value);
                save();
              }
            }}
            value={project?.selectedShow || 0}>
            {
              project?.shows.map((s: Show, i: number) => (
                <option value={i}>{s.name}</option>
              ))
            }
            <option value={-1}>
              + Create New Show
            </option>
          </select>
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
          <Button onClick={() => setShowDetailsModal(true)}>
            Show Details
          </Button>
          Audio Track:
          <br />
          <select
            onChange={(e) => {
              show.audioTrack = new Show_AudioTrack({
                audioFileId: parseInt(e.target.value),
              });
              save();
            }}
            value={show?.audioTrack.audioFileId}>
            <option value={UNSET_INDEX}>
              &lt;Unset&gt;
            </option>
            {
              idMapToArray(project?.assets?.audioFiles)
                .map(([id, f]) => (
                  <option value={id}>
                    {f.name}
                  </option>
                ))
            }
          </select>
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
            show?.lightTracks.map((t: LightTrackProto, i) => (
              <LightTrack
                track={t}
                maxMs={audioDuration}
                leftWidth={leftWidth}
                mappingFunctions={mappingFunctions}
                forceUpdate={save}
                swapUp={
                  i == 0 ?
                    undefined :
                    () => {
                      const temp = show.lightTracks[i];
                      show.lightTracks[i] = show.lightTracks[i - 1];
                      show.lightTracks[i - 1] = temp;
                      save();
                    }
                } />
            ))
          }
          <div className={styles.newOutput} style={{ width: leftWidth }}>
            <Button onClick={() => {
              show?.lightTracks.push(new LightTrackProto({
                name: 'Layer ' + (show.lightTracks.length + 1),
              }));
              save();
            }}>
              + New Output
            </Button>
          </div>
        </div>
      </div>
      {
        showDetailsModal &&
        <Modal
          title={show?.name + ' Metadata'}
          onClose={() => setShowDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={show?.name}
                onChange={(v) => {
                  show.name = v;
                  save();
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  project.shows.splice(project.selectedShow, 1);
                  project.selectedShow = 0;
                  save();
                  setShowDetailsModal(false);
                }}>
                Delete Show
              </Button>&nbsp;
              Cannot be undone!
            </div>
          </div>
        </Modal>
      }
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
