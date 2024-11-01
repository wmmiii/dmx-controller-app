import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import LightTimeline from './LightTimeline';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { SEQUENCE_BEAT_RESOLUTION } from '../engine/fixtureSequence';
import { getAudioBlob } from '../util/metronome';

import styles from './UniverseSequenceEditor.module.scss';
import { NumberInput, TextInput } from './Input';
import { Button } from './Button';
import { Modal } from './Modal';
import { deleteSequence } from '../engine/universeSequence';

interface UniverseSequenceEditorProps {
  className?: string;
  universeSequenceId: number;
}

export function UniverseSequenceEditor({
  className,
  universeSequenceId
}: UniverseSequenceEditorProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  const panelRef = useRef<HTMLDivElement>();

  const [sequenceDetailsModal, setSequenceDetailsModal] = useState(false);

  const t = useRef<number>(0);

  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(SEQUENCE_BEAT_RESOLUTION);

  const sequence = useMemo(() => project?.universeSequences[universeSequenceId], [universeSequenceId]);
  const beats = sequence?.nativeBeats;

  const wsMsToSceneMs = useCallback
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
      lengthMs: wsMsToSceneMs((audioDuration || 600) / (beats || 1)),
      offsetMs: BigInt(0),
    });
  }, [audioDuration, beats]);

  const classes = [styles.universeSequenceEditor, className];

  return (
    <div className={classes.join(' ')}>
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        loop={true}
        beatMetadata={beatMetadata}
        beatSubdivisions={beatSubdivisions}
        setBeatSubdivisions={setBeatSubdivisions}
        headerOptions={<></>}
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
        lightTracks={sequence.lightTracks}
        save={save}
        addLayer={() => {
          sequence?.lightTracks.push(new LightTrackProto({
            name: 'Layer ' + (sequence.lightTracks.length + 1),
          }));
          save();
        }}
        panelRef={panelRef}
        audioToTrack={wsMsToSceneMs}
        t={t} />
      {
        sequenceDetailsModal &&
        <Modal
          title={sequence.name + ' Metadata'}
          footer={
            <Button variant="primary" onClick={() => setSequenceDetailsModal(false)}>
              Done
            </Button>
          }
          onClose={() => setSequenceDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <TextInput
                value={sequence.name}
                onChange={(v) => {
                  sequence.name = v;
                  save();
                }} />
            </div>
            <div>
              <Button
                variant='warning'
                onClick={() => {
                  deleteSequence(universeSequenceId, project);
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
  );
}