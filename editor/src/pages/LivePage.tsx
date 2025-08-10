import { clone, create } from '@bufbuild/protobuf';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import {
  SceneSchema,
  Scene_TileMapSchema,
  Scene_TileSchema,
  Scene_Tile_EffectGroupTileSchema,
  Scene_Tile_EffectGroupTile_EffectChannelSchema,
  Scene_Tile_SequenceTileSchema,
  type Scene,
  type Scene_Tile,
  type Scene_TileMap,
  type Scene_Tile_EffectGroupTile,
  type Scene_Tile_SequenceTile,
} from '@dmx-controller/proto/scene_pb';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Button, IconButton } from '../components/Button';
import { ControllerConnection } from '../components/ControllerConnection';
import { EffectDetails } from '../components/Effect';
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
import { HorizontalSplitPane } from '../components/SplitPane';
import { TileGrid } from '../components/TileGrid';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { BeatContext } from '../contexts/BeatContext';
import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { getAvailableChannels } from '../engine/fixtures/fixture';
import {
  DEFAULT_COLOR_PALETTE,
  renderScene as renderActiveScene,
} from '../engine/render';

import { BiPlus, BiTrash } from 'react-icons/bi';
import { Spacer } from '../components/Spacer';
import { Tabs, TabsType } from '../components/Tabs';
import { RenderingContext } from '../contexts/RenderingContext';
import { WritableOutput } from '../engine/context';
import { randomUint64 } from '../util/numberUtils';
import { getActiveScene } from '../util/sceneUtils';
import styles from './LivePage.module.scss';

const NEW_SCENE_KEY = 'new';

export function LivePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);
  const { beat: beatMetadata } = useContext(BeatContext);
  const [addTileIndex, setAddTileIndex] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { setRenderFunction, clearRenderFunction } =
    useContext(RenderingContext);

  const [selected, setSelected] = useState<Scene_TileMap | null>(null);

  const scene = project?.scenes[project.activeScene.toString()];

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const render = (frame: number, output: WritableOutput) => {
      const project = projectRef.current;
      if (project != null) {
        renderActiveScene(
          new Date().getTime(),
          beatMetadata,
          frame,
          project,
          output,
        );
      }
    };
    setRenderFunction(render);

    return () => clearRenderFunction(render);
  }, [beatMetadata, projectRef]);

  const body = (
    <div className={styles.body}>
      <div className={styles.gridWrapper}>
        <TileGrid
          className={styles.sceneEditor}
          sceneId={project.activeScene}
          onSelect={setSelected}
          setAddTileIndex={setAddTileIndex}
          maxX={
            scene.tileMap.map((c) => c.x).reduce((a, b) => (a > b ? a : b), 0) +
            2
          }
          maxY={
            scene.tileMap.map((c) => c.y).reduce((a, b) => (a > b ? a : b), 0) +
            2
          }
        />
      </div>
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
      {addTileIndex != null && (
        <AddNewDialog
          scene={getActiveScene(project)}
          x={addTileIndex.x}
          y={addTileIndex.y}
          onSelect={setSelected}
          onClose={() => setAddTileIndex(null)}
        />
      )}
      {selected && (
        <TileEditor tileMap={selected} onClose={() => setSelected(null)} />
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
      onClose={onClose}
    >
      <HorizontalSplitPane
        className={styles.splitPane}
        defaultAmount={0.15}
        left={
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
                  save(`Set priority to ${v} for ${tile.name}.`);
                }}
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
                value={tile.oneShot}
                onChange={(value) => {
                  tile.oneShot = value;
                  save(
                    `Set  ${tile.name} to ${value ? 'one-shot' : 'looping'}.`,
                  );
                }}
                labels={{ left: 'Loop', right: 'One-shot' }}
              />
            </div>
            <div className={styles.row}>
              <ToggleInput
                className={styles.switch}
                value={tile.duration?.case === 'durationMs'}
                onChange={(value) => {
                  if (value) {
                    tile.duration = {
                      case: 'durationMs',
                      value: 1000,
                    };
                  } else {
                    tile.duration = {
                      case: 'durationBeat',
                      value: 1,
                    };
                  }
                  save(
                    `Set timing type for tile ${tile.name} to ${value ? 'seconds' : 'beats'}.`,
                  );
                }}
                labels={{ left: 'Beat', right: 'Seconds' }}
              />
            </div>
            <div className={styles.row}>
              <label>Loop Duration</label>
              {tile.duration.case === 'durationMs' && (
                <NumberInput
                  type="float"
                  min={0.001}
                  max={300}
                  value={tile.duration?.value / 1000 || NaN}
                  onChange={(value) => {
                    tile.duration.value = Math.floor(value * 1000);
                    save(`Set duration for tile ${tile.name}.`);
                  }}
                />
              )}
              {tile.duration.case === 'durationBeat' && (
                <NumberInput
                  type="float"
                  min={1 / 256}
                  max={256}
                  value={tile.duration?.value}
                  onChange={(value) => {
                    tile.duration.value = value;
                    save(`Set duration for tile ${tile.name}.`);
                  }}
                />
              )}
            </div>
            <div className={styles.row}>
              <label>Fade in</label>
              <NumberInput
                type="float"
                title="Fade in seconds"
                min={0}
                max={300}
                value={(tile.fadeInDuration.value || 0) / 1000}
                onChange={(value) => {
                  tile.fadeInDuration = {
                    case: 'fadeInMs',
                    value: Math.floor(value * 1000),
                  };
                  save(`Set fade in duration for ${tile.name}.`);
                }}
              />
            </div>
            <div className={styles.row}>
              <label>Fade out</label>
              <NumberInput
                type="float"
                title="Fade out seconds"
                min={0}
                max={300}
                value={(tile.fadeOutDuration.value || 0) / 1000}
                onChange={(value) => {
                  tile.fadeOutDuration = {
                    case: 'fadeOutMs',
                    value: Math.floor(value * 1000),
                  };
                  save(`Set fade out duration for ${tile.name}.`);
                }}
              />
            </div>
          </div>
        }
        right={
          <>
            {tile.description.case === 'effectGroup' && (
              <EffectGroupEditor
                effect={tile.description.value}
                name={tile.name}
              />
            )}
            {tile.description.case === 'sequence' && (
              <SequenceEditor sequence={tile.description.value} />
            )}
          </>
        }
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

interface EffectGroupEditorProps {
  effect: Scene_Tile_EffectGroupTile;
  name: string;
}

function EffectGroupEditor({ effect, name }: EffectGroupEditorProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={`${styles.detailsPane} ${styles.effectGroup}`}>
      {effect.channels.map((c, i) => {
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
                  effect.channels.splice(i, 1);
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
              showTiming={false}
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
            effect.channels.push(createEffectChannel());
            save('Add channel to effect.');
          }}
        >
          <BiPlus />
        </IconButton>
      </div>
    </div>
  );
}

interface AddNewDialogProps {
  scene: Scene;
  x: number;
  y: number;
  onSelect: (tileMap: Scene_TileMap) => void;
  onClose: () => void;
}

function AddNewDialog({ scene, x, y, onSelect, onClose }: AddNewDialogProps) {
  const { save } = useContext(ProjectContext);

  const addTile = (
    description: Scene_Tile['description'],
    x: number,
    y: number,
  ) => {
    const tile = create(Scene_TileSchema, {
      name: 'New Tile',
      description: description,
      duration: {
        case: 'durationMs',
        value: 1000,
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
    return tileMap;
  };
  return (
    <Modal bodyClass={styles.addTile} title={`Add new tile`} onClose={onClose}>
      <div className={styles.addTileDescription}>
        Static effects simply set a fixture or group of fixtures to a specific
        state. They do not change over time.
      </div>
      <Button
        icon={<BiPlus />}
        onClick={() => {
          const tileMap = addTile(
            {
              case: 'effectGroup',
              value: create(Scene_Tile_EffectGroupTileSchema, {
                channels: [createEffectChannel()],
              }),
            },
            x,
            y,
          );
          save(`Add new effect tile.`);
          onClose();
          onSelect(tileMap);
        }}
      >
        Add Static Effect
      </Button>
      <div className={styles.addTileDescription}>
        Sequences can change over time and loop over a specified duration. They
        may control multiple fixtures and groups.
      </div>
      <Button
        icon={<BiPlus />}
        onClick={() => {
          const tile = addTile(
            {
              case: 'sequence',
              value: create(Scene_Tile_SequenceTileSchema, {
                nativeBeats: 1,
              }),
            },
            x,
            y,
          );
          save(`Add new sequence tile.`);
          onClose();
          onSelect(tile);
        }}
      >
        Add Sequence
      </Button>
    </Modal>
  );
}

interface SequenceEditorProps {
  sequence: Scene_Tile_SequenceTile;
}

function SequenceEditor({ sequence }: SequenceEditorProps) {
  return (
    <div className={styles.detailsPane}>
      <UniverseSequenceEditor
        className={styles.detailsPane}
        sequence={sequence}
      />
    </div>
  );
}

function createEffectChannel() {
  return create(Scene_Tile_EffectGroupTile_EffectChannelSchema, {
    effect: {
      effect: {
        case: 'staticEffect',
        value: {
          state: {},
        },
      },
      startMs: 0,
      endMs: 4_294_967_295,
    },
    outputTarget: {
      output: {
        case: undefined,
        value: undefined,
      },
    },
  });
}
