import React, { JSX, createRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import styles from "./ShowPage.module.scss";
import { ProjectContext } from '../contexts/ProjectContext';
import { Show } from '@dmx-controller/proto/show_pb';
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { SerialContext } from '../contexts/SerialContext';
import { getPhysicalWritableDevice } from '../engine/fixture';
import { Button } from '../components/Button';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { HorizontalSplitPane } from '../components/SplitPane';

const COLORS = [
  {
    r: 1,
    g: 0,
    b: 1,
  },
  {
    r: 1,
    g: 0.8,
    b: 0,
  },
  {
    r: 0,
    g: 0.8,
    b: 1,
  },
  {
    r: 0,
    g: 1,
    b: 0,
  },
];

export default function ShowPage(): JSX.Element {
  const { project, saveProject } = useContext(ProjectContext);
  const { setShortcutHandler, clearShortcutHandler } = useContext(ShortcutContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);
  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const t = useRef<number>(0);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => t.current = ts, [t]);

  const show = useMemo(() => project?.show, [project]);
  const track = useMemo(() => {
    const id = project?.show?.audioTrack?.audioFileId;
    if (id != null) {
      return project.assets.audioFiles[id];
    } else {
      return null;
    }
  }, [project]);
  const beat = useMemo(() => track?.beatMetadata, [track]);

  useEffect(() => {
    if (project && !show && project.assets?.audioFiles.length > 0) {
      project.show = new Show({
        name: 'Untitled Show',
        audioTrack: {
          audioFileId: 0,
        },
      });
      saveProject(project);
    }
  }, [project, show]);

  useEffect(() => {
    const handler = (key: string) => {
      switch (key) {
        case 'Space':
          if (playing) {
            audioController.current?.pause();
          } else {
            audioController.current?.play();
          }
          return true;
        default:
          return false;
      }
    };

    setShortcutHandler(handler);
    return () => clearShortcutHandler(handler);
  }, [playing, audioController.current]);

  useEffect(() => {
    if (!project || !beat) {
      return;
    }
    const universe = new Uint8Array(512);
    const writableFixture = getPhysicalWritableDevice(project, 0, universe);

    writableFixture.setRGBW(0.8, 0, 1, 0);
    writableFixture.setTilt(-45);
    writableFixture.setChannel(5, 0);
    writableFixture.setChannel(6, 255);

    const render = () => {
      const pan = Math.sin(t.current / 1000) * 180;
      writableFixture.setPan(pan);
      const tilt = Math.sin(t.current / 1200) * 45;
      writableFixture.setTilt(tilt);
      let ts = t.current - beat.offsetMs;
      if (playing) {
        ts += project.updateOffsetMs;
      }
      const beatNum = Math.floor(ts / beat.lengthMs) + 1;
      const color = COLORS[beatNum % COLORS.length];
      const flash = 1 - (ts % beat.lengthMs) / beat.lengthMs;
      writableFixture.setRGB(color.r * flash, color.g * flash, color.b * flash);

      return universe;
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [beat, project, playing, t]);

  return (
    <HorizontalSplitPane
      className={styles.wrapper}
      defaultAmount={0.8}
      left={
        <>
          <AudioTrackVisualizer
            fileId={0}
            setController={setAudioController}
            setPlaying={setPlaying}
            onProgress={setT} />
          <Button onClick={() => audioController.current?.play()}>
            Play
          </Button>
          <Button onClick={() => audioController.current?.pause()}>
            Pause
          </Button>
        </>
      }
      right={
        <>
          Details pane
        </>
      } />
  );
}
