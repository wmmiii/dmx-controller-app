import { clone, create } from '@bufbuild/protobuf';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import {
  ControllerMapping_Action,
  ControllerMapping_TileStrengthSchema,
} from '@dmx-controller/proto/controller_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import {
  Scene,
  Scene_Tile,
  Scene_TileMap,
  Scene_TileMapSchema,
  Scene_TileSchema,
  Scene_Tile_EffectGroupTile,
  Scene_Tile_EffectGroupTileSchema,
  Scene_Tile_EffectGroupTile_EffectChannelSchema,
  Scene_Tile_SequenceTile,
  Scene_Tile_SequenceTileSchema,
} from '@dmx-controller/proto/scene_pb';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Button, IconButton } from '../components/Button';
import { ControllerConnection } from '../components/ControllerConnection';
import { EffectDetails } from '../components/Effect';
import { NumberInput, TextInput, ToggleInput } from '../components/Input';
import { LiveBeat } from '../components/LiveBeat';
import { Modal } from '../components/Modal';
import { OutputSelector, getOutputName } from '../components/OutputSelector';
import { PaletteSwatch } from '../components/Palette';
import { HorizontalSplitPane } from '../components/SplitPane';
import { TileGrid } from '../components/TileGrid';
import { UniverseSequenceEditor } from '../components/UniverseSequenceEditor';
import { BeatContext } from '../contexts/BeatContext';
import { ControllerContext } from '../contexts/ControllerContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { getAvailableChannels } from '../engine/fixture';
import {
  DEFAULT_COLOR_PALETTE,
  renderSceneToUniverse as renderActiveSceneToUniverse,
} from '../engine/universe';
import { universeToUint8Array } from '../engine/utils';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';

import styles from './LivePage.module.scss';

export function LivePage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);
  const { beat: beatMetadata } = useContext(BeatContext);
  const [addTileIndex, setAddTileIndex] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const [selected, setSelected] = useState<Scene_TileMap | null>(null);

  const scene = project?.scenes[0];

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const render = (frame: number) => {
      const project = projectRef.current;
      if (project != null) {
        return universeToUint8Array(
          projectRef.current,
          renderActiveSceneToUniverse(
            new Date().getTime(),
            beatMetadata,
            frame,
            project,
          ),
        );
      } else {
        return new Uint8Array(512);
      }
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [beatMetadata, projectRef]);

  return (
    <PaletteContext.Provider
      value={{
        palette:
          scene?.colorPalettes[scene.activeColorPalette] ||
          DEFAULT_COLOR_PALETTE,
      }}
    >
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <LiveBeat className={styles.beat} />
        </div>
        <div className={styles.body}>
          <div className={styles.gridWrapper}>
            <TileGrid
              className={styles.sceneEditor}
              sceneId={0}
              onSelect={setSelected}
              setAddTileIndex={setAddTileIndex}
              maxX={
                scene.tileMap
                  .map((c) => c.x)
                  .reduce((a, b) => (a > b ? a : b), 0) + 2
              }
              maxY={
                scene.tileMap
                  .map((c) => c.y)
                  .reduce((a, b) => (a > b ? a : b), 0) + 2
              }
            />
          </div>
          <div className={styles.palettes}>
            {Object.entries(scene?.colorPalettes).map((e, i) => (
              <PaletteSwatch
                key={i}
                id={e[0]}
                palette={e[1]}
                active={scene.activeColorPalette === e[0]}
                onClick={() => {
                  scene.lastActiveColorPalette = scene.activeColorPalette;
                  scene.activeColorPalette = e[0];
                  scene.colorPaletteStartTransition = BigInt(
                    new Date().getTime(),
                  );
                  save(`Set color palette to ${e[1].name}.`);
                }}
                onDelete={() => {
                  if (Object.keys(scene.colorPalettes).length <= 1) {
                    return;
                  }

                  scene.activeColorPalette = Object.keys(
                    scene.colorPalettes,
                  )[0];
                  scene.activeColorPalette = Object.keys(
                    scene.colorPalettes,
                  )[0];
                  delete scene.colorPalettes[e[0]];

                  save(`Delete color palette ${e[1].name}`);
                }}
              />
            ))}
            <Button
              icon={<IconBxPlus />}
              onClick={() => {
                const newPalette = clone(
                  ColorPaletteSchema,
                  DEFAULT_COLOR_PALETTE,
                );
                newPalette.name = 'New color palette';
                scene.colorPalettes[crypto.randomUUID()] = newPalette;
                save('Add new color palette');
              }}
            >
              Palette
            </Button>
          </div>
        </div>
      </div>
      {addTileIndex != null && (
        <AddNewDialog
          scene={project.scenes[0]}
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
      ({
        case: 'tileStrength',
        value: create(ControllerMapping_TileStrengthSchema, {
          scene: 0,
          tileId: tileMap.id,
        }),
      }) as ControllerMapping_Action['action'],
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
            <h2>Live Details</h2>
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
            <div className={styles.row}>
              <label>Shortcut</label>
              <input
                onChange={() => {}}
                onKeyDown={(e) => {
                  if (e.code.startsWith('Digit')) {
                    tileMap.shortcut = e.code.substring(5);
                    save(
                      `Add shortcut ${tileMap.shortcut} for tile ${tile.name}.`,
                    );
                  } else if (e.code === 'Backspace' || e.code === 'Delete') {
                    save(`Remove shortcut for tile ${tile.name}.`);
                  }
                }}
                value={tileMap.shortcut}
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
            {tile.duration.case === 'durationMs' && (
              <div className={styles.row}>
                <label>Loop Duration</label>
                <NumberInput
                  type="float"
                  min={0.001}
                  max={300}
                  value={tile.duration?.value / 1000 || NaN}
                  onChange={(value) => {
                    tile.duration.value = Math.floor(value * 1000);
                    save(`Set duration for tile ${tile.name}.`);
                  }}
                  disabled={tile.duration?.case !== 'durationMs'}
                />
              </div>
            )}
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
            <Button
              variant="warning"
              onClick={() => {
                const tileMap = project.scenes[0].tileMap;
                const index = tileMap.findIndex((c) => c.tile === tile);
                if (index > -1) {
                  tileMap.splice(index, 1);

                  onClose();
                  save(`Delete tile ${tile.name}.`);
                }
              }}
            >
              Delete Tile
            </Button>
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
            <IconButton
              className={styles.deleteEffect}
              title="Delete Channel"
              onClick={() => {
                effect.channels.splice(i, 1);
                save(`Delete channel from ${name}`);
              }}
            >
              <IconBxX />
            </IconButton>
            <label className={styles.stateHeader}>
              <span>Output</span>
              <OutputSelector
                value={c.outputId}
                setValue={(o) => {
                  c.outputId = o;
                  save(`Set effect output to ${getOutputName(project, o)}.`);
                }}
              />
            </label>
            <EffectDetails
              effect={c.effect}
              showTiming={false}
              showPhase={c.outputId?.output.case === 'group'}
              availableChannels={getAvailableChannels(c.outputId, project)}
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
          <IconBxPlus />
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
        case: 'startFadeOutMs',
        value: 0n,
      },
    });
    const tileMap = create(Scene_TileMapSchema, {
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
        icon={<IconBxPlus />}
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
        icon={<IconBxPlus />}
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
    outputId: {
      output: {
        case: undefined,
        value: undefined,
      },
    },
  });
}
