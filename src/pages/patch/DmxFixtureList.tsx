import { create } from '@bufbuild/protobuf';
import { JSX, useContext, useEffect, useMemo, useState } from 'react';
import { ProjectContext } from '../../contexts/ProjectContext';

import {
  DmxFixtureDefinition_Channel,
  DmxFixtureDefinition_Channel_AmountMappingSchema,
  DmxFixtureDefinition_Channel_AngleMappingSchema,
  DmxFixtureDefinition_Channel_ColorWheelMapping,
  DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColorSchema,
  DmxFixtureDefinition_Channel_ColorWheelMappingSchema,
  DmxFixtureDefinition_ChannelSchema,
  DmxFixtureDefinition_ModeSchema,
  DmxFixtureDefinitionSchema,
} from '@dmx-controller/proto/dmx_pb';
import {
  SacnDmxOutput,
  SerialDmxOutput,
} from '@dmx-controller/proto/output_pb';
import { BiGridVertical, BiPlus, BiTrash } from 'react-icons/bi';
import { Button, IconButton } from '../../components/Button';
import { ColorSwatch } from '../../components/ColorSwatch';
import { NumberInput, TextInput } from '../../components/Input';
import { Modal } from '../../components/Modal';
import RangeInput from '../../components/RangeInput';
import { VersatileElement } from '../../components/VersatileElement';
import {
  AMOUNT_CHANNELS,
  ANGLE_CHANNELS,
  ChannelTypes,
  COLOR_CHANNELS,
  isAmountChannel,
  isAngleChannel,
} from '../../engine/channel';
import { useRenderMode } from '../../hooks/renderMode';
import { extractGdtf } from '../../util/gdtf';
import { randomUint64 } from '../../util/numberUtils';
import { getOutput } from '../../util/projectUtils';
import { DraggableDmxFixture } from './DmxEditor';
import styles from './PatchPage.module.scss';

interface DmxFixtureListProps {
  outputId: bigint;
}

export function DmxFixtureList({
  outputId,
}: DmxFixtureListProps): JSX.Element | null {
  const { project, save } = useContext(ProjectContext);
  const [selectedId, setSelectedId] = useState<{
    definition: bigint;
    mode: string;
  } | null>(null);
  const [highlightDrop, setHighlightDrop] = useState(false);

  const classes = [styles.fixtureDefinitionList];
  if (highlightDrop) {
    classes.push(styles.highlightDrop);
  }

  return (
    <div
      className={classes.join(' ')}
      onDragOver={(e) => {
        if (e.dataTransfer.items.length > 1) {
          setHighlightDrop(true);
        }
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        setHighlightDrop(false);
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();

        (async () => {
          if (!project) {
            return;
          }
          for (let i = 0; i < e.dataTransfer.items.length; ++i) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile() as File;
              const fixtureDefinition = await extractGdtf(file);
              project.fixtureDefinitions!.dmxFixtureDefinitions[
                fixtureDefinition.globalId
              ] = fixtureDefinition;
              save(`Add ${fixtureDefinition.name} fixture profile.`);
            }
          }
        })();

        setHighlightDrop(false);
      }}
    >
      <h2>Fixture Profiles</h2>
      <ul>
        {Object.entries(project.fixtureDefinitions!.dmxFixtureDefinitions)
          .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
          .map(([definitionId, definition]) => (
            <li key={definitionId}>
              {definition.name}
              {Object.entries(definition.modes).map(([modeId, e], i) => {
                const f: DraggableDmxFixture = {
                  id: randomUint64(),
                  definition: BigInt(definitionId),
                  mode: modeId,
                };
                return (
                  <VersatileElement
                    key={i}
                    className={styles.mode}
                    id={f.id}
                    element={f}
                    onClick={() => {
                      setSelectedId({
                        definition: BigInt(definitionId),
                        mode: modeId,
                      });
                    }}
                    onDragComplete={() => {
                      const output = getOutput(project, outputId);
                      if (
                        output.output.case !== 'serialDmxOutput' &&
                        output.output.case !== 'sacnDmxOutput'
                      ) {
                        throw Error('Tried to edit non DMX output!');
                      }
                      if (
                        Object.keys(output.output.value.fixtures).indexOf(
                          String(f.id),
                        ) > -1
                      ) {
                        save(
                          `Add fixture ${definition.name} to output ${output.name}.`,
                        );
                      }
                    }}
                  >
                    <BiGridVertical />
                    {e.name}
                  </VersatileElement>
                );
              })}
            </li>
          ))}
      </ul>
      <Button
        onClick={() => {
          const definitionId = randomUint64();
          const newDefinition = create(DmxFixtureDefinitionSchema, {
            name: 'New Fixture Profile',
          });
          const modeId = randomUint64();
          newDefinition.modes[modeId.toString()] = create(
            DmxFixtureDefinition_ModeSchema,
            {
              name: 'Default',
              numChannels: 1,
            },
          );
          project.fixtureDefinitions!.dmxFixtureDefinitions[
            definitionId.toString()
          ] = newDefinition;
          setSelectedId({
            definition: definitionId,
            mode: modeId.toString(),
          });
          save('Create new fixture profile.');
        }}
      >
        + Add New Fixture Profile
      </Button>
      <p className={styles.hint}>
        <strong>Hint:</strong> You can drag and drop .gdtf fixture profile files
        downloaded from&nbsp;
        <a href="https://gdtf-share.com/share.php" target="_blank">
          GDTF Share
        </a>
        &nbsp;onto this pane to quickly import profiles.
      </p>
      {selectedId && (
        <EditDefinitionDialog
          debugOutputId={outputId}
          id={selectedId}
          setModeId={(id) => {
            setSelectedId({
              definition: selectedId!.definition,
              mode: id,
            });
          }}
          close={() => setSelectedId(null)}
          deleteDefinition={() => {
            const id = selectedId?.toString();
            if (id == null) {
              return;
            }

            const existing = Object.values(project.patches)
              .flatMap((p) => Object.values(p.outputs))
              .filter(
                (o) =>
                  o.output.case === 'sacnDmxOutput' ||
                  o.output.case === 'serialDmxOutput',
              )
              .flatMap((o) =>
                Object.values(
                  (o.output.value as SacnDmxOutput | SerialDmxOutput).fixtures,
                ),
              )
              .find((f) => f.fixtureDefinitionId === selectedId.definition);
            if (existing) {
              alert(`Fixture profile used by ${existing.name}!`);
              return;
            }

            const name =
              project.fixtureDefinitions?.dmxFixtureDefinitions[id].name;
            delete project.fixtureDefinitions?.dmxFixtureDefinitions[id];
            save(`Delete fixture profile ${name}.`);
          }}
        />
      )}
    </div>
  );
}

interface EditDefinitionDialogProps {
  debugOutputId: bigint;
  id: { definition: bigint; mode: string };
  setModeId: (modeId: string) => void;
  close: () => void;
  deleteDefinition: () => void;
}

function EditDefinitionDialog({
  debugOutputId,
  id,
  setModeId,
  close,
  deleteDefinition,
}: EditDefinitionDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [testIndex, setTestIndex] = useState(0);
  const [testValues, setTestValues] = useState<number[]>([]);
  const [wheelChannel, setWheelChannel] = useState<number | null>(null);

  useEffect(() => {
    const testValues: number[] = new Array(mode.numChannels).fill(0);
    Object.entries(mode.channels).forEach(([i, c]) => {
      testValues[parseInt(i) - 1 + testIndex] = c.defaultValue ?? 0;
    });
    setTestValues(testValues);
  }, [setTestValues]);

  useRenderMode(
    {
      mode: {
        case: 'fixtureDebug',
        value: {
          outputId: debugOutputId,
          channelOffset: testIndex,
          channelValues: testValues,
        },
      },
    },
    [debugOutputId, testIndex, testValues],
  );

  const definition = useMemo(() => {
    return project.fixtureDefinitions?.dmxFixtureDefinitions[
      id.definition.toString()
    ]!;
  }, [project, id]);

  const mode = definition.modes[id.mode];

  const wheel = wheelChannel
    ? (mode.channels[wheelChannel].mapping
        .value as DmxFixtureDefinition_Channel_ColorWheelMapping)
    : null;

  return (
    <Modal
      title={'Edit ' + definition.name}
      onClose={close}
      className={styles.editorWrapper}
      bodyClass={styles.editor}
      footer={
        <Button onClick={close} variant="primary">
          Done
        </Button>
      }
    >
      <div className={styles.editorMetadata}>
        <label>
          <span>Name</span>
          <TextInput
            value={definition.name}
            onChange={(v) => {
              definition.name = v;
              save(`Change fixture profile name to ${v}.`);
            }}
          />
        </label>
        <label>
          <span>Manufacturer</span>
          <TextInput
            value={definition.manufacturer}
            onChange={(v) => {
              definition.manufacturer = v;
              save(
                `Set manufacturer of fixture profile ${definition.name} to ${v}.`,
              );
            }}
          />
        </label>
        <div className={styles.spacer}></div>
        <IconButton
          variant="warning"
          title="Delete Fixture Profile"
          onClick={deleteDefinition}
        >
          <BiTrash />
        </IconButton>
      </div>
      <hr />
      <div className={styles.editorMetadata}>
        <label>
          <span>Mode</span>
          <select
            value={id.mode}
            onChange={(e) => {
              if (e.target.value === 'new') {
                const modeId = randomUint64();
                definition.modes[modeId.toString()] = create(
                  DmxFixtureDefinition_ModeSchema,
                  {
                    name: 'New Mode',
                    numChannels: 1,
                  },
                );
                save('Add new fixture mode.');
                setModeId(modeId.toString());
              } else {
                setModeId(e.target.value);
              }
            }}
          >
            {Object.keys(definition.modes).map((m) => (
              <option key={m} value={m}>
                {definition.modes[m].name}
              </option>
            ))}
            <option value="new">+ Create New Mode</option>
          </select>
        </label>
        <div className={styles.spacer}></div>
        <IconButton
          variant="warning"
          title="Delete Fixture Mode"
          onClick={() => {
            const existing = Object.values(project.patches)
              .flatMap((p) => Object.values(p.outputs))
              .filter(
                (o) =>
                  o.output.case === 'sacnDmxOutput' ||
                  o.output.case === 'serialDmxOutput',
              )
              .flatMap((o) =>
                Object.values(
                  (o.output.value as SacnDmxOutput | SerialDmxOutput).fixtures,
                ),
              )
              .find(
                (f) =>
                  f.fixtureDefinitionId === id.definition &&
                  f.fixtureMode === id.mode,
              );
            if (existing) {
              alert(`Fixture mode used by ${existing.name}!`);
              return;
            }
            delete definition.modes[id.mode];
            save(`Delete mode ${mode.name} from ${definition.name}.`);
            setModeId(Object.keys(definition.modes)[0]);
          }}
          disabled={Object.entries(definition.modes).length < 2}
        >
          <BiTrash />
        </IconButton>
      </div>
      <div className={styles.editorMetadata}>
        <label>
          <span>Mode name</span>
          <TextInput
            value={mode.name}
            onChange={(value) => {
              mode.name = value;
              save(`Change mode name to ${value}.`);
            }}
          />
        </label>
        <label>
          <span>Total channels</span>
          <NumberInput
            min={Math.max(
              0,
              ...Object.keys(mode.channels).map((i) => parseInt(i)),
            )}
            max={512}
            value={mode.numChannels}
            onChange={(v) => {
              mode.numChannels = v;
            }}
            onFinalize={(v) =>
              save(`Set number of channels of ${mode.name} to ${v}.`)
            }
          />
        </label>
        <div className={styles.spacer}></div>
        <label>
          <span>Test fixture index</span>
          <NumberInput
            min={1}
            max={512}
            value={testIndex + 1}
            onChange={(v) => setTestIndex(v - 1)}
          />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Type</th>
            <th>Default</th>
            <th>Min Deg</th>
            <th>Max Deg</th>
            <th>Min Value</th>
            <th>Max Value</th>
            <th>Test</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(Array(mode.numChannels), (_, i) => {
            const index = i + 1;
            const channel = mode.channels[index];
            return (
              <tr key={index}>
                <td>{index}</td>
                <td>
                  <select
                    value={channel?.type || 'unset'}
                    onChange={(e) => {
                      if (e.target.value === 'unset') {
                        delete mode.channels[index];
                        save(`Delete mapping for channel ${index}.`);
                        return;
                      }

                      const newType = e.target.value as ChannelTypes;
                      if (mode.channels[index] == null) {
                        mode.channels[index] = create(
                          DmxFixtureDefinition_ChannelSchema,
                          {
                            type: newType,
                            mapping: {
                              case: undefined,
                              value: undefined,
                            },
                          },
                        );
                      }

                      const channel = mode.channels[index];

                      if (
                        isAngleChannel(newType) &&
                        channel.mapping.case !== 'angleMapping'
                      ) {
                        channel.mapping = {
                          case: 'angleMapping',
                          value: create(
                            DmxFixtureDefinition_Channel_AngleMappingSchema,
                            {
                              minDegrees: 0,
                              maxDegrees: 360,
                            },
                          ),
                        };
                      } else if (
                        isAmountChannel(newType) &&
                        channel.mapping.case !== 'amountMapping'
                      ) {
                        channel.mapping = {
                          case: 'amountMapping',
                          value: create(
                            DmxFixtureDefinition_Channel_AmountMappingSchema,
                            {
                              minValue: 0,
                              maxValue: 255,
                            },
                          ),
                        };
                      } else if (
                        newType === 'color_wheel' &&
                        channel.mapping.case !== 'colorWheelMapping'
                      ) {
                        channel.mapping = {
                          case: 'colorWheelMapping',
                          value: create(
                            DmxFixtureDefinition_Channel_ColorWheelMappingSchema,
                            {},
                          ),
                        };
                      } else if (channel.mapping.case != undefined) {
                        channel.mapping = {
                          case: undefined,
                          value: undefined,
                        };
                      }
                      channel.type = newType;
                      save(`Change type of mapping for channel ${index}.`);
                    }}
                  >
                    <option value="unset">Unset</option>
                    <option value="other">Other</option>
                    {[...COLOR_CHANNELS, ...AMOUNT_CHANNELS, ...ANGLE_CHANNELS]
                      .flatMap((t) => [t, `${t}-fine`])
                      .map((t, i) => (
                        <option key={i} value={t}>
                          {t}
                        </option>
                      ))}
                    <option value="color_wheel">color wheel</option>
                  </select>
                </td>
                <td>
                  {channel != null && (
                    <NumberInput
                      min={0}
                      max={255}
                      value={channel.defaultValue}
                      onChange={(v) => {
                        channel.defaultValue = v;
                      }}
                      onFinalize={(v) =>
                        save(
                          `Set default value of channel mapping ${index} to ${v}.`,
                        )
                      }
                    />
                  )}
                </td>
                <ChannelMapping
                  index={index}
                  type={channel?.type}
                  mapping={channel?.mapping}
                  setWheelChannel={setWheelChannel}
                />
                <td>
                  <NumberInput
                    min={0}
                    max={255}
                    value={testValues[i] || 0}
                    onChange={(v) => {
                      setTestValues((testValues) => {
                        testValues[i] = v;
                        return [...testValues];
                      });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {wheel && (
        <ColorWheelEditor wheel={wheel} onClose={() => setWheelChannel(null)} />
      )}
    </Modal>
  );
}

interface ChannelMappingProps {
  index: number;
  type: string | undefined;
  mapping: DmxFixtureDefinition_Channel['mapping'] | undefined;
  setWheelChannel: (wheel: number) => void;
}

function ChannelMapping({
  index,
  type,
  mapping,
  setWheelChannel,
}: ChannelMappingProps) {
  const { save } = useContext(ProjectContext);

  if (type == null || mapping == null) {
    return <td colSpan={4}></td>;
  }

  switch (mapping.case) {
    case 'angleMapping':
      return (
        <>
          <td>
            <NumberInput
              min={-720}
              max={720}
              value={mapping.value.minDegrees}
              onChange={(v) => {
                if (mapping.case === 'angleMapping') {
                  mapping.value.minDegrees = v;
                }
              }}
              onFinalize={(v) =>
                save(`Set channel ${index} min degrees to ${v}.`)
              }
            />
          </td>
          <td>
            <NumberInput
              min={-720}
              max={720}
              value={mapping.value.maxDegrees}
              onChange={(v) => {
                if (mapping.case === 'angleMapping') {
                  mapping.value.maxDegrees = v;
                }
              }}
              onFinalize={(v) =>
                save(`Set channel ${index} max degrees to ${v}.`)
              }
            />
          </td>
          <td colSpan={2}></td>
        </>
      );
    case 'amountMapping':
      return (
        <>
          <td colSpan={2}></td>
          <td>
            <RangeInput
              title={`Minimum value for ${type} channel.`}
              value={mapping.value.minValue}
              onChange={(value) => {
                if (mapping.case === 'amountMapping') {
                  mapping.value.minValue = value;
                }
              }}
              onFinalize={(value) =>
                save(`Set channel ${index} min value to ${value}.`)
              }
              max="255"
            />
          </td>
          <td>
            <RangeInput
              title={`Maximum value for ${type} channel.`}
              value={mapping.value.maxValue}
              onChange={(value) => {
                if (mapping.case === 'amountMapping') {
                  mapping.value.maxValue = value;
                }
              }}
              onFinalize={(value) =>
                save(`Set channel ${index} max value to ${value}.`)
              }
              max="255"
            />
          </td>
        </>
      );
    case 'colorWheelMapping':
      return (
        <td colSpan={4}>
          <Button onClick={() => setWheelChannel(index)}>
            Edit Color Wheel
          </Button>
        </td>
      );
    default:
      return <td colSpan={4}></td>;
  }
}

interface ColorWheelEditorProps {
  wheel: DmxFixtureDefinition_Channel_ColorWheelMapping;
  onClose: () => void;
}

function ColorWheelEditor({ wheel, onClose }: ColorWheelEditorProps) {
  const { save } = useContext(ProjectContext);
  return (
    <Modal
      title="Edit Color Wheel"
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <table>
        <thead>
          <tr>
            <td>Value</td>
            <td>Color</td>
            <td>Name</td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          {wheel.colors
            .filter((c) => c.color != null)
            .map((c, i) => (
              <tr key={i}>
                <td>
                  <NumberInput
                    min={0}
                    max={512}
                    value={c.value}
                    onChange={(value) => {
                      c.value = value;
                    }}
                    onFinalize={(value) =>
                      save(`Change color wheel value to ${value}.`)
                    }
                  />
                </td>
                <td>
                  <ColorSwatch
                    color={c.color!}
                    updateDescription="Update color wheel color."
                  />
                </td>
                <td>
                  <TextInput
                    value={c.name}
                    onChange={(value) => {
                      c.name = value;
                      save(`Change name of color on wheel to ${value};`);
                    }}
                  />
                </td>
                <td>
                  <IconButton
                    title={`Delete ${c.name}`}
                    onClick={() => {
                      wheel.colors = wheel.colors.filter((color) => color != c);
                      save(`Deleted color ${c.name} from wheel.`);
                    }}
                  >
                    <BiTrash />
                  </IconButton>
                </td>
              </tr>
            ))}
          <tr>
            <td colSpan={4}>
              <Button
                icon={<BiPlus />}
                onClick={() => {
                  wheel.colors.push(
                    create(
                      DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColorSchema,
                      {
                        name: 'New color',
                        value: 512,
                        color: {
                          red: 1,
                          green: 1,
                          blue: 1,
                        },
                      },
                    ),
                  );
                  save('Added color to color wheel.');
                }}
              >
                Add new Color
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
