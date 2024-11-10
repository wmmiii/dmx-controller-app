import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import LightTimeline from './LightTimeline';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { LightTrack as LightTrackProto } from '@dmx-controller/proto/light_track_pb';
import { ProjectContext } from '../contexts/ProjectContext';
import { SEQUENCE_BEAT_RESOLUTION } from '../engine/fixtureSequence';
import { getAudioBlob } from '../util/metronome';

import styles from './UniverseSequenceEditor.module.scss';
import { NumberInput } from './Input';
import { Scene_Component_SequenceComponent } from '@dmx-controller/proto/scene_pb';

interface UniverseSequenceEditorProps {
  className?: string;
  sequence: Scene_Component_SequenceComponent;
}

export function UniverseSequenceEditor({
  className,
  sequence,
}: UniverseSequenceEditorProps): JSX.Element {
  const { save } = useContext(ProjectContext);

  const panelRef = useRef<HTMLDivElement>();

  const t = useRef<number>(0);

  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(SEQUENCE_BEAT_RESOLUTION);

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
  }, [beats, beatSubdivisions, setAudioBlob]);

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
                save(`Set number of beats for sequence ${sequence.name}.`);
              }} />
          </span>
        }
        leftOptions={<></>}
        lightTracks={sequence.lightTracks}
        addLayer={() => {
          sequence?.lightTracks.push(new LightTrackProto());
          save(`Add new light track to sequence ${sequence.name}.`);
        }}
        panelRef={panelRef}
        audioToTrack={wsMsToSceneMs}
        t={t} />
    </div>
  );
}
