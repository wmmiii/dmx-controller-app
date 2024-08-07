import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import LightTimeline from '../components/LightTimeline';
import styles from "./SequencePage.module.scss";
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { Button } from '../components/Button';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { Modal } from '../components/Modal';
import { NumberInput, TextInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { SEQUENCE_BEAT_RESOLUTION, deleteSequence } from '../engine/fixtureSequence';
import { FixtureSequence } from '@dmx-controller/proto/fixture_sequence_pb';
import { SerialContext } from '../contexts/SerialContext';
import { idMapToArray, nextId } from '../util/mapUtils';
import { renderSequenceToUniverse } from '../engine/universe';
import { getAudioBlob } from '../util/metronome';

export default function newSequencePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();

  const [fixtureSequenceId, setSequenceId] = useState(-1);
  const [sequenceDetailsModal, setSequenceDetailsModal] = useState(false);

  const t = useRef<number>(0);

  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(SEQUENCE_BEAT_RESOLUTION);

  const fixtureSequence: FixtureSequence = project?.fixtureSequences[fixtureSequenceId];
  const beats = fixtureSequence?.nativeBeats;

  const wsMsToSequenceMs = useCallback
    ((ms: number) => ms *
      (beats || 1) *
      SEQUENCE_BEAT_RESOLUTION /
      (audioDuration || 1),
      [beats, audioDuration]);

  useEffect(() => {
    if (beats) {
      getAudioBlob(beats, beatSubdivisions)
        .then(setAudioBlob);
    }
  }, [beats, beatSubdivisions]);

  const beatMetadata = useMemo(() => {
    return new BeatMetadata({
      lengthMs: (audioDuration || 600) / (fixtureSequence?.nativeBeats || 1),
      offsetMs: BigInt(0),
    });
  }, [fixtureSequence, audioDuration]);

  const virtualTracks = useMemo(() => {
    if (fixtureSequence?.layers) {
      const virtualTrack = new LightTrackProto({
        name: 'Sqeuence',
        output: {
          value: 1,
          case: 'physicalFixtureId',
        },
      });
      // We need a shallow copy of the array so it can be modified.
      virtualTrack.layers = fixtureSequence.layers;
      return [virtualTrack];
    } else {
      return [];
    }
  }, [fixtureSequence?.layers]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderSequenceToUniverse(
      t.current,
      fixtureSequenceId,
      beatMetadata,
      virtualTracks[0].output,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, t, fixtureSequenceId, beatMetadata, virtualTracks]);

  // Initialize default fixtureSequence.
  useEffect(() => {
    if (fixtureSequenceId === -1 && project) {
      const firstKey = Object.keys(project?.fixtureSequences)[0];
      if (firstKey) {
        setSequenceId(parseInt(firstKey));
      } else {
        // FixtureSequence 0 is reserved for the "unset" fixtureSequence.
        project.fixtureSequences[1] = new FixtureSequence({
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
  }, [project, fixtureSequenceId]);

  return (
    <>
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        loop={true}
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
                  const newId = nextId(project.fixtureSequences);
                  project.fixtureSequences[newId] = new FixtureSequence({
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
              value={fixtureSequenceId}>
              {
                project != null &&
                idMapToArray(project.fixtureSequences).map(([id, s]) => (
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
              value={fixtureSequence?.nativeBeats || 1}
              onChange={(v) => {
                fixtureSequence.nativeBeats = v;
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
        fixtureSequenceId={fixtureSequenceId}
        save={save}
        panelRef={panelRef}
        audioToTrack={wsMsToSequenceMs}
        t={t}
      />
      {
        sequenceDetailsModal &&
        <Modal
          title={fixtureSequence?.name + ' Metadata'}
          footer={
            <Button onClick={() => setSequenceDetailsModal(false)}>
              Done
            </Button>
          }
          onClose={() => setSequenceDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={fixtureSequence?.name}
                onChange={(v) => {
                  fixtureSequence.name = v;
                  save();
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  deleteSequence(fixtureSequenceId, project);
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
