import { create } from '@bufbuild/protobuf';
import { BeatMetadataSchema } from '@dmx-controller/proto/beat_pb';
import { LightTrackSchema } from '@dmx-controller/proto/light_track_pb';
import { Scene_Tile_SequenceTile } from '@dmx-controller/proto/scene_pb';
import {
  JSX,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { getAudioBlob } from '../util/metronome';

import { NumberInput } from './Input';
import LightTimeline from './LightTimeline';
import styles from './UniverseSequenceEditor.module.scss';

// Good resolution, nice divisors (2, 3, 4, 5, 6, 12 etc.)
export const SEQUENCE_BEAT_RESOLUTION = 36000;

interface UniverseSequenceEditorProps {
  className?: string;
  sequence: Scene_Tile_SequenceTile;
}

export function UniverseSequenceEditor({
  className,
  sequence,
}: UniverseSequenceEditorProps): JSX.Element {
  const { save } = useContext(ProjectContext);

  const t = useRef<number>(0);

  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | undefined>();
  const [audioDuration, setAudioDuration] = useState<number>(
    SEQUENCE_BEAT_RESOLUTION,
  );

  const beats = sequence?.nativeBeats;

  const wsMsToSceneMs = useCallback(
    (ms: number) =>
      (ms * (beats || 1) * SEQUENCE_BEAT_RESOLUTION) / (audioDuration || 1),
    [beats, audioDuration],
  );

  useEffect(() => {
    if (beats) {
      getAudioBlob(beats, beatSubdivisions).then(setAudioBlob);
    }
  }, [beats, beatSubdivisions, setAudioBlob]);

  const beatMetadata = useMemo(() => {
    return create(BeatMetadataSchema, {
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
              }}
            />
          </span>
        }
        leftOptions={<></>}
        lightTracks={sequence.lightTracks}
        addLayer={() => {
          sequence?.lightTracks.push(create(LightTrackSchema, {}));
          save(`Add new light track to sequence ${sequence.name}.`);
        }}
        audioToTrack={wsMsToSceneMs}
        t={t}
      />
    </div>
  );
}
