import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import Crunker from 'crunker';
import LightTimeline from '../components/LightTimeline';
import styles from "./SequencePage.module.scss";
import { AudioFile_BeatMetadata } from '@dmx-controller/proto/audio_pb';
import { Button } from '../components/Button';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { Modal } from '../components/Modal';
import { NumberInput, TextInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { SEQUENCE_BEAT_RESOLUTION, deleteSequence } from '../engine/sequence';
import { Sequence } from '@dmx-controller/proto/sequence_pb';
import { SerialContext } from '../contexts/SerialContext';
import { idMapToArray, nextId } from '../util/mapUtils';
import { renderSequenceToUniverse } from '../engine/universe';

export default function newSequencePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();

  const [sequenceId, setSequenceId] = useState(-1);
  const [sequenceDetailsModal, setSequenceDetailsModal] = useState(false);

  const t = useRef<number>(0);

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

  const beatMetadata = useMemo(() => {
    return new AudioFile_BeatMetadata({
      lengthMs: (audioDuration || 600) / (sequence?.nativeBeats || 1),
      offsetMs: 0,
    });
  }, [sequence, beatSubdivisions, audioDuration]);

  const virtualTracks = useMemo(() => {
    if (sequence) {
      return [
        new LightTrackProto({
          name: 'Sequence',
          output: {
            value: 1,
            case: 'physicalFixtureId',
          },
          layers: sequence.layers,
        })
      ];
    } else {
      return [];
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
      virtualTracks[0].output,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, t, sequenceId, beatMetadata, virtualTracks]);

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

  return (
    <>
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        beatMetadata={beatMetadata}
        beatSubdivisions={beatSubdivisions}
        setBeatSubdivisions={setBeatSubdivisions}
        headerOptions={
          <>
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
                idMapToArray(project.sequences).map(([id, s]) => (
                  <option value={id}>{s.name}</option>
                ))
              }
              <option value={-1}>
                + Create New Sequence
              </option>
            </select>
          </>
        }
        headerControls={
          <span>
            Beats&nbsp;
            <NumberInput
              min={1}
              max={128}
              value={sequence?.nativeBeats || 1}
              onChange={(v) => {
                sequence.nativeBeats = v;
                save();
              }} />
          </span>
        }
        leftOptions={
          <>
            <Button onClick={() => setSequenceDetailsModal(true)}>
              Sequence Details
            </Button>
          </>
        }
        lightTracks={virtualTracks}
        save={save}
        panelRef={panelRef}
        audioToTrack={wsMsToSequenceMs}
        t={t}
      />
      {
        sequenceDetailsModal &&
        <Modal
          title={sequence?.name + ' Metadata'}
          onClose={() => setSequenceDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={sequence?.name}
                onChange={(v) => {
                  sequence.name = v;
                  save();
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
    </>
  );
}
