import React, { JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import IconBxPulse from '../icons/IconBxPulse';
import IconBxZoomIn from '../icons/IconBxZoomin';
import IconBxZoomOut from '../icons/IconBxZoomOut';
import styles from "./ShowPage.module.scss";
import { AudioController, AudioTrackVisualizer } from '../components/AudioTrackVisualizer';
import { AudioFile } from '@dmx-controller/proto/audio_pb';
import { Show, Show_AudioTrack } from '@dmx-controller/proto/show_pb';
import { Button } from '../components/Button';
import { EffectDetails, EffectSelectContext, SelectedEffect } from '../components/Effect';
import { HorizontalSplitPane } from '../components/SplitPane';
import { LightTrack } from '../components/LightTrack';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { renderUniverse } from '../engine/show';
import { Modal } from '../components/Modal';

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
        left={<Tracks />}
        right={<DetailsPane />} />
    </EffectSelectContext.Provider>
  );
}

function Tracks(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [playing, setPlaying] = useState(false);
  const audioController = useRef<AudioController>();
  const t = useRef<number>(0);
  const [tState, setTState] = useState(0);

  const [leftWidth, _setLeftWidth] = useState(180);
  const [visible, setVisible] = useState({ startMs: 0, endMs: 1000 });
  const setVisibleCallback = useCallback(
    (startMs: number, endMs: number) => setVisible({ startMs, endMs }),
    [setVisible]);
  const [minPxPerSec, setMinPxPerSec] = useState(32);
  const [snapToBeat, setSnapToBeat] = useState(true);
  const [beatSubdivisions, setBeatSubdivisions] = useState(1);

  const setAudioController = useCallback(
    (c: AudioController) => audioController.current = c,
    [audioController]);
  const setT = useCallback((ts: number) => {
    t.current = ts;
    setTState(ts);
  }, [t]);

  const show =
    useMemo(() => project?.shows[project.selectedShow || 0], [project]);

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

  const beatMetadata = useMemo(() => {
    return project?.assets.audioFiles[show.audioTrack.audioFileId].beatMetadata;
  }, [project, show]);

  let beatNumber: number | undefined;
  if (beatMetadata) {
    beatNumber = Math.floor(
      (tState - beatMetadata.offsetMs) /
      beatMetadata.lengthMs) + 1;
  } else {
    beatNumber = undefined;
  }

  const nearestBeat = useCallback((t: number) => {
    if (beatMetadata) {
      const lengthMs = beatMetadata.lengthMs / beatSubdivisions;
      const beatNumber = Math.round((t - beatMetadata.offsetMs) / lengthMs);
      return Math.floor(beatMetadata.offsetMs + beatNumber * lengthMs);
    }
    return undefined;
  }, [beatMetadata, beatSubdivisions]);

  return (
    <div className={styles.trackContainer}>
      <div className={styles.timelineOptions}>
        <div className={styles.meta} style={{ width: leftWidth }}>
          Show:
          <br />
          <select
            onChange={(e) => {
              if (e.target.value === '-1') {
                project.shows.push(DEFAULT_SHOW);
                project.selectedShow = project.shows.length - 1;
                save();
              } else {
                project.selectedShow = parseInt(e.target.value);
                save();
              }
            }}
            value={project?.selectedShow || 0}>
            {
              project?.shows.map((s: Show, i: number) => (
                <option value={i}>{s.name}</option>
              ))
            }
            <option value={-1}>
              + Create New Show
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
            Subdivide beat&nbsp;
            <input
              disabled={!snapToBeat}
              type="number"
              min="1"
              max="16"
              value={beatSubdivisions}
              onChange={(e) => setBeatSubdivisions(parseInt(e.target.value))} />
          </span>
          <div className={styles.spacer}></div>
          <span>
            MS: {Math.floor(tState)}
          </span>
          {
            beatNumber != null &&
            <span>
              Beat number: {beatNumber}
            </span>
          }
        </div>
      </div>
      <div className={styles.audioVisualizer}>
        <div className={styles.meta} style={{ width: leftWidth }}>
          <Button onClick={() => setShowDetailsModal(true)}>
            Show Details
          </Button>
          Audio Track:
          <br />
          <select
            onChange={(e) => {
              show.audioTrack = new Show_AudioTrack({
                audioFileId: parseInt(e.target.value),
              });
              save();
            }}
            value={show?.audioTrack.audioFileId}>
            {
              project?.assets.audioFiles.map((f: AudioFile, i: number) => (
                <option value={i}>
                  {f.name}
                </option>
              ))
            }
          </select>
        </div>
        <AudioTrackVisualizer
          className={styles.right}
          fileId={show?.audioTrack.audioFileId || 0}
          setController={setAudioController}
          setPlaying={setPlaying}
          setVisible={setVisibleCallback}
          minPxPerSec={minPxPerSec}
          beatSubdivisions={beatSubdivisions}
          onProgress={setT} />
      </div>
      <div className={styles.lightTracks}>
        {
          show?.lightTracks.map(t => (
            <LightTrack
              track={t}
              leftWidth={leftWidth}
              visible={visible}
              nearestBeat={snapToBeat ? nearestBeat : undefined}
              forceUpdate={save} />
          ))
        }
      </div>
      {
        showDetailsModal &&
        <Modal
          title={show?.name + ' Metadata'}
          onClose={() => setShowDetailsModal(false)}>
          <div className={styles.detailsModal}>
            <div>
              Title:&nbsp;
              <input
                type="text"
                value={show?.name}
                onChange={(e) => {
                  show.name = e.target.value;
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
                  project.shows.splice(project.selectedShow, 1);
                  project.selectedShow = 0;
                  save();
                  setShowDetailsModal(false)
                }}>
                Delete Show
              </Button>&nbsp;
              Cannot be undone!
            </div>
          </div>
        </Modal>
      }
    </div>
  )
}


function DetailsPane(): JSX.Element {
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
      className={styles.effectDetails}
      effect={selectedEffect}
      onChange={save} />
  );
}
