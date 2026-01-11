import { create } from '@bufbuild/protobuf';
import { JSX, useContext, useEffect, useMemo, useState } from 'react';
import { ProjectContext } from '../../contexts/ProjectContext';

import {
  DmxFixtureDefinition,
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
import { WledRenderTargetSchema } from '@dmx-controller/proto/wled_pb';
import { BiCopyAlt, BiGridVertical, BiPlus, BiTrash } from 'react-icons/bi';
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
import { setRenderFunctions } from '../../engine/renderRouter';
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
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    bigint | null
  >(null);
  const [highlightDrop, setHighlightDrop] = useState(false);

  const selectedDefinition = useMemo(() => {
    const id = selectedDefinitionId?.toString();
    if (id == null) {
      return undefined;
    }
    return project.fixtureDefinitions?.dmxFixtureDefinitions[id];
  }, [project, selectedDefinitionId]);

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
          .map(([id, definition]) => (
            <li key={id}>
              {definition.name}
              {Object.entries(definition.modes).map(([modeId, e], i) => {
                const f: DraggableDmxFixture = {
                  id: randomUint64(),
                  definition: BigInt(id),
                  mode: modeId,
                };
                return (
                  <VersatileElement
                    key={i}
                    className={styles.mode}
                    id={f.id}
                    element={f}
                    onClick={() => setSelectedDefinitionId(BigInt(id))}
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
          const newId = randomUint64();
          const newDefinition = create(DmxFixtureDefinitionSchema, {
            name: 'New Fixture Profile',
          });
          newDefinition.modes[newId.toString()] = create(
            DmxFixtureDefinition_ModeSchema,
            {
              name: 'Default',
              numChannels: 1,
            },
          );
          project.fixtureDefinitions!.dmxFixtureDefinitions[newId.toString()] =
            newDefinition;
          setSelectedDefinitionId(newId);
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
      {selectedDefinition && (
        <EditDefinitionDialog
          definition={selectedDefinition}
          close={() => setSelectedDefinitionId(null)}
          copy={() => {
            if (selectedDefinition == null) {
              return;
            }
            const newId = randomUint64();
            const definition = create(
              DmxFixtureDefinitionSchema,
              selectedDefinition,
            );
            definition.name = 'Copy of ' + selectedDefinition.name;
            project.fixtureDefinitions!.dmxFixtureDefinitions[
              newId.toString()
            ] = definition;
            setSelectedDefinitionId(BigInt(newId));
            save(`Copy fixture profile ${selectedDefinition.name}.`);
          }}
          deleteDefinition={() => {
            const id = selectedDefinitionId?.toString();
            if (id == null) {
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
  definition: DmxFixtureDefinition;
  close: () => void;
  copy: () => void;
  deleteDefinition: () => void;
}

function EditDefinitionDialog({
  definition,
  close,
  copy,
  deleteDefinition,
}: EditDefinitionDialogProps): JSX.Element {
  const { save } = useContext(ProjectContext);
  const [modeId, setModeId] = useState<string>(
    Object.keys(definition.modes)[0],
  );
  const [testIndex, setTestIndex] = useState(0);
  const [testValues, setTestValues] = useState<number[]>([]);
  const [wheel, setWheel] =
    useState<DmxFixtureDefinition_Channel_ColorWheelMapping | null>(null);

  useEffect(() => {
    const testValues: number[] = [];
    Object.entries(mode.channels).forEach(([i, c]) => {
      testValues[parseInt(i) - 1 + testIndex] = c.defaultValue || 0;
    });
    setTestValues(testValues);
  }, [setTestValues]);

  useEffect(
    () =>
      setRenderFunctions({
        renderDmx: async (_output) => {
          const renderOutput = new Uint8Array(512);
          for (let i = 0; i < mode.numChannels; ++i) {
            renderOutput[i + testIndex] = testValues[i] || 0;
          }
          return renderOutput;
        },
        renderWled: async () =>
          create(WledRenderTargetSchema, { segments: [] }),
      }),
    [testIndex, testValues],
  );

  const mode = definition.modes[modeId];

  return (
    <Modal
      title={'Edit ' + definition.name}
      onClose={close}
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
        <IconButton title="Copy Fixture Profile" onClick={copy}>
          <BiCopyAlt />
        </IconButton>
        <IconButton
          variant="warning"
          title="Delete Fixture Profile"
          onClick={deleteDefinition}
        >
          <BiTrash />
        </IconButton>
      </div>

      <div className={styles.editorMetadata}>
        <label>
          <span>Mode</span>
          <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
            {Object.keys(definition.modes).map((m) => (
              <option key={m} value={m}>
                {definition.modes[m].name}
              </option>
            ))}
          </select>
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
              save(`Set number of channels of ${mode.name} to ${v}.`);
            }}
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
                        save(
                          `Set default value of channel mapping ${index} to ${v}.`,
                        );
                      }}
                    />
                  )}
                </td>
                <ChannelMapping
                  index={index}
                  type={channel?.type}
                  mapping={channel?.mapping}
                  setWheel={setWheel}
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
        <ColorWheelEditor wheel={wheel} onClose={() => setWheel(null)} />
      )}
    </Modal>
  );
}

interface ChannelMappingProps {
  index: number;
  type: string | undefined;
  mapping: DmxFixtureDefinition_Channel['mapping'] | undefined;
  setWheel: (wheel: DmxFixtureDefinition_Channel_ColorWheelMapping) => void;
}

function ChannelMapping({
  index,
  type,
  mapping,
  setWheel,
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
                  save(`Set channel ${index} min degrees to ${v}.`);
                }
              }}
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
                  save(`Set channel ${index} max degrees to ${v}.`);
                }
              }}
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
                  save(`Set channel ${index} min value to ${value}.`);
                }
              }}
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
                  save(`Set channel ${index} max value to ${value}.`);
                }
              }}
              max="255"
            />
          </td>
        </>
      );
    case 'colorWheelMapping':
      return (
        <td colSpan={4}>
          <Button onClick={() => setWheel(mapping.value)}>
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
                      save(`Change color wheel value to ${value}.`);
                    }}
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
