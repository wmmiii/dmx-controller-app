import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import styles from "./ShowPage.module.scss";
import { ProjectContext } from '../contexts/ProjectContext';
import { Show } from '@dmx-controller/proto/show_pb';
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { SerialContext } from '../contexts/SerialContext';
import { Button } from '../components/Button';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { HorizontalSplitPane } from '../components/SplitPane';
import { renderUniverse } from '../engine/show';

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
        defaultChannelValues: [
          {
            name: 'Light mode',
            output: {
              value: 0,
              case: 'physicalFixtureId',
            },
            channels: [
              {
                index: 5,
                value: 0,
              },
              {
                index: 6,
                value: 255,
              },
            ]
          },
        ],
        lightTracks: [
          {
            name: 'Fixture',
            output: {
              value: 0,
              case: 'physicalFixtureId',
            },
            layers: [
              {
                effects: [
                  {
                    startMs: 0,
                    endMs: 1000,
                    effect: {
                      value: {
                        r: 1,
                        g: 0,
                        b: 0,
                      },
                      case: 'colorEffect',
                    }
                  },
                  {
                    startMs: 1000,
                    endMs: 2000,
                    effect: {
                      value: {
                        r: 0,
                        g: 1,
                        b: 0,
                      },
                      case: 'colorEffect',
                    }
                  },
                  {
                    startMs: 2000,
                    endMs: 3000,
                    effect: {
                      value: {
                        r: 0,
                        g: 0,
                        b: 1,
                      },
                      case: 'colorEffect',
                    }
                  },
                ]
              }
            ]
          },
        ],
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
    if (!project) {
      return;
    }

    const render = () => renderUniverse(t.current, project);
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, playing, t]);

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
