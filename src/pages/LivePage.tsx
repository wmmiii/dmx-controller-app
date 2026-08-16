import { clone, create } from '@bufbuild/protobuf';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import {
  InputBindingSchema,
  InputType,
} from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import {
  SceneSchema,
  type Scene_TileMap,
  Scene_TileMapSchema,
  Scene_TileSchema,
  Scene_Tile_AudioDetailsSchema,
  Scene_Tile_LoopDetailsSchema,
  Scene_Tile_OneShotDetailsSchema,
} from '@dmx-controller/proto/scene_pb';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BiPencil, BiPlus, BiTrash, BiX } from 'react-icons/bi';

import { AudioControls } from '../components/AudioControls';
import { AudioLevels } from '../components/AudioLevels';
import { Button, IconButton } from '../components/Button';
import { ClipboardControls } from '../components/ClipboardControls';
import { ControllerConnection } from '../components/ControllerConnection';
import { DurationInput } from '../components/Duration';
import { EffectGroupEditor } from '../components/EffectGroupEditor';
import { EditableText, NumberInput, TextInput } from '../components/Input';
import { Modal } from '../components/Modal';
import { PaletteSwatch } from '../components/Palette';
import { RangeSlider } from '../components/RangeSlider';
import { Spacer } from '../components/Spacer';
import { Tabs, TabsType } from '../components/Tabs';
import { TileGrid } from '../components/TileGrid';
import { Toggle } from '../components/Toggle';
import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { deleteBindings } from '../external_controller/externalController';
import { useRenderMode } from '../hooks/renderMode';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';
import { randomUint64 } from '../util/numberUtils';
import { getActiveScene } from '../util/sceneUtils';

import { sortedEntries } from '../util/sortUtils';
import styles from './LivePage.module.css';

const NEW_SCENE_KEY = 'new';

export function LivePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);

  const [selectedId, setSelectedId] = useState<bigint>(0n);
  const [editPalette, setEditPalette] = useState(false);

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
                    value: 1,
                  },
                },
                fadeOut: {
                  amount: {
                    case: 'beat',
                    value: 1,
                  },
                },
              },
            },
            transition: {
              case: 'startFadeInMs',
              value: 0n,
            },
          });
          const id = randomUint64();
          const tileMap = create(Scene_TileMapSchema, {
            id: id,
            tile: tile,
            x: x,
            y: y,
          });
          scene.tileMap.push(tileMap);
          setSelectedId(id);
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
        {scene?.colorPalettes.map((palette, i) => (
          <PaletteSwatch
            key={i}
            palette={palette}
            binding={{
              action: create(InputBindingSchema, {
                inputType: InputType.BINARY,
                action: {
                  case: 'colorPalette',
                  value: { paletteId: palette.id },
                },
              }),
              context: { type: 'scene', sceneId: project.activeScene },
            }}
            active={scene.activeColorPalette === palette.id}
            edit={editPalette}
            onClick={() => {
              scene.lastActiveColorPalette = scene.activeColorPalette;
              scene.activeColorPalette = palette.id;
              scene.colorPaletteStartTransition = BigInt(new Date().getTime());
              save(`Set color palette to ${palette.name}.`);
            }}
            onDelete={() => {
              if (scene.colorPalettes.length <= 1) {
                return;
              }

              const index = scene.colorPalettes.findIndex(
                (p) => p.id === palette.id,
              );
              if (index < 0) {
                return;
              }

              scene.activeColorPalette = scene.colorPalettes[0].id;
              scene.lastActiveColorPalette = scene.colorPalettes[0].id;

              scene.colorPalettes.splice(index, 1);
              save(`Delete color palette ${palette.name}`);
            }}
          />
        ))}
        <Button
          onClick={() => setEditPalette((e) => !e)}
          variant={editPalette ? 'primary' : 'default'}
          icon={<BiPencil />}
        >
          Edit palettes
        </Button>
        {editPalette && (
          <Button
            icon={<BiPlus />}
            onClick={() => {
              const activePalette = scene.colorPalettes.find(
                (p) => p.id === scene.activeColorPalette,
              );

              if (!activePalette) {
                throw Error(
                  'Cannot find active color palette: ' + activePalette,
                );
              }

              const newPalette = clone(ColorPaletteSchema, activePalette);
              newPalette.id = randomUint64();
              newPalette.name = 'New color palette';
              scene.colorPalettes.push(newPalette);

              scene.lastActiveColorPalette = scene.activeColorPalette;
              scene.activeColorPalette = newPalette.id;
              scene.colorPaletteStartTransition = BigInt(new Date().getTime());
              save('Add new color palette');
            }}
          >
            Palette
          </Button>
        )}
      </div>
    </div>
  );

  const tabs: TabsType = {};
  for (const [sceneIdString, scene] of sortedEntries(project.scenes)) {
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
          scene?.colorPalettes.find((p) => p.id === scene.activeColorPalette) ??
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
              controllerBindings: { bindings: {} },
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
            <AudioControls />
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
  const { project, save, update } = useContext(ProjectContext);
  const { connectedDevices } = useContext(ControllerContext);
  const [existingTile, setExistingTile] = useState<string | null>(null);

  const tile = tileMap.tile!;

  const action = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'tileStrength',
          value: { tileId: tileMap.id },
        },
      }),
    [tileMap.id],
  );

  return (
    <Modal
      title={
        <>
          Edit Tile
          <EditableText
            value={tile.name}
            onChange={(v) => {
              tile.name = v;
              save(`Change tile name to "${v}".`);
            }}
          />
        </>
      }
      fullScreen={true}
      bodyClass={styles.editorBody}
      onClose={onClose}
    >
      <div className={styles.metaPane}>
        <div className={styles.header}>
          <h2>Tile Details</h2>
        </div>
        <div className={styles.row}>
          <ClipboardControls
            typeName="tile"
            schema={Scene_TileSchema}
            value={tile}
            onPaste={(newTile) => {
              tileMap.tile = clone(Scene_TileSchema, newTile);
              tileMap.tile.name = `Copy of ${tileMap.tile.name}`;
              save('Paste tile.');
            }}
          />
          <Spacer />
          <IconButton
            title="Delete tile"
            variant="warning"
            onClick={() => {
              const tileMap = getActiveScene(project).tileMap;
              const index = tileMap.findIndex((c) => c.tile === tile);
              if (index > -1) {
                // Clean up all controller bindings for this tile
                deleteBindings(
                  project,
                  (action) =>
                    action.case === 'tileStrength' &&
                    action.value.tileId === tileMap[index].id,
                );

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
            mode="integer"
            value={tileMap.priority}
            onChange={(v) => {
              tileMap.priority = v;
              update();
            }}
            onFinalize={(v) => save(`Set priority to ${v} for ${tile.name}.`)}
          />
        </div>
        {connectedDevices.length > 0 && (
          <div className={styles.row}>
            <ControllerConnection
              action={action}
              context={{ type: 'scene', sceneId: project.activeScene }}
              title="Strength"
            />
          </div>
        )}
        <hr />
        <div className={styles.row}>
          <label>Audio reactivity</label>
        </div>
        {tile.audioDetails == null ? (
          <div className={styles.audioRow}>
            <Button
              onClick={() => {
                tile.audioDetails = create(Scene_Tile_AudioDetailsSchema, {
                  lowBand: 0,
                  highBand: 15,
                  minRange: 0,
                  maxRange: 1,
                });
                save(`Make ${tile.name} audio reactive.`);
              }}
            >
              Make audio reactive
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.row}>
              <RangeSlider
                value={[
                  tile.audioDetails.lowBand,
                  tile.audioDetails.highBand + 1,
                ]}
                onChange={([low, high]) => {
                  tile.audioDetails!.lowBand = low;
                  tile.audioDetails!.highBand = high - 1;
                  save(
                    `Change ${tile.name} audio band range to ${low}–${high}.`,
                  );
                }}
                min={0}
                max={16}
                step={1}
              />
            </div>
            <div className={styles.row}>
              <AudioLevels
                minRange={tile.audioDetails.lowBand}
                maxRange={tile.audioDetails.highBand}
              />
            </div>
            <div className={styles.audioRow}>
              <NumberInput
                value={tile.audioDetails.minRange}
                onFinalize={(v) => {
                  tile.audioDetails!.minRange = v;
                  save(`Change min volume mapping of ${tile.name} to ${v}`);
                }}
              />
              <NumberInput
                value={tile.audioDetails.maxRange}
                onFinalize={(v) => {
                  tile.audioDetails!.maxRange = v;
                  save(`Change max volume mapping of ${tile.name} to ${v}`);
                }}
              />
              <IconButton
                title="Remove audio reactivity."
                onClick={() => {
                  tile.audioDetails = undefined;
                  save(`Make ${tile.name} not audio reactive`);
                }}
              >
                <BiX />
              </IconButton>
            </div>
          </>
        )}
        <hr />
        <div className={styles.row}>
          <Toggle
            value={tile.timingDetails.case === 'oneShot'}
            onChange={(oneShot) => {
              if (oneShot) {
                tile.timingDetails = {
                  case: 'oneShot',
                  value: create(Scene_Tile_OneShotDetailsSchema, {
                    duration: {
                      amount: {
                        case: 'beat',
                        value: 1,
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
      <EffectGroupEditor
        targetedEffects={tile.targetedEffects}
        name={tile.name}
      />
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
