import { clone, create } from '@bufbuild/protobuf';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import {
  SceneSchema,
  Scene_TileMapSchema,
  Scene_TileSchema,
  Scene_Tile_EffectChannel,
  Scene_Tile_EffectChannelSchema,
  Scene_Tile_LoopDetailsSchema,
  Scene_Tile_OneShotDetailsSchema,
  type Scene_TileMap,
} from '@dmx-controller/proto/scene_pb';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Button, IconButton } from '../components/Button';
import { ControllerConnection } from '../components/ControllerConnection';
import {
  EditableText,
  NumberInput,
  TextInput,
  ToggleInput,
} from '../components/Input';
import { LiveBeat } from '../components/LiveBeat';
import { Modal } from '../components/Modal';
import {
  OutputSelector,
  getOutputTargetName,
} from '../components/OutputSelector';
import { PaletteSwatch } from '../components/Palette';
import { TileGrid } from '../components/TileGrid';
import { EffectDetails } from '../components/TimecodeEffect';
import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { getAvailableChannels } from '../engine/fixtures/fixture';

import { BiPlus, BiTrash } from 'react-icons/bi';
import { DurationInput } from '../components/Duration';
import { Spacer } from '../components/Spacer';
import { Tabs, TabsType } from '../components/Tabs';
import { useRenderMode } from '../hooks/renderMode';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { randomUint64 } from '../util/numberUtils';
import { getActiveScene } from '../util/sceneUtils';
import styles from './LivePage.module.scss';

const NEW_SCENE_KEY = 'new';

export function LivePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);

  const [selectedId, setSelectedId] = useState<bigint>(0n);

  const scene = project?.scenes[project.activeScene.toString()];
  const selected = scene.tileMap.find((t) => t.id === selectedId);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useRenderMode(
    {
      mode: {
        case: 'scene',
        value: {
          sceneId: project.activeScene,
        },
      },
    },
    [project.activeScene],
  );

  const body = (
    <div className={styles.body}>
      <TileGrid
        className={styles.gridWrapper}
        sceneId={project.activeScene}
        onSelectId={setSelectedId}
        setAddTileIndex={({ x, y }) => {
          const tile = create(Scene_TileSchema, {
            name: 'New Tile',
            timingDetails: {
              case: 'loop',
              value: {
                fadeIn: {
                  amount: {
                    case: 'beat',
                    value: 0,
                  },
                },
                fadeOut: {
                  amount: {
                    case: 'beat',
                    value: 0,
                  },
                },
              },
            },
            transition: {
              case: 'startFadeInMs',
              value: 0n,
            },
          });
          const tileMap = create(Scene_TileMapSchema, {
            id: randomUint64(),
            tile: tile,
            x: x,
            y: y,
          });
          scene.tileMap.push(tileMap);
          save('Add new effect to group.');
        }}
        maxX={
          scene.tileMap.map((c) => c.x).reduce((a, b) => (a > b ? a : b), 0) + 2
        }
        maxY={
          scene.tileMap.map((c) => c.y).reduce((a, b) => (a > b ? a : b), 0) + 2
        }
      />
      <div className={styles.palettes}>
        {Object.entries(scene?.colorPalettes).map(([paletteId, palette], i) => (
          <PaletteSwatch
            key={i}
            paletteId={BigInt(paletteId)}
            sceneId={project.activeScene}
            palette={palette}
            active={scene.activeColorPalette === BigInt(paletteId)}
            onClick={() => {
              scene.lastActiveColorPalette = scene.activeColorPalette;
              scene.activeColorPalette = BigInt(paletteId);
              scene.colorPaletteStartTransition = BigInt(new Date().getTime());
              save(`Set color palette to ${palette.name}.`);
            }}
            onDelete={() => {
              if (Object.keys(scene.colorPalettes).length <= 1) {
                return;
              }

              scene.activeColorPalette = BigInt(
                Object.keys(scene.colorPalettes)[0],
              );
              scene.activeColorPalette = BigInt(
                Object.keys(scene.colorPalettes)[0],
              );
              delete scene.colorPalettes[paletteId];

              save(`Delete color palette ${palette.name}`);
            }}
          />
        ))}
        <Button
          icon={<BiPlus />}
          onClick={() => {
            const newPalette = clone(ColorPaletteSchema, DEFAULT_COLOR_PALETTE);
            newPalette.name = 'New color palette';
            scene.colorPalettes[randomUint64().toString()] = newPalette;
            save('Add new color palette');
          }}
        >
          Palette
        </Button>
      </div>
    </div>
  );

  const tabs: TabsType = {};
  for (const [sceneIdString, scene] of Object.entries(project.scenes).sort(
    ([_aId, a], [_bId, b]) => a.name.localeCompare(b.name),
  )) {
    const sceneId = BigInt(sceneIdString);
    tabs[sceneId.toString()] = {
      name: (
        <>
          <EditableText
            value={scene.name}
            onChange={(name) => {
              scene.name = name;
              save(`Change name of scene to ${name}.`);
            }}
          />
          {Object.keys(project.scenes).length > 1 &&
            project.activeScene === sceneId && (
              <>
                &nbsp;
                <BiTrash
                  size="1em"
                  onClick={(ev) => {
                    delete project.scenes[sceneId.toString()];
                    project.activeScene = BigInt(
                      Object.keys(project.scenes)[0],
                    );
                    save(`Delete scene ${scene.name}.`);
                    ev.stopPropagation();
                  }}
                />
              </>
            )}
        </>
      ),
      contents: body,
    };
  }

  tabs[NEW_SCENE_KEY] = {
    name: <BiPlus />,
    contents: <></>,
  };

  return (
    <PaletteContext.Provider
      value={{
        palette:
          scene?.colorPalettes[scene.activeColorPalette.toString()] ||
          DEFAULT_COLOR_PALETTE,
      }}
    >
      <Tabs
        className={styles.tabContainer}
        tabs={tabs}
        selectedTab={project.activeScene.toString()}
        setSelectedTab={(tabKey) => {
          if (tabKey === NEW_SCENE_KEY) {
            const newSceneId = randomUint64();
            project.scenes[newSceneId.toString()] = create(SceneSchema, {
              name: 'New Scene',
              tileMap: [],
              colorPalettes: scene.colorPalettes,
              activeColorPalette: scene.activeColorPalette,
              lastActiveColorPalette: scene.activeColorPalette,
              colorPaletteTransitionDurationMs: 3_000,
            });
            project.activeScene = newSceneId;
            save('Add new scene');
          } else {
            const sceneId = BigInt(tabKey);
            project.activeScene = sceneId;
            const scene = project.scenes[sceneId.toString()];
            save(`Switch to scene ${scene.name}`);
          }
        }}
        after={
          <>
            <Spacer />
            <LiveBeat className={styles.beat} />
          </>
        }
      />
      {selected && (
        <TileEditor tileMap={selected} onClose={() => setSelectedId(0n)} />
      )}
    </PaletteContext.Provider>
  );
}

interface TileEditorProps {
  tileMap: Scene_TileMap;
  onClose: () => void;
}

function TileEditor({ tileMap, onClose }: TileEditorProps) {
  const { project, save } = useContext(ProjectContext);
  const { controllerName } = useContext(ControllerContext);
  const [existingTile, setExistingTile] = useState<string | null>(null);

  const tile = tileMap.tile!;

  const action = useMemo(
    () =>
      create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [project.activeScene.toString()]: {
                action: {
                  case: 'tileStrengthId',
                  value: tileMap.id,
                },
              },
            },
          },
        },
      }),
    [],
  );

  return (
    <Modal
      title={`Edit Tile "${tile.name}"`}
      fullScreen={true}
      bodyClass={styles.editorBody}
      onClose={onClose}
    >
      <div className={styles.metaPane}>
        <div className={styles.header}>
          <h2>Tile Details</h2>
          <IconButton
            title="Delete tile"
            variant="warning"
            onClick={() => {
              const tileMap = getActiveScene(project).tileMap;
              const index = tileMap.findIndex((c) => c.tile === tile);
              if (index > -1) {
                tileMap.splice(index, 1);

                onClose();
                save(`Delete tile ${tile.name}.`);
              }
            }}
          >
            <BiTrash />
          </IconButton>
        </div>
        <div className={styles.row}>
          <label>Name</label>
          <TextInput
            value={tile.name}
            onChange={(v) => {
              tile.name = v;
              save(`Change tile name to "${v}".`);
            }}
          />
        </div>
        <div className={styles.row}>
          <label>Priority</label>
          <NumberInput
            min={-1000}
            max={1000}
            type="integer"
            value={tileMap.priority}
            onChange={(v) => {
              tileMap.priority = v;
            }}
            onFinalize={(v) => save(`Set priority to ${v} for ${tile.name}.`)}
          />
        </div>
        {controllerName != null && (
          <div className={styles.row}>
            <ControllerConnection action={action} title="Strength" />
          </div>
        )}
        <div className={styles.row}>
          <ToggleInput
            className={styles.switch}
            value={tile.timingDetails.case === 'oneShot'}
            onChange={(oneShot) => {
              if (oneShot) {
                tile.timingDetails = {
                  case: 'oneShot',
                  value: create(Scene_Tile_OneShotDetailsSchema, {
                    duration: {
                      amount: {
                        case: 'beat',
                        value: 0,
                      },
                    },
                  }),
                };
              } else {
                tile.timingDetails = {
                  case: 'loop',
                  value: create(Scene_Tile_LoopDetailsSchema, {
                    fadeIn: {
                      amount: {
                        case: 'ms',
                        value: 0,
                      },
                    },
                    fadeOut: {
                      amount: {
                        case: 'ms',
                        value: 0,
                      },
                    },
                  }),
                };
              }
              save(`Set ${tile.name} to ${oneShot ? 'one-shot' : 'looping'}.`);
            }}
            labels={{ left: 'Loop', right: 'One-shot' }}
          />
        </div>
        <hr />
        {tile.timingDetails.case === 'oneShot' && (
          <>
            <div className={styles.row}>
              <label>Duration</label>
            </div>
            <DurationInput duration={tile.timingDetails.value.duration!} />
          </>
        )}
        {tile.timingDetails.case === 'loop' && (
          <>
            <div className={styles.row}>
              <label>Fade in</label>
            </div>
            <DurationInput duration={tile.timingDetails.value.fadeIn!} />
            <div className={styles.row}>
              <label>Fade out</label>
            </div>
            <DurationInput duration={tile.timingDetails.value.fadeOut!} />
          </>
        )}
      </div>
      <EffectGroupEditor channels={tile.channels} name={tile.name} />
      {existingTile && (
        <Modal
          title="Controller mapping error"
          onClose={() => setExistingTile(null)}
        >
          This input is already mapped to {existingTile}.
        </Modal>
      )}
    </Modal>
  );
}

interface EffectGroupEditorProps {
  channels: Scene_Tile_EffectChannel[];
  name: string;
}

function EffectGroupEditor({ channels, name }: EffectGroupEditorProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.detailsPane}>
      {channels.map((c, i) => {
        if (c.effect == null) {
          throw new Error('Channel effect is not defined!');
        }
        return (
          <div key={i} className={styles.effect}>
            <div className={styles.header}>
              <h3>Effect {i + 1}</h3>
              <IconButton
                title="Delete Channel"
                variant="warning"
                onClick={() => {
                  channels.splice(i, 1);
                  save(`Delete channel from ${name}`);
                }}
              >
                <BiTrash />
              </IconButton>
            </div>
            <label className={styles.stateHeader}>
              <span>Output</span>
              <OutputSelector
                value={c.outputTarget}
                setValue={(o) => {
                  c.outputTarget = o;
                  save(
                    `Set effect output to ${getOutputTargetName(project, o)}.`,
                  );
                }}
              />
            </label>
            <EffectDetails
              effect={c.effect}
              showPhase={c.outputTarget?.output.case === 'group'}
              availableChannels={getAvailableChannels(c.outputTarget, project)}
            />
          </div>
        );
      })}
      <div className={styles.newEffect}>
        <IconButton
          title="Add Effect"
          onClick={() => {
            channels.push(createEffectChannel());
            save('Add channel to effect.');
          }}
        >
          <BiPlus />
        </IconButton>
      </div>
    </div>
  );
}

function createEffectChannel() {
  return create(Scene_Tile_EffectChannelSchema, {
    effect: {
      effect: {
        case: 'staticEffect',
        value: {
          state: {},
        },
      },
    },
    outputTarget: {
      output: {
        case: undefined,
        value: undefined,
      },
    },
  });
}
