import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import IconBxPulse from '../icons/IconBxPulse';
import IconBxZoomIn from '../icons/IconBxZoomin';
import IconBxZoomOut from '../icons/IconBxZoomOut';
import styles from "./ShowPage.module.scss";
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { Button } from '../components/Button';
import { EffectDetails, EffectSelectContext, SelectedEffect } from '../components/Effect';
import { HorizontalSplitPane } from '../components/SplitPane';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { Show } from '@dmx-controller/proto/show_pb';
import { renderUniverse } from '../engine/show';
import { LightTrack } from '../components/LightTrack';

const DEFAULT_SHOW = new Show({
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
                  state: {
                    color: {
                      value: {
                        red: 1,
                        green: 0,
                        blue: 0,
                      },
                      case: 'rgb',
                    },
                  },
                },
                case: 'staticEffect',
              }
            },
            {
              startMs: 1000,
              endMs: 2000,
              effect: {
                value: {
                  state: {
                    color: {
                      value: {
                        red: 0,
                        green: 1,
                        blue: 0,
                      },
                      case: 'rgb',
                    },
                  }
                },
                case: 'staticEffect',
              }
            },
            {
              startMs: 2000,
              endMs: 3000,
              effect: {
                value: {
                  state: {
                    color: {
                      value: {
                        red: 0,
                        green: 0,
                        blue: 1,
                      },
                      case: 'rgb',
                    },
                  },
                },
                case: 'staticEffect',
              }
            },
          ]
        }
      ]
    },
  ],
});

export default function ShowPage(): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const [selectedEffect, setSelectedEffect] = useState<SelectedEffect | null>(null);

  const [_lastUpdate, setLastUpdate] = useState(new Date().getTime());
  const forceUpdate = () => setLastUpdate(new Date().getTime());

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
        left={<Tracks forceUpdate={forceUpdate} />}
        right={<DetailsPane forceUpdate={forceUpdate} />} />
    </EffectSelectContext.Provider>
  );
}

interface PaneProps {
  forceUpdate: () => void;
}

function Tracks({ forceUpdate }: PaneProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const t = useRef<number>(0);

  const [leftWidth, _setLeftWidth] = useState(180);
  const [visible, setVisible] = useState({ startMs: 0, endMs: 1000 });
  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({ startMs, endMs }),
    [setVisible]);
  const [minPxPerSec, setMinPxPerSec] = useState(128);
  const [snapToBeat, setSnapToBeat] = useState(true);
  const [beatSubdivisions, setBeatSubdivisions] = useState(1);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => t.current = ts, [t]);

  const show = useMemo(() => project?.show, [project]);

  useEffect(() => {
    if (project && !show && project.assets?.audioFiles.length > 0) {
      project.show = DEFAULT_SHOW
      save();
    }
  }, [project, show]);

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
  ]), [audioController.current, playing]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderUniverse(t.current, project);
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [project, playing, t]);

  const nearestBeat = useCallback((t: number) => {
    if (project?.assets.audioFiles[0]?.beatMetadata) {
      const beatMetadata = project.assets.audioFiles[0].beatMetadata;
      const lengthMs = beatMetadata.lengthMs / beatSubdivisions;
      const beatNumber = Math.round((t - beatMetadata.offsetMs) / lengthMs);
      return Math.floor(beatMetadata.offsetMs + beatNumber * lengthMs);
    }
    return undefined;
  }, [project, beatSubdivisions]);

  return (
    <div className={styles.trackContainer}>
      <div className={styles.audioVisualizer}>
        <div className={styles.left} style={{ width: leftWidth }}></div>
        <AudioTrackVisualizer
          className={styles.right}
          fileId={0}
          setController={setAudioController}
          setPlaying={setPlaying}
          setVisible={setVisibleCallback}
          minPxPerSec={minPxPerSec}
          beatSubdivisions={beatSubdivisions}
          onProgress={setT} />
      </div>
      <div className={styles.timelineOptions}>
        <div className={styles.left} style={{ width: leftWidth }}></div>
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
            <input
              disabled={!snapToBeat}
              type="number"
              min="1"
              max="16"
              value={beatSubdivisions}
              onChange={(e) => setBeatSubdivisions(parseInt(e.target.value))} />
          </span>
        </div>
      </div>
      <div className={styles.lightTracks}>
        {
          show?.lightTracks.map(t => (
            <LightTrack
              track={t}
              leftWidth={leftWidth}
              visible={visible}
              nearestBeat={snapToBeat ? nearestBeat : undefined}
              forceUpdate={forceUpdate} />
          ))
        }
      </div>
    </div>
  )
}


function DetailsPane({ forceUpdate }: PaneProps): JSX.Element {
  const { selectedEffect, selectEffect } = useContext(EffectSelectContext);

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
      onChange={forceUpdate} />
  );
}
