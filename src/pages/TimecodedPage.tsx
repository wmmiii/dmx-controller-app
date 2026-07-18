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
  subscribeToPlayback,
} from '../audio/audioTrackRegistry';
import { Button, IconButton } from '../components/Button';
import { EditableText } from '../components/Input';
import { Tabs, TabsType } from '../components/Tabs';
import { ProjectContext } from '../contexts/ProjectContext';
import { usePlaybackStatus } from '../hooks/playbackStatus';
import { useWaveform } from '../hooks/waveform';

import { clone, create } from '@bufbuild/protobuf';
import { EffectSchema, LayerSchema } from '@dmx-controller/proto/effect_pb';
import { RenderMode_TimecodedShow } from '@dmx-controller/proto/render_pb';
import clsx from 'clsx';
import {
  getOutputTargetName,
  OutputSelector,
} from '../components/OutputSelector';
import { Select } from '../components/Select';
import { Spacer } from '../components/Spacer';
import { EffectDetails } from '../components/TimecodeEffect';
import { LaneDragMask, TrackLane } from '../components/TrackLane';
import { Waveform } from '../components/Waveform';
import { useClipboard } from '../contexts/ClipboardContext';
import { EffectRenderingContext } from '../contexts/EffectRenderingContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { getAvailableChannels } from '../engine/fixtures/fixture';
import { useLaneInteraction } from '../hooks/laneInteraction';
import { useRenderMode } from '../hooks/renderMode';
import { useTimelineScroll } from '../hooks/timelineScroll';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { randomUint64 } from '../util/numberUtils';
import { listenToTick } from '../util/time';
import {
  DEFAULT_BEAT_SUBDIVISIONS,
  msWidthToPxWidth,
  snapPointsMs,
  visibleSubdivisions,
} from '../util/timecodeUtils';
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
  const {
    get: getClipboard,
    set: setClipboard,
    has: hasClipboard,
  } = useClipboard();
  const dragIndex = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [viewStart, setViewStart] = useState<number>(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [wasmReady, setWasmReady] = useState(false);
  const [laneWidthPx, setLaneWidthPx] = useState(0);
  const [selectedAddress, setSelectedAddress] = useState<{
    laneIndex: number;
    effectIndex: number;
  } | null>(null);
  const lanePlayheadRef = useRef<HTMLDivElement>(null);
  const laneOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = laneOverlayRef.current;
    if (overlay == null) {
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setLaneWidthPx(overlay.getBoundingClientRect().width),
    );
    observer.observe(overlay);
    setLaneWidthPx(overlay.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const trackId = show.audioTrack?.trackId;
  const track = useMemo(() => {
    if (!trackId) {
      return undefined;
    }

    return project.tracks[String(trackId)];
  }, [project]);

  const [timecodedState, setTimecodedState] = useState<
    RenderMode_TimecodedShow['state']
  >({ case: undefined });
  useEffect(() => {
    if (trackId == null) {
      return;
    }

    return subscribeToPlayback(trackId, (state) => {
      const t = getCurrentTimeMs(trackId);
      if (t == null) {
        setTimecodedState({ case: undefined });
        return;
      }

      switch (state.status) {
        case 'paused':
          setTimecodedState({
            case: 'pausedMs',
            value: Math.round(t),
          });
          break;
        case 'playing':
          setTimecodedState({
            case: 'startT',
            value: BigInt(Math.round(Date.now() - t)),
          });
          break;
        default:
          setTimecodedState({ case: undefined });
      }
    });
  }, [trackId]);

  useRenderMode(
    {
      mode: {
        case: 'timecodedShow',
        value: {
          showId: project.selectedShow,
          state: timecodedState,
        },
      },
    },
    [project.selectedShow, timecodedState],
  );

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

  const viewport = {
    viewStartMs: viewStart,
    viewEndMs: viewEnd ?? 0,
    widthPx: laneWidthPx,
  };
  const subdivisions = visibleSubdivisions(
    viewport,
    beatConverters,
    DEFAULT_BEAT_SUBDIVISIONS,
  );
  const snapPoints = snapPointsMs(
    beatConverters,
    subdivisions,
    viewStart,
    viewEnd ?? 0,
  );
  const boundsEndMs =
    Number(waveformQuery.data?.durationMs) || Number.MAX_SAFE_INTEGER;

  const selectedEffect =
    selectedAddress == null
      ? null
      : (show.outputs[selectedAddress.laneIndex]?.layer?.effects[
          selectedAddress.effectIndex
        ] ?? null);

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
    setSelectedAddress((address) => {
      if (address == null) {
        return address;
      }
      let laneIndex = address.laneIndex;
      if (laneIndex === from) {
        laneIndex = target;
      } else {
        if (laneIndex > from) {
          laneIndex--;
        }
        if (laneIndex >= target) {
          laneIndex++;
        }
      }
      return { ...address, laneIndex };
    });
    forceRender();
    update();
  };

  const getLaneEffects = (laneIndex: number) => {
    const output = show.outputs[laneIndex];
    if (output.layer == null) {
      output.layer = create(LayerSchema, { effects: [] });
    }
    return output.layer.effects;
  };

  const drag = useLaneInteraction(
    getLaneEffects,
    viewport,
    () =>
      Array.from(
        scrollRef.current?.querySelectorAll<HTMLElement>('[data-track-lane]') ??
          [],
      ).map((lane) => lane.getBoundingClientRect()),
    laneOverlayRef,
    beatConverters,
    snapPoints,
    boundsEndMs,
    (laneIndex, effectIndex) => setSelectedAddress({ laneIndex, effectIndex }),
  );

  useTimelineScroll(
    scrollRef,
    laneOverlayRef,
    viewStart,
    viewEnd ?? 0,
    Number(waveformQuery.data?.durationMs) || 0,
    (startMs, endMs) => {
      setViewStart(startMs);
      setViewEnd(endMs);
    },
    true,
    viewEnd != null,
  );

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

  const copiedEffect = getClipboard(EffectSchema);
  useEffect(() => {
    if (!trackId) {
      return;
    }

    const shortcuts: Parameters<typeof setShortcuts>[0] = [
      {
        shortcut: {
          key: 'Space',
        },
        action: () => (playing ? pause(trackId) : play(trackId)),
        description: playing ? 'Pause show.' : 'Play show.',
      },
    ];

    console.log('Selected effect set', selectedEffect);
    if (selectedEffect?.effect) {
      shortcuts.push({
        shortcut: {
          key: 'KeyC',
          modifiers: ['ctrl'],
        },
        action: () => {
          setClipboard(selectedEffect.effect!);
        },
        description: 'Copy effect.',
      });

      if (copiedEffect) {
        shortcuts.push({
          shortcut: {
            key: 'KeyV',
            modifiers: ['ctrl'],
          },
          action: () => {
            selectedEffect.effect = clone(EffectSchema, copiedEffect);
            save('Paste effect.');
          },
          description: 'Paste effect.',
        });
      }
    }

    return setShortcuts(shortcuts);
  }, [
    trackId,
    selectedEffect,
    copiedEffect,
    setShortcuts,
    playing,
    pause,
    play,
  ]);

  useEffect(() => {
    if (selectedAddress == null) {
      return undefined;
    }

    return setShortcuts([
      {
        shortcut: { key: 'Delete' },
        action: () => {
          const effects =
            show.outputs[selectedAddress.laneIndex]?.layer?.effects;
          if (effects != null && selectedAddress.effectIndex < effects.length) {
            effects.splice(selectedAddress.effectIndex, 1);
            save('Delete effect.');
          }
          setSelectedAddress(null);
        },
        description: 'Delete the currently selected effect.',
      },
      {
        shortcut: { key: 'Escape' },
        action: () => setSelectedAddress(null),
        description: 'Deselect effect.',
      },
    ]);
  }, [selectedAddress, show, save, setShortcuts]);

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
            subdivisions={subdivisions}
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
      {selectedEffect?.effect ? (
        <EffectDetails
          className={styles.effectEditor}
          effect={selectedEffect.effect}
          availableChannels={getAvailableChannels(
            show.outputs[selectedAddress!.laneIndex].outputTarget,
            project,
          )}
          showPhase={true}
        />
      ) : (
        <div className={clsx(styles.effectEditor, styles.empty)}>
          Select effect to edit
        </div>
      )}
      <div ref={scrollRef} className={styles.trackScrollable}>
        <EffectRenderingContext.Provider
          value={{
            beatWidthPx: beatConverters
              ? msWidthToPxWidth(
                  viewport,
                  beatConverters.beatToMs(1) - beatConverters.beatToMs(0),
                )
              : 100,
            msToPx: (ms) => msWidthToPxWidth(viewport, ms),
            beatConverters,
          }}
        >
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
                  setSelectedAddress(null);
                  save(`Remove track from show ${show.name}.`);
                }}
              />
              <TrackLane
                className={styles.trackLane}
                laneIndex={idx}
                layer={output.layer ?? create(LayerSchema, {})}
                viewport={viewport}
                drag={drag}
                selectedEffect={selectedEffect}
                onSelectEffect={(effectIndex) =>
                  setSelectedAddress({ laneIndex: idx, effectIndex })
                }
              />
            </Fragment>
          ))}
        </EffectRenderingContext.Provider>
        <div className={styles.newLayer}>
          <Button
            icon={<BiPlus />}
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
      <div ref={laneOverlayRef} className={styles.laneOverlay}>
        {trackId != null && (
          <div
            ref={lanePlayheadRef}
            className={styles.lanePlayhead}
            style={{ display: 'none' }}
          />
        )}
      </div>
      <LaneDragMask interaction={drag} />
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
