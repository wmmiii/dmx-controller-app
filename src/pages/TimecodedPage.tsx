import {
  TimecodedShow,
  TimecodedShow_AudioTrackSchema,
  TimecodedShow_Output,
  TimecodedShow_OutputSchema,
  TimecodedShowSchema,
} from '@dmx-controller/proto/timecoded_pb';
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  BiChevronDown,
  BiChevronUp,
  BiGridVertical,
  BiPause,
  BiPlay,
  BiPlus,
  BiTrash,
  BiTrashAlt,
} from 'react-icons/bi';
import {
  getCurrentTimeMs,
  getPlaybackStatus,
  load,
  pause,
  play,
  seek,
} from '../audio/audioTrackRegistry';
import { Button, IconButton } from '../components/Button';
import { EditableText } from '../components/Input';
import { Tabs, TabsType } from '../components/Tabs';
import { ProjectContext } from '../contexts/ProjectContext';
import { usePlaybackStatus } from '../hooks/playbackStatus';
import { useWaveform } from '../hooks/waveform';

import { create } from '@bufbuild/protobuf';
import {
  getOutputTargetName,
  OutputSelector,
} from '../components/OutputSelector';
import { Select } from '../components/Select';
import { Spacer } from '../components/Spacer';
import { Waveform } from '../components/Waveform';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { randomUint64 } from '../util/numberUtils';
import { listenToTick } from '../util/time';
import { getTrackBeatConverters, preloadWasm } from '../wasm/engine';
import styles from './TimecodedPage.module.css';

const NEW_SHOW_KEY = 'new';

export function TimecodedPage() {
  const { project, save } = useContext(ProjectContext);

  const showTabs = useMemo(() => {
    const tabs: TabsType = {};

    for (const [showId, show] of Object.entries(project.shows).sort(
      ([_a, a], [_b, b]) => a.name.localeCompare(b.name),
    )) {
      tabs[showId] = {
        name: (
          <>
            <EditableText
              value={show.name}
              onChange={(name) => {
                show.name = name;
                save(`Change name of timecoded show to ${name}.`);
              }}
            />
            {project.selectedShow === BigInt(showId) && (
              <BiTrash
                size="1em"
                onClick={(ev) => {
                  delete project.shows[showId];

                  project.selectedShow = 0n;
                  save(`Delete timecoded show ${show.name}.`);
                  ev.stopPropagation();
                }}
              />
            )}
          </>
        ),
        contents: <TimecodedBody show={show} />,
      };
    }

    tabs[NEW_SHOW_KEY] = {
      name: <BiPlus />,
      contents: <></>,
    };

    return tabs;
  }, [project.shows, project.selectedShow]);

  return (
    <Tabs
      className={styles.wrapper}
      tabs={showTabs}
      selectedTab={String(project.selectedShow)}
      setSelectedTab={(showId) => {
        if (showId === NEW_SHOW_KEY) {
          const id = randomUint64();
          project.shows[String(id)] = create(TimecodedShowSchema, {
            name: 'New Show',
            colorPalette: DEFAULT_COLOR_PALETTE,
            outputs: [],
          });
          project.selectedShow = id;
          save('Add new timecoded show.');
          return;
        }

        const showName = project.shows[showId].name;
        project.selectedShow = BigInt(showId);

        save(`Select timecoded show ${showName}.`);
      }}
    />
  );
}

interface TimecodedBodyProps {
  show: TimecodedShow;
}

function TimecodedBody({ show }: TimecodedBodyProps) {
  const { project, save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const dragIndex = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const reorderToPointer = (clientY: number) => {
    const from = dragIndex.current;
    const container = scrollRef.current;
    if (from == null || container == null) {
      return;
    }

    const rows = container.querySelectorAll<HTMLElement>('[data-track-meta]');
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      if (clientY < rows[i].getBoundingClientRect().bottom) {
        target = i;
        break;
      }
    }

    if (target === from) {
      return;
    }

    const [moved] = show.outputs.splice(from, 1);
    show.outputs.splice(target, 0, moved);
    dragIndex.current = target;
    forceRender();
    update();
  };
  const [viewStart, setViewStart] = useState<number>(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [wasmReady, setWasmReady] = useState(false);
  const lanePlayheadRef = useRef<HTMLDivElement>(null);
  const placeholderOutputs = Array.from({ length: 24 }, (_, i) => i);

  const trackId = show.audioTrack?.trackId;
  const track = useMemo(() => {
    if (!trackId) {
      return undefined;
    }

    return project.tracks[String(trackId)];
  }, [project]);

  const playbackStatus = usePlaybackStatus(trackId ?? 0n);
  const playing = playbackStatus === 'playing';
  const loaded = playing || playbackStatus === 'paused';

  useEffect(() => {
    preloadWasm().then(() => setWasmReady(true));
  }, []);

  useEffect(() => {
    if (trackId == null) {
      return;
    }
    load(project, trackId).catch((error) =>
      console.error('Failed to load track', trackId, error),
    );
  }, [project, trackId]);

  useEffect(() => {
    if (trackId == null) {
      return;
    }
    return () => {
      if (getPlaybackStatus(trackId) === 'playing') {
        pause(trackId);
      }
    };
  }, [trackId]);

  const beatConverters =
    wasmReady && track ? getTrackBeatConverters(track) : null;

  const waveformQuery = useWaveform(track);

  useEffect(() => {
    setViewStart(0);
    setViewEnd(Number(waveformQuery.data?.durationMs) || null);
  }, [waveformQuery.data?.durationMs]);

  useEffect(() => {
    if (trackId == null || viewEnd == null) {
      return;
    }

    return listenToTick(() => {
      const playhead = lanePlayheadRef.current;
      if (!playhead) {
        return;
      }

      const playheadMs = getCurrentTimeMs(trackId);
      const visible =
        playheadMs != null &&
        playheadMs >= viewStart &&
        playheadMs <= viewEnd &&
        viewEnd > viewStart;
      if (visible) {
        const ratio = (playheadMs - viewStart) / (viewEnd - viewStart);
        playhead.style.left = `${ratio * 100}%`;
        playhead.style.display = '';
      } else {
        playhead.style.display = 'none';
      }
    });
  }, [trackId, viewStart, viewEnd]);

  useEffect(() => {
    if (!trackId) {
      return;
    }

    return setShortcuts([
      {
        shortcut: {
          key: 'Space',
        },
        action: () => (playing ? pause(trackId) : play(trackId)),
        description: playing ? 'Pause show.' : 'Play show.',
      },
    ]);
  }, [trackId, setShortcuts, playing, pause, play]);

  return (
    <div className={styles.body}>
      <div className={styles.showMeta}>
        <Select
          value={String(show.audioTrack?.trackId)}
          onChange={(trackId) => {
            if (show.audioTrack == null) {
              show.audioTrack = create(TimecodedShow_AudioTrackSchema, {
                trackId: BigInt(trackId),
              });
            } else {
              show.audioTrack.trackId = BigInt(trackId);
            }
            const track = project.tracks[trackId]!;
            save(`Set track of ${show.name} to ${track.name}.`);
          }}
          options={Object.entries(project.tracks).map(([trackId, track]) => ({
            value: trackId,
            label: track.name,
          }))}
          placeholder="Select track"
        />
        <IconButton
          title={playing ? 'pause' : 'play'}
          disabled={!loaded}
          onClick={() => {
            if (trackId == null) {
              return;
            }
            if (playing) {
              pause(trackId);
            } else {
              play(trackId);
            }
          }}
        >
          {playing ? <BiPause /> : <BiPlay />}
        </IconButton>
      </div>
      <div className={styles.waveform}>
        {track == null ? (
          <div className={styles.loading}>
            Please select a track for this show.
          </div>
        ) : waveformQuery.isSuccess && viewEnd !== null ? (
          <Waveform
            className={styles.waveformDisplay}
            waveformData={waveformQuery.data}
            startMs={viewStart}
            endMs={viewEnd}
            msToBeat={beatConverters?.msToBeat}
            beatToMs={beatConverters?.beatToMs}
            onViewChange={(startMs, endMs) => {
              setViewStart(startMs);
              setViewEnd(endMs);
            }}
            onSeek={(timeMs) => seek(trackId!, timeMs)}
            playing={playing}
            getPlayheadMs={() => getCurrentTimeMs(trackId!)}
          />
        ) : (
          <div>Loading...</div>
        )}
      </div>
      <div ref={scrollRef} className={styles.trackScrollable}>
        {show.outputs.map((output, idx) => (
          <Fragment key={idx}>
            <TrackMeta
              output={output}
              onReorderStart={() => {
                dragIndex.current = idx;
              }}
              onReorderMove={reorderToPointer}
              onReorderEnd={() => {
                if (dragIndex.current == null) {
                  return;
                }
                dragIndex.current = null;
                save(`Reorder tracks in show ${show.name}.`);
              }}
              onDelete={() => {
                show.outputs.splice(idx, 1);
                save(`Remove track from show ${show.name}.`);
              }}
            />
            <div className={styles.trackLane}>Timeline lane</div>
          </Fragment>
        ))}
        <div className={styles.newLayer}>
          <Button
            icon={<BiPlus />}
            variant="primary"
            onClick={() => {
              show.outputs.push(
                create(TimecodedShow_OutputSchema, {
                  collapsed: false,
                  outputTarget: {
                    output: {
                      case: undefined,
                      value: undefined,
                    },
                  },
                  layer: {
                    effects: [],
                  },
                }),
              );
              save('Add new layer to timecoded show.');
            }}
          >
            Add track
          </Button>
        </div>
      </div>
      {trackId != null && (
        <div className={styles.lanePlayheadOverlay}>
          <div
            ref={lanePlayheadRef}
            className={styles.lanePlayhead}
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  );
}

interface TrackMetaProps {
  output: TimecodedShow_Output;
  onReorderStart: () => void;
  onReorderMove: (clientY: number) => void;
  onReorderEnd: () => void;
  onDelete: () => void;
}

function TrackMeta({
  output,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onDelete,
}: TrackMetaProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.trackMeta} data-track-meta>
      <div className={styles.metaRow}>
        <span
          className={styles.dragHandle}
          title="Drag to reorder tracks"
          onPointerDown={(ev) => {
            ev.preventDefault();
            ev.currentTarget.setPointerCapture(ev.pointerId);
            onReorderStart();
          }}
          onPointerMove={(ev) => {
            if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
              onReorderMove(ev.clientY);
            }
          }}
          onPointerUp={(ev) => {
            ev.currentTarget.releasePointerCapture(ev.pointerId);
            onReorderEnd();
          }}
          onPointerCancel={onReorderEnd}
        >
          <BiGridVertical />
        </span>
        <EditableText
          className={styles.trackName}
          value={
            output.name || getOutputTargetName(project, output.outputTarget)
          }
          onChange={(name) => {
            if (name) {
              output.name = name;
              save(`Rename track to ${name}.`);
            } else {
              output.name = '';
              save('Remove name from track');
            }
          }}
        />
        <IconButton
          title={(output.collapsed ? 'Expand' : 'Collapse') + ' track'}
          onClick={() => {
            output.collapsed = !output.collapsed;
            save((output.collapsed ? 'Expand' : 'Collapse') + ' track.');
          }}
        >
          {output.collapsed ? <BiChevronDown /> : <BiChevronUp />}
        </IconButton>
      </div>
      {!output.collapsed && (
        <div className={styles.metaRow}>
          <OutputSelector
            value={output.outputTarget}
            setValue={(target) => {
              output.outputTarget = target;
              const name = getOutputTargetName(project, target);
              save(`Set track output to ${name}`);
            }}
          />
          <Spacer />
          <IconButton variant="warning" title="Delete track" onClick={onDelete}>
            <BiTrashAlt />
          </IconButton>
        </div>
      )}
    </div>
  );
}
