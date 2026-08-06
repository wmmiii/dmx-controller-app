import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BiChevronDown,
  BiChevronUp,
  BiCog,
  BiPause,
  BiPlus,
  BiSkipNext,
  BiSkipPrevious,
  BiTrash,
} from 'react-icons/bi';
import { EditableText, NumberInput } from '../components/Input';
import { Tabs, TabsType } from '../components/Tabs';
import { ProjectContext } from '../contexts/ProjectContext';

import { create } from '@bufbuild/protobuf';
import {
  PatternSchema,
  Playlist,
  Playlist_HoldSchema,
  Playlist_SequentialSchema,
  Playlist_ShuffleSchema,
  PlaylistSchema,
} from '@dmx-controller/proto/autopilot_pb';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import { Browser, Outlet } from '../components/Browser';
import { Button, IconButton } from '../components/Button';
import { EffectGroupEditor } from '../components/EffectGroupEditor';
import { PaletteSwatch } from '../components/Palette';
import { Popover } from '../components/Popover';
import { Select } from '../components/Select';
import { useRenderMode } from '../hooks/renderMode';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { randomUint64 } from '../util/numberUtils';
import { sortedEntries } from '../util/sortUtils';
import { listenToTick } from '../util/time';
import { getActivePlaylistSelection } from '../wasm/engine';
import styles from './AutopilotPage.module.css';

const NEW_PLAYLIST_KEY = 'new';

export function AutopilotPage() {
  const { project, save } = useContext(ProjectContext);

  useRenderMode(
    {
      mode: {
        case: 'autopilot',
        value: {
          playlistId: project.activePlaylist,
        },
      },
    },
    [project.activePlaylist],
  );

  const addNewPlaylist = useCallback(() => {
    const id = randomUint64();
    project.playlists[String(id)] = create(PlaylistSchema, {
      name: 'New Playlist',
      dwellMs: 5 * 60 * 1_000,
      transitionMs: 15 * 1_000,
      patterns: [
        {
          id: randomUint64(),
          name: 'New Pattern',
          targetedEffects: [],
        },
      ],
      patternOrder: {
        case: 'patternSequential',
        value: {},
      },
      palettes: [
        create(ColorPaletteSchema, {
          ...DEFAULT_COLOR_PALETTE,
          id: randomUint64(),
        }),
      ],
      paletteOrder: {
        case: 'paletteSequential',
        value: {},
      },
    });
    project.activePlaylist = id;
    save('Add new autopilot playlist.');
  }, [project, save]);

  // Initialize playlists if there are none.
  useEffect(() => {
    if (Object.entries(project.playlists).length === 0) {
      addNewPlaylist();
    }
  }, [project, addNewPlaylist]);

  const playlistTabs = useMemo(() => {
    const tabs: TabsType = {};

    for (const [playlistId, playlist] of sortedEntries(project.playlists)) {
      tabs[playlistId] = {
        name: (
          <>
            <EditableText
              value={playlist.name}
              onChange={(name) => {
                playlist.name = name;
                save(`Change name of autopilot playlist to ${name}.`);
              }}
            />
            {project.activePlaylist === BigInt(playlistId) && (
              <BiTrash
                size="1em"
                onClick={(ev) => {
                  delete project.playlists[playlistId];

                  project.activePlaylist = 0n;
                  save(`Delete autopilot playlist ${playlist.name}.`);
                  ev.stopPropagation();
                }}
              />
            )}
          </>
        ),
        contents: <PlaylistBody playlist={playlist} />,
      };
    }

    tabs[NEW_PLAYLIST_KEY] = {
      name: <BiPlus />,
      contents: <></>,
    };

    return tabs;
  }, [project.shows, project.activePlaylist]);

  return (
    <Tabs
      className={styles.wrapper}
      tabs={playlistTabs}
      selectedTab={String(project.activePlaylist)}
      setSelectedTab={(playlistId) => {
        if (playlistId === NEW_PLAYLIST_KEY) {
          addNewPlaylist();
          return;
        }

        const playlistName = project.playlists[playlistId].name;
        project.activePlaylist = BigInt(playlistId);

        save(`Select autopilot playlist ${playlistName}.`);
      }}
    />
  );
}

interface PlaylistBodyProps {
  playlist: Playlist;
}

function PlaylistBody({ playlist }: PlaylistBodyProps) {
  const { save: projectSave } = useContext(ProjectContext);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const pattern = useMemo(() => {
    return playlist.patterns.find((p) => p.id === selectedId) ?? null;
  }, [playlist, selectedId]);

  const patternProgressRefs = useRef(new Map<string, HTMLDivElement>());
  const paletteProgressRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    // Drives the progress bar for one collection (patterns or palettes). Each
    // bar spans its item's full visible life: it fades in during the previous
    // cycle's transition, dwells, then fades out during its own transition, so
    // an outgoing and incoming item overlap. Held items stay filled.
    const updateBars = (
      selection: ReturnType<typeof getActivePlaylistSelection>,
      isHold: boolean,
      items: Array<{ id: bigint }>,
      refs: Map<string, HTMLDivElement>,
    ) => {
      const lifespanMs = playlist.dwellMs + 2 * playlist.transitionMs;
      items.forEach((item, idx) => {
        const bar = refs.get(String(item.id));
        if (!bar) {
          return;
        }
        let fraction = 0;
        if (selection != null) {
          if (isHold) {
            fraction = idx === selection.currentIndex ? 1 : 0;
          } else if (lifespanMs > 0) {
            if (idx === selection.currentIndex) {
              fraction =
                (playlist.transitionMs + selection.positionMs) / lifespanMs;
            } else if (
              idx === selection.nextIndex &&
              selection.positionMs >= playlist.dwellMs
            ) {
              fraction = (selection.positionMs - playlist.dwellMs) / lifespanMs;
            }
          }
        }
        bar.style.width = `${Math.min(fraction, 1) * 100}%`;
      });
    };

    return listenToTick(() => {
      const patternOrder = playlist.patternOrder;
      const patternHoldIndex =
        patternOrder.case === 'patternHold'
          ? playlist.patterns.findIndex((p) => p.id === patternOrder.value.id)
          : 0;
      updateBars(
        getActivePlaylistSelection(
          patternOrder.case,
          patternHoldIndex,
          playlist.patterns.length,
          playlist.patternOffsetMs,
          playlist.dwellMs,
          playlist.transitionMs,
        ),
        patternOrder.case === 'patternHold',
        playlist.patterns,
        patternProgressRefs.current,
      );

      const paletteOrder = playlist.paletteOrder;
      const paletteHoldIndex =
        paletteOrder.case === 'paletteHold'
          ? playlist.palettes.findIndex((p) => p.id === paletteOrder.value.id)
          : 0;
      updateBars(
        getActivePlaylistSelection(
          paletteOrder.case,
          paletteHoldIndex,
          playlist.palettes.length,
          playlist.paletteOffsetMs,
          playlist.dwellMs,
          playlist.transitionMs,
        ),
        paletteOrder.case === 'paletteHold',
        playlist.palettes,
        paletteProgressRefs.current,
      );
    });
  }, [playlist]);

  const save = useCallback(
    (changeDescription: string) => {
      projectSave(changeDescription);
    },
    [projectSave],
  );

  const swap = <T,>(items: T[], a: number, b: number, description: string) => {
    [items[a], items[b]] = [items[b], items[a]];
    save(description);
  };

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <Select
          value={playlist.patternOrder.case ?? ''}
          onChange={(v) => {
            if (v === 'patternSequential') {
              playlist.patternOrder = {
                case: 'patternSequential',
                value: create(Playlist_SequentialSchema),
              };
              save(`Set playlist ${playlist.name} pattern to sequential.`);
            } else if (v === 'patternShuffle') {
              playlist.patternOrder = {
                case: 'patternShuffle',
                value: create(Playlist_ShuffleSchema),
              };
              save(`Set playlist ${playlist.name} pattern to shuffle.`);
            }
          }}
          options={[
            {
              label: 'Sequential',
              value: 'patternSequential',
            },
            {
              label: 'Shuffle',
              value: 'patternShuffle',
            },
            {
              label: 'Hold',
              value: 'patternHold',
              disabled: true,
            },
          ]}
        />
        <IconButton title="previous" onClick={() => alert('Unimplemented!')}>
          <BiSkipPrevious />
        </IconButton>
        <IconButton title="next" onClick={() => alert('Unimplemented!')}>
          <BiSkipNext />
        </IconButton>
      </div>
      <div className={styles.controls}>
        <label>
          Dwell (seconds)
          <NumberInput
            title="Dwell"
            mode="seconds"
            value={playlist.dwellMs / 1000}
            onChange={(v) => {
              playlist.dwellMs = Math.floor(v * 1_000);
              save(`Set playlist pattern dwell to ${v} seconds.`);
            }}
          />
        </label>
        <label>
          Transition (seconds)
          <NumberInput
            title="Transition"
            mode="seconds"
            value={playlist.transitionMs / 1000}
            onChange={(v) => {
              playlist.transitionMs = Math.floor(v * 1_000);
              save(`Set playlist pattern transition to ${v} seconds.`);
            }}
          />
        </label>
      </div>
      <div className={styles.controls}>
        <Select
          value={playlist.paletteOrder.case ?? ''}
          onChange={(v) => {
            console.log(v);
            if (v === 'paletteSequential') {
              playlist.paletteOrder = {
                case: 'paletteSequential',
                value: create(Playlist_SequentialSchema),
              };
              save(`Set playlist ${playlist.name} palette to sequential.`);
            } else if (v === 'paletteShuffle') {
              playlist.paletteOrder = {
                case: 'paletteShuffle',
                value: create(Playlist_ShuffleSchema),
              };
              save(`Set playlist ${playlist.name} palette to shuffle.`);
            }
          }}
          options={[
            {
              label: 'Sequential',
              value: 'paletteSequential',
            },
            {
              label: 'Shuffle',
              value: 'paletteShuffle',
            },
            {
              label: 'Hold',
              value: 'paletteHold',
              disabled: true,
            },
          ]}
        />
        <IconButton title="previous" onClick={() => alert('Unimplemented!')}>
          <BiSkipPrevious />
        </IconButton>
        <IconButton title="next" onClick={() => alert('Unimplemented!')}>
          <BiSkipNext />
        </IconButton>
      </div>
      <Browser
        className={styles.browser}
        items={playlist.patterns.map((pattern, idx) => ({
          key: String(pattern.id),
          name: pattern.name,
          setName: (name) => {
            const oldName = pattern.name;
            pattern.name = name;
            save(`Rename pattern '${oldName}' to '${name}'.`);
          },
          selected: pattern.id === selectedId,
          onSelect: () => setSelectedId(pattern.id),
          element: (
            <div className={styles.progressItem}>
              <div className={styles.progressRow}>
                <div className={styles.progressName}>
                  <Outlet />
                </div>
                <span onClick={(ev) => ev.stopPropagation()}>
                  <PatternControls playlist={playlist} idx={idx} />
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  ref={(el) => {
                    const key = String(pattern.id);
                    if (el) {
                      patternProgressRefs.current.set(key, el);
                    } else {
                      patternProgressRefs.current.delete(key);
                    }
                  }}
                />
              </div>
            </div>
          ),
        }))}
        listHeader={
          <Button
            className={styles.addButton}
            icon={<BiPlus size={18} />}
            onClick={async () => {
              const id = randomUint64();
              playlist.patterns.push(
                create(PatternSchema, {
                  id,
                  name: 'New Pattern',
                  targetedEffects: [],
                }),
              );
              setSelectedId(id);
              save(`Add new pattern to ${playlist.name}.`);
            }}
          >
            Add pattern
          </Button>
        }
      />
      <div className={styles.pattern}>
        {pattern != null ? (
          <EffectGroupEditor
            targetedEffects={pattern.targetedEffects}
            name={pattern.name}
          />
        ) : null}
      </div>
      <div className={styles.palettes}>
        <Button
          icon={<BiPlus size={18} />}
          onClick={async () => {
            const id = randomUint64();
            playlist.palettes.push(
              create(ColorPaletteSchema, {
                ...DEFAULT_COLOR_PALETTE,
                id: id,
              }),
            );
            setSelectedId(id);
            save(`Add new pattern to ${playlist.name}.`);
          }}
        >
          Add palette
        </Button>
        <div className={styles.palettesList}>
          {playlist.palettes.map((p, idx) => (
            <div key={String(p.id)} className={styles.progressItem}>
              <div className={styles.progressRow}>
                <PaletteSwatch
                  className={styles.progressName}
                  palette={p}
                  active={false}
                  edit={true}
                  onClick={() => {
                    playlist.paletteOrder = {
                      case: 'paletteHold',
                      value: create(Playlist_HoldSchema, {
                        id: p.id,
                      }),
                    };
                    save(`Set ${playlist.name} palette to ${p.name}.`);
                  }}
                  onDelete={() => {
                    if (playlist.palettes.length === 1) {
                      return;
                    }
                    delete playlist.palettes[idx];
                    save(`Delete palette from ${playlist.name}`);
                  }}
                />
                <IconButton
                  title="Move palette up"
                  disabled={idx === 0}
                  onClick={() =>
                    swap(
                      playlist.palettes,
                      idx,
                      idx - 1,
                      `Reorder palettes in ${playlist.name}.`,
                    )
                  }
                >
                  <BiChevronUp />
                </IconButton>
                <IconButton
                  title="Move palette down"
                  disabled={idx === playlist.palettes.length - 1}
                  onClick={() =>
                    swap(
                      playlist.palettes,
                      idx,
                      idx + 1,
                      `Reorder palettes in ${playlist.name}.`,
                    )
                  }
                >
                  <BiChevronDown />
                </IconButton>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  ref={(el) => {
                    const key = String(p.id);
                    if (el) {
                      paletteProgressRefs.current.set(key, el);
                    } else {
                      paletteProgressRefs.current.delete(key);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PatternControlsProps {
  playlist: Playlist;
  idx: number;
}

function PatternControls({ playlist, idx }: PatternControlsProps) {
  const { save } = useContext(ProjectContext);
  const [open, setOpen] = useState(false);
  const pattern = playlist.patterns[idx];

  const runAndClose = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const swap = (a: number, b: number) => {
    [playlist.patterns[a], playlist.patterns[b]] = [
      playlist.patterns[b],
      playlist.patterns[a],
    ];
    save(`Reorder patterns in ${playlist.name}.`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="right"
      popover={
        <div className={styles.patternControls}>
          <IconButton
            title="Hold on this pattern"
            onClick={runAndClose(() => {
              playlist.patternOrder = {
                case: 'patternHold',
                value: create(Playlist_HoldSchema, { id: pattern.id }),
              };
              save(`Hold ${playlist.name} on pattern ${pattern.name}.`);
            })}
          >
            <BiPause />
          </IconButton>
          <IconButton
            title="Move pattern up"
            disabled={idx === 0}
            onClick={() => swap(idx, idx - 1)}
          >
            <BiChevronUp />
          </IconButton>
          <IconButton
            title="Move pattern down"
            disabled={idx === playlist.patterns.length - 1}
            onClick={() => swap(idx, idx + 1)}
          >
            <BiChevronDown />
          </IconButton>
          <IconButton
            variant="warning"
            title="Delete pattern"
            disabled={playlist.patterns.length === 1}
            onClick={runAndClose(() => {
              playlist.patterns.splice(idx, 1);
              save(`Delete pattern from ${playlist.name}.`);
            })}
          >
            <BiTrash />
          </IconButton>
        </div>
      }
    >
      <IconButton title="Pattern settings" onClick={() => setOpen(true)}>
        <BiCog />
      </IconButton>
    </Popover>
  );
}
