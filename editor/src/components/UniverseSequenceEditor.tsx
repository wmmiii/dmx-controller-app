import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import LightTimeline from './LightTimeline';
import { ProjectContext } from '../contexts/ProjectContext';
import { SEQUENCE_BEAT_RESOLUTION } from '../engine/fixtureSequence';
import { SerialContext } from '../contexts/SerialContext';
import { getAudioBlob } from '../util/metronome';
import { renderSceneToUniverse } from '../engine/universe';
import { BeatContext } from '../contexts/BeatContext';

import styles from './UniverseSequenceEditor.module.scss';

interface UniverseSequenceEditorProps {
  className?: string;
  universalSceneId: number;
}

export function UniverseSequenceEditor({
  className,
  universalSceneId
}: UniverseSequenceEditorProps): JSX.Element {
  const { beat: beatMetadata } = useContext(BeatContext);
  const { project, save } = useContext(ProjectContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const panelRef = useRef<HTMLDivElement>();

  const t = useRef<number>(0);

  const [beatSubdivisions, setBeatSubdivisions] = useState(4);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(SEQUENCE_BEAT_RESOLUTION);

  const scene = useMemo(() => project?.universeSequences[universalSceneId], [universalSceneId]);
  const beats = scene?.nativeBeats;

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

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => {
      t.current = new Date().getTime();

      return renderSceneToUniverse(
        t.current,
        universalSceneId,
      );
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, t, beatMetadata, universalSceneId]);

  const classes = [styles.universeSequenceEditor, className];

  return (
    <div className={classes.join(' ')}>
      <LightTimeline
        audioBlob={audioBlob}
        audioDuration={audioDuration}
        setAudioDuration={setAudioDuration}
        loop={false}
        beatMetadata={beatMetadata}
        beatSubdivisions={beatSubdivisions}
        setBeatSubdivisions={setBeatSubdivisions}
        headerOptions={<>header options</>}
        headerControls={<>header controls</>}
        leftOptions={<>left options</>}
        lightTracks={scene.lightTracks}
        save={save}
        panelRef={panelRef}
        audioToTrack={wsMsToSceneMs}
        t={t} />
    </div>
  );
}