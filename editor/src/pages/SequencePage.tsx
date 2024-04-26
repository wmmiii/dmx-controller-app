import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import Crunker from 'crunker';
import IconBxPulse from '../icons/IconBxPulse';
import IconBxZoomIn from '../icons/IconBxZoomin';
import IconBxZoomOut from '../icons/IconBxZoomOut';
import styles from "./SequencePage.module.scss";
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { AudioFile_BeatMetadata } from '@dmx-controller/proto/audio_pb';
import { Sequence } from '@dmx-controller/proto/sequence_pb';
import { Button } from '../components/Button';
import { EffectDetails, EffectSelectContext, SelectedEffect } from '../components/Effect';
import { HorizontalSplitPane } from '../components/SplitPane';
import { LightTrack, MappingFunctions } from '../components/LightTrack';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { renderSequenceToUniverse } from '../engine/universe';
import { Modal } from '../components/Modal';
import { Show_LightTrack } from '@dmx-controller/proto/show_pb';
import { SEQUENCE_BEAT_RESOLUTION, deleteSequence } from '../engine/sequenceUtils';

export default function SequencePage(): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [sequenceId, setSequenceId] = useState(-1);
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
    }
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
        left={<Tracks sequenceId={sequenceId} setSequenceId={setSequenceId} />}
        right={<DetailsPane sequenceId={sequenceId} />} />
    </EffectSelectContext.Provider>
  );
}

interface TracksProps {
  sequenceId: number;
  setSequenceId: (id: number) => void;
}

function Tracks({ sequenceId, setSequenceId }: TracksProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();
  const [sequenceDetailsModal, setSequenceDetailsModal] = useState(false);

  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const t = useRef<number>(0);
  const [tState, setTState] = useState(0);

  const [leftWidth, _setLeftWidth] = useState(180);
  const [visible, setVisible] = useState({
    startT: 0,
    endT: SEQUENCE_BEAT_RESOLUTION,
  });
  const [minPxPerSec, setMinPxPerSec] = useState(16);
  const [snapToBeat, setSnapToBeat] = useState(true);
  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(SEQUENCE_BEAT_RESOLUTION);

  const sequence: Sequence = project?.sequences[sequenceId];
  const beats = sequence?.nativeBeats;

  const wsMsToSequenceMs = useCallback
    ((ms: number) => ms *
      (beats || 1) *
      SEQUENCE_BEAT_RESOLUTION /
      (audioDuration || 1),
      [beats, audioDuration]);

  useEffect(() => {
    if (sequence && sequence.nativeBeats == null) {
      sequence.nativeBeats = 1;
      project.sequences[sequenceId] = sequence;
      save();
    }
  }, [sequence]);

  // Initialize default sequence.
  useEffect(() => {
    if (sequenceId === -1 && project) {
      const firstKey = Object.keys(project?.sequences)[0];
      if (firstKey) {
        setSequenceId(parseInt(firstKey));
      } else {
        // Sequence 0 is reserved for the "unset" sequence.
        project.sequences[1] = new Sequence({
          name: 'Untitled Sequence',
          nativeBeats: 1,
          layers: [{
            effects: [],
          }],
        });
        save();
        setSequenceId(0);
      }
    }
  }, [project, sequenceId]);

  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({
      startT: wsMsToSequenceMs(startMs),
      endT: wsMsToSequenceMs(endMs),
    }),
    [setVisible, wsMsToSequenceMs]);

  const audioSegments = useMemo(() => {
    return new Crunker().fetchAudio('/static/tick.mp3', '/static/tock.mp3')
  }, []);

  useEffect(() => {
    if (beats) {
      (async () => {
        const crunker = new Crunker();
        const [tickBuffer, tockBuffer] = await audioSegments;

        const segments = [];
        for (let b = 0; b < beats; ++b) {
          segments.push(tickBuffer);
          for (let s = 1; s < beatSubdivisions; ++s) {
            segments.push(tockBuffer);
          }
        }

        const concatenated = await crunker.concatAudio(segments);
        const exported = await crunker.export(concatenated, 'audio/mpeg');

        setAudioBlob(exported.blob);
      })();
    }
  }, [audioSegments, beats, beatSubdivisions]);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => {
    ts = wsMsToSequenceMs(ts);
    t.current = ts;
    setTState(ts);
  }, [t, wsMsToSequenceMs]);

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
      description: 'Play/pause sequence.',
    },
  ]), [audioController.current, playing]);


  const beatMetadata = useMemo(() => {
    return new AudioFile_BeatMetadata({
      lengthMs: (audioDuration || 600) / (sequence?.nativeBeats || 1),
      offsetMs: 0,
    });
  }, [sequence, beatSubdivisions, audioDuration]);

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
        return ((ms - visible.startT) * width) /
          (visible.endT - visible.startT);
      };

      pxToMs = (px: number) => {
        return Math.floor(((px - left) / width) *
          (visible.endT - visible.startT) + visible.startT);
      };

      const beatSnapRangeMs =
        Math.floor(10 * (visible.endT - visible.startT) / width);

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

  const virtualTrack = useMemo(() => {
    if (sequence) {
      return new Show_LightTrack({
        name: 'Sequence',
        output: {
          value: 0,
          case: 'physicalFixtureId',
        },
        layers: sequence.layers,
      })
    } else {
      return null;
    }
  }, [sequence]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderSequenceToUniverse(
      t.current,
      sequenceId,
      beatMetadata,
      virtualTrack.output,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, playing, t, sequenceId, beatMetadata, virtualTrack]);

  return (
    <div
      ref={panelRef}
      className={styles.trackContainer}>
      <div className={styles.timelineOptions}>
        <div className={styles.meta} style={{ width: leftWidth }}>
          Sequence:
          <br />
          <select
            onChange={(e) => {
              if (e.target.value === '-1') {
                const newId = nextId(project.sequences);
                project.sequences[newId] = new Sequence({
                  name: 'Untitled Sequence',
                  nativeBeats: 1,
                  layers: [{
                    effects: [],
                  }],
                });
                save();
                setSequenceId(newId);
              } else {
                setSequenceId(parseInt(e.target.value));
              }
            }}
            value={sequenceId}>
            {
              project != null &&
              Object.entries(project.sequences).map(([key, value]) => (
                <option value={key}>{value.name}</option>
              ))
            }
            <option value={-1}>
              + Create New Sequence
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
            Beats&nbsp;
            <input
              type="number"
              min="1"
              max="128"
              value={sequence?.nativeBeats || 1}
              onChange={(e) => {
                sequence.nativeBeats = Math.max(parseInt(e.target.value), 1);
                save();
              }} />
          </span>
          <span>
            Subdivide beat&nbsp;
            <input
              type="number"
              min="1"
              max="16"
              value={beatSubdivisions}
              onChange={(e) =>
                setBeatSubdivisions(Math.max(parseInt(e.target.value), 1))} />
          </span>
        </div>
      </div>
      <div className={styles.audioVisualizer}>
        <div className={styles.meta} style={{ width: leftWidth }}>
          <Button onClick={() => setSequenceDetailsModal(true)}>
            Sequence Details
          </Button>
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
          loop={true}
          onProgress={setT} />
      </div>
      <div className={styles.lightTracks}>
        <div
          className={styles.cursor}
          style={{ left: mappingFunctions.msToPx(tState) + leftWidth }}>
        </div>
        <div className={styles.tracks}>
          {
            virtualTrack &&
            <LightTrack
              track={virtualTrack}
              maxMs={SEQUENCE_BEAT_RESOLUTION * beats}
              leftWidth={leftWidth}
              mappingFunctions={mappingFunctions}
              forceUpdate={() => {
                sequence.layers = virtualTrack.layers;
                save();
              }} />
          }
        </div>
      </div>
      {
        sequenceDetailsModal &&
        <Modal
          title={sequence?.name + ' Metadata'}
          onClose={() => setSequenceDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <input
                type="text"
                value={sequence?.name}
                onChange={(e) => {
                  sequence.name = e.target.value;
                  save();
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  deleteSequence(sequenceId, project);
                  save();
                  setSequenceDetailsModal(false);
                }}>
                Delete Sequence
              </Button>&nbsp;
              Cannot be undone!
            </div>
          </div>
        </Modal>
      }
    </div>
  )
}

interface DetailsPaneProps {
  sequenceId: number;
}

function DetailsPane({ sequenceId }: DetailsPaneProps): JSX.Element {
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
      sequenceId={sequenceId}
      className={styles.effectDetails}
      effect={selectedEffect}
      onChange={save} />
  );
}
