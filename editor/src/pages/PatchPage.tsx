import { createRef, useContext, useEffect, useMemo, useState } from 'react';
import IconBxCopyAlt from '../icons/IconBxCopy';
import IconBxDownload from '../icons/IconBxDownload';
import IconBxUpload from '../icons/IconBxUpload';
import IconBxX from '../icons/IconBxX';
import RangeInput from '../components/RangeInput';
import styles from './PatchPage.module.scss';
import { Button, IconButton } from '../components/Button';
import { FixtureDefinition, FixtureDefinition_Channel, FixtureDefinition_Channel_AmountMapping, FixtureDefinition_Channel_AngleMapping, FixtureDefinition_Channel_ColorWheelMapping, FixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor, FixtureDefinition_Mode, PhysicalFixture, PhysicalFixtureGroup } from '@dmx-controller/proto/fixture_pb';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Modal } from '../components/Modal';
import { NumberInput, TextInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { SerializedUniverse, Universe } from '@dmx-controller/proto/universe_pb';
import { downloadBlob, escapeForFilesystem } from '../util/fileUtils';
import { getActiveUniverse } from '../util/projectUtils';
import { randomUint64 } from '../util/numberUtils';
import { EditGroupDialog } from '../components/EditGroupDialog';
import { extractGdtf } from '../util/gdtf';
import { Warning } from '../components/Warning';
import { deleteFixture, deleteFixtureGroup } from '../engine/fixture';
import { AMOUNT_CHANNELS, ANGLE_CHANNELS, ChannelTypes, COLOR_CHANNELS, isAmountChannel, isAngleChannel } from '../engine/channel';
import { BiPlus, BiX } from 'react-icons/bi';
import { ColorSwatch } from '../components/ColorSwatch';

export default function PatchPage(): JSX.Element {
  return (
    <div className={styles.wrapper}>
      <HorizontalSplitPane
        className={styles.splitPane}
        left={<FixtureList />}
        right={<FixtureDefinitionList />}
      />
    </div>
  );
}

function FixtureList(): JSX.Element | null {
  const { project, save } = useContext(ProjectContext);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<bigint | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<bigint | null>(null);
  const uploadButtonRef = createRef<HTMLInputElement>();

  const selectedFixture = useMemo(
    () => getActiveUniverse(project)?.fixtures[String(selectedFixtureId)],
    [project, selectedFixtureId]);
  const selectedGroup = useMemo(
    () => project?.groups[String(selectedGroupId)],
    [project, selectedGroupId]);

  useEffect(() => {
    if (uploadButtonRef.current) {
      const button = uploadButtonRef.current;
      const handleUpload = async () => {
        if (button == null) {
          return;
        }
        const file = button.files![0];
        const body = new Uint8Array(await file.arrayBuffer())
        const serialized = SerializedUniverse.fromBinary(body);
        project.fixtureDefinitions =
          Object.assign({}, serialized.fixtureDefinitions, project.fixtureDefinitions);
        if (project.universes == null) {
          throw new Error('Project universe array was not set!');
        }
        if (serialized.universe == null) {
          throw new Error('Serialized universes was not set!');
        }
        project.universes[serialized.id.toString()] = serialized.universe;
        project.activeUniverse = serialized.id;
        save(`Upload patch ${serialized.universe.name}.`);
      };
      button.addEventListener('change', handleUpload);
      return () => button.removeEventListener('change', handleUpload);
    }
    return undefined;
  }, [uploadButtonRef.current, project, save]);

  return (
    <div className={styles.pane}>
      <select
        value={project.activeUniverse.toString()}
        onChange={(e) => {
          project.activeUniverse = BigInt(e.target.value);
          save(`Change active patch to ${getActiveUniverse(project).name}.`);
        }}>
        {
          Object.entries(project.universes).map(([i, u]) =>
            <option key={i} value={i.toString()}>
              {u.name}
            </option>
          )
        }
      </select>
      <TextInput
        value={getActiveUniverse(project).name}
        onChange={(v) => {
          getActiveUniverse(project).name = v;
          save(`Set patch name to "${v}".`);
        }}
      />
      <IconButton
        title={`Download patch ${getActiveUniverse(project).name}`}
        onClick={() => {
          const fixtures: { [id: string]: FixtureDefinition } = {};
          const universe = getActiveUniverse(project);
          Object.values(universe.fixtures)
            .map(f => {
              const id = f.fixtureDefinitionId;
              fixtures[id] = project.fixtureDefinitions[id];
            });
          const serialized = new SerializedUniverse({
            id: project.activeUniverse,
            universe: universe,
            fixtureDefinitions: fixtures,
          });

          const blob = new Blob([serialized.toBinary()], {
            type: 'application/protobuf',
          });

          downloadBlob(blob, escapeForFilesystem(universe.name) + '.patch.dmxapp');
        }}>
        <IconBxDownload />
      </IconButton>
      <IconButton
        title="Upload patch"
        onClick={() => uploadButtonRef.current?.click()}>
        <IconBxUpload />
      </IconButton>
      <input ref={uploadButtonRef} type="file" hidden></input>
      <Button onClick={() => {
        const id = randomUint64();
        project.universes[id.toString()] = new Universe({
          name: 'New Patch'
        });
        project.activeUniverse = id;
        save('Create a new patch.');
      }}>
        Create new patch
      </Button>
      <div>
        Offset MS:
        <NumberInput
          min={-1000}
          max={1000}
          value={project?.timingOffsetMs || 0}
          onChange={(v) => {
            if (project) {
              project.timingOffsetMs = v;
              save(`Update project timing offset to ${v}ms.`);
            }
          }} />
      </div>
      <h2>⧇ Fixtures</h2>
      <ol>
        {
          Object.entries(getActiveUniverse(project).fixtures)
            .sort((a, b) => a[1].channelOffset - b[1].channelOffset)
            .map(([id, fixture]) => {
              const definition =
                project.fixtureDefinitions[fixture.fixtureDefinitionId];

              const mode = definition?.modes[fixture.fixtureMode];

              let numChannels = fixture.channelOffset + mode?.numChannels;
              if (isNaN(numChannels)) {
                numChannels = fixture.channelOffset + 1;
              }

              return (
                <li key={id} onClick={() => {
                  setSelectedFixtureId(BigInt(id));
                }}>
                  (
                  {fixture.channelOffset + 1}
                  &nbsp;—&nbsp;
                  {numChannels}
                  )
                  &nbsp;
                  {fixture.name}
                  {
                    mode == null &&
                    <>
                      &nbsp;
                      <Warning title='Fixture does not have profile set!' />
                    </>
                  }
                </li>
              );
            })
        }
      </ol>
      <Button onClick={() => {
        const newId = randomUint64();
        getActiveUniverse(project).fixtures[newId.toString()] =
          new PhysicalFixture({
            name: 'New Fixture',
          });
        setSelectedFixtureId(newId);
        save(`Create new fixture.`);
      }}>
        + Add New Fixture
      </Button>
      <h2>⧉ Groups</h2>
      <ul>
        {
          Object.entries(project.groups)
            .map(([id, group]) => (
              <li key={id} onClick={() => setSelectedGroupId(BigInt(id))}>
                {group.name}
              </li>
            ))
        }
      </ul>
      <Button onClick={() => {
        const newId = randomUint64();
        project.groups[newId.toString()] = new PhysicalFixtureGroup({
          name: 'New Group',
        });
        setSelectedGroupId(newId);
        save('Create new group.');
      }}>
        + Add New Group
      </Button>
      {
        selectedFixture &&
        <EditFixtureDialog
          fixture={selectedFixture}
          close={() => setSelectedFixtureId(null)}
          onDelete={() => {
            if (selectedFixtureId == null) {
              throw new Error('SelectedFixture ID was not set!');
            }
            const name = getActiveUniverse(project).fixtures[selectedFixtureId.toString()].name;
            deleteFixture(project, selectedFixtureId);
            save(`Delete fixture ${name}.`);
          }} />
      }
      {
        selectedGroup != null && selectedGroupId != null ?
          <EditGroupDialog
            groupId={selectedGroupId}
            group={selectedGroup}
            close={() => setSelectedGroupId(null)}
            onDelete={() => {
              const name = project.groups[selectedGroupId.toString()].name;
              deleteFixtureGroup(project, selectedGroupId);
              save(`Delete fixture group ${name}.`);
            }} />
          : null
      }
    </div>
  );
}

interface EditFixtureDialogProps {
  fixture: PhysicalFixture;
  close: () => void;
  onDelete: () => void;
}

function EditFixtureDialog({
  fixture,
  close,
  onDelete,
}: EditFixtureDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  const definition: FixtureDefinition | undefined = useMemo(
    () => project.fixtureDefinitions[fixture.fixtureDefinitionId],
    [project, fixture]);

  return (
    <Modal
      title={"Edit " + fixture.name}
      onClose={close}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={close} variant="primary">
            Done
          </Button>
        </div>
      }>
      <div>
        <Button
          variant='warning'
          onClick={onDelete}>
          Delete Fixture
        </Button>
      </div>
      <label>
        <span>Name</span>
        <TextInput
          value={fixture.name}
          onChange={(v) => {
            fixture.name = v;
            save(`Change fixture name to ${v}.`);
          }} />
      </label>
      <label>
        <span>Profile</span>
        <select
          value={fixture.fixtureDefinitionId}
          onChange={(e) => {
            fixture.fixtureDefinitionId = e.target.value;
            fixture.fixtureMode = Object.keys(project.fixtureDefinitions[fixture.fixtureDefinitionId].modes)[0];
            let definitionName = '<unset>';
            if (fixture.fixtureDefinitionId !== '') {
              definitionName = project.fixtureDefinitions[fixture.fixtureDefinitionId].name;
            }
            save(`Change fixture profile for ${fixture.name} to ${definitionName}`);
          }}>
          <option key="unset" value={''}>
            &lt;unset&gt;
          </option>
          {
            Object.entries(project.fixtureDefinitions)
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, definition]) => (
                <option key={id} value={id}>
                  {definition.name}
                </option>
              ))
          }
        </select>
        <select
          value={fixture.fixtureMode}
          onChange={(e) => {
            fixture.fixtureMode = e.target.value;
            let modeName = '<unset>';
            if (fixture.fixtureMode !== '') {
              modeName = project.fixtureDefinitions[fixture.fixtureDefinitionId].modes[fixture.fixtureMode].name;
            }
            save(`Change fixture profile for ${fixture.name} to ${modeName}`);
          }}>
          <option disabled={true} key="unset" value={''}>
            &lt;unset&gt;
          </option>
          {
            Object.entries(project.fixtureDefinitions[fixture.fixtureDefinitionId]?.modes || {})
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, mode]) => (
                <option key={id} value={id}>
                  {mode.name}
                </option>
              ))
          }
        </select>
        {
          (fixture.fixtureDefinitionId == '' || fixture.fixtureMode == '') &&
          <Warning title='Fixture does not have profile set!' />
        }
      </label>
      <label>
        <span>Channel</span>
        <NumberInput
          min={1}
          max={512}
          value={fixture.channelOffset + 1}
          onChange={(v) => {
            fixture.channelOffset = v - 1;
            save(`Change channel offset of ${fixture.name} to ${v}.`);
          }} />
      </label>
      {
        definition != null &&
        ANGLE_CHANNELS
          .filter(t => Object.values(definition.channels)
            .some(c => c.type === t))
          .map((t, i) => (
            <label key={i}>
              <span>{String(t).charAt(0).toUpperCase() + String(t).slice(1)} Offset</span>
              <NumberInput
                min={-360}
                max={360}
                value={fixture.channelOffsets[t] || 0}
                onChange={(v) => {
                  fixture.channelOffsets[t] = v;
                  save(`Change ${t} offset of ${fixture.name} to ${v}.`);
                }} />
            </label>
          ))
      }
    </Modal>
  );
}

function FixtureDefinitionList(): JSX.Element | null {
  const { project, save } = useContext(ProjectContext);
  const [selectedDefinitionId, setSelectedDefinitionId] =
    useState<string | null>(null);
  const [highlightDrop, setHighlightDrop] = useState(false);

  const selectedDefinition = useMemo(
    () => {
      const id = selectedDefinitionId?.toString();
      if (id == null) {
        return undefined;
      }
      return project?.fixtureDefinitions[id];
    },
    [project, selectedDefinitionId]);


  const classes = [styles.pane];
  if (highlightDrop) {
    classes.push(styles.highlightDrop);
  }

  return (
    <div className={classes.join(' ')}
      onDragOver={(e) => {
        setHighlightDrop(true);
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
          for (let i = 0; i < e.dataTransfer.items.length; ++i) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile() as File;
              const fixtureDefinition = await extractGdtf(file);
              project.fixtureDefinitions[fixtureDefinition.globalId] = fixtureDefinition;
              save(`Add ${fixtureDefinition.name} fixture profile.`);
            }
          }
        })();

        setHighlightDrop(false);
      }}>
      <h2>Fixture Profiles</h2>
      <ul>
        {
          Object.entries(project.fixtureDefinitions)
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, definition]) => (
              <li key={id} onClick={() => setSelectedDefinitionId(id)}>
                {definition.name}
              </li>
            ))
        }
      </ul>
      <Button onClick={() => {
        const newId = crypto.randomUUID();
        const newDefinition = new FixtureDefinition({
          name: 'New Fixture Profile',
        });
        newDefinition.modes[crypto.randomUUID()] = new FixtureDefinition_Mode({
          name: 'Default',
        });
        project.fixtureDefinitions[newId.toString()] = newDefinition;
        setSelectedDefinitionId(newId);
        save('Create new fixture profile.');
      }}>
        + Add New Fixture Profile
      </Button>
      <p className={styles.hint}>
        <strong>Hint:</strong> You can drag and drop .gdtf fixture profile files
        downloaded from&nbsp;
        <a href="https://gdtf-share.com/share.php" target="_blank">GDTF Share</a>
        &nbsp;onto this pane to quickly import profiles.
      </p>
      {
        selectedDefinition &&
        <EditDefinitionDialog definition={selectedDefinition}
          close={() => setSelectedDefinitionId(null)}
          copy={() => {
            if (selectedDefinition == null) {
              return;
            }
            const newId = crypto.randomUUID();
            const definition = new FixtureDefinition(selectedDefinition);
            definition.name = "Copy of " + selectedDefinition.name;
            project.fixtureDefinitions[newId.toString()] = definition;
            setSelectedDefinitionId(newId);
            save(`Copy fixture profile ${selectedDefinition.name}.`);
          }}
          deleteDefinition={() => {
            const id = selectedDefinitionId?.toString();
            if (id == null) {
              return;
            }
            const name = project.fixtureDefinitions[id].name;
            delete project.fixtureDefinitions[id];
            save(`Delete fixture profile ${name}.`);
          }} />
      }
    </div>
  );
}

interface EditDefinitionDialogProps {
  definition: FixtureDefinition;
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
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);
  const [modeId, setModeId] = useState<string>(Object.keys(definition.modes)[0]);
  const [testIndex, setTestIndex] = useState(0);
  const [testValues, setTestValues] = useState([] as number[]);
  const [wheel, setWheel] = useState<FixtureDefinition_Channel_ColorWheelMapping | null>(null);

  useEffect(() => {
    const testValues: number[] = [];
    Object.entries(mode.channels).forEach(([i, c]) => {
      testValues[parseInt(i) - 1 + testIndex] = c.defaultValue || 0;
    });
    setTestValues(testValues);
  }, [setTestValues]);

  useEffect(() => {
    const render = () => {
      const universe = new Uint8Array(512);
      for (let i = 0; i < mode.numChannels; ++i) {
        universe[i + testIndex] = testValues[i] || 0;
      }
      return universe;
    };

    setRenderUniverse(render);
    return () => clearRenderUniverse(render);
  }, [definition, testIndex, testValues, setRenderUniverse, clearRenderUniverse]);

  const mode = definition.modes[modeId];

  return (
    <Modal
      title={"Edit " + definition.name}
      onClose={close}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={close} variant="primary">
            Done
          </Button>
        </div>
      }>
      <IconButton
        title="Copy Fixture Profile"
        onClick={copy}>
        <IconBxCopyAlt />
      </IconButton>
      <IconButton
        variant='warning'
        title="Delete Fixture Profile"
        onClick={deleteDefinition}>
        <IconBxX />
      </IconButton>
      <div>
        <label>
          <span>Name</span>
          <TextInput
            value={definition.name}
            onChange={(v) => {
              definition.name = v;
              save(`Change fixture profile name to ${v}.`);
            }} />
        </label>
        <label>
          <span>Manufacturer</span>
          <TextInput
            value={definition.manufacturer}
            onChange={(v) => {
              definition.manufacturer = v;
              save(`Set manufacturer of fixture profile ${definition.name} to ${v}.`);
            }} />
        </label>
      </div>

      <label>
        <span>Mode</span>
        <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
          {
            Object.keys(definition.modes)
              .map((m) => <option key={m} value={m}>{definition.modes[m].name}</option>)
          }
        </select>
      </label>

      <label>
        <span>Total channels</span>
        <NumberInput
          min={Math.max(0, ...Object.keys(mode.channels).map(i => parseInt(i)))}
          max={512}
          value={mode.numChannels}
          onChange={(v) => {
            mode.numChannels = v;
            save(`Set number of channels of ${mode.name} to ${v}.`);
          }} />
      </label>
      <label>
        <span>Test fixture index</span>
        <NumberInput
          min={1}
          max={512}
          value={testIndex + 1}
          onChange={(v) => setTestIndex(v - 1)} />
      </label>
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
          {
            Array.from(Array(mode.numChannels), (_, i) => {
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
                          mode.channels[index] = new FixtureDefinition_Channel({
                            type: newType,
                            mapping: {
                              case: undefined,
                              value: undefined,
                            },
                          });
                        }

                        const channel = mode.channels[index];

                        if (isAngleChannel(newType) && channel.mapping.case !== 'angleMapping') {
                          channel.mapping = {
                            case: 'angleMapping',
                            value: new FixtureDefinition_Channel_AngleMapping({
                              minDegrees: 0,
                              maxDegrees: 360,
                            }),
                          };
                        } else if (isAmountChannel(newType) && channel.mapping.case !== 'amountMapping') {
                          channel.mapping = {
                            case: 'amountMapping',
                            value: new FixtureDefinition_Channel_AmountMapping({
                              minValue: 0,
                              maxValue: 255,
                            }),
                          };
                        } else if (channel.mapping.case != undefined) {
                          channel.mapping = {
                            case: undefined,
                            value: undefined,
                          };
                        }
                        channel.type = newType;
                        save(`Change type of mapping for channel ${index}.`);
                      }}>
                      <option value="unset">Unset</option>
                      <option value="other">Other</option>
                      {
                        [...COLOR_CHANNELS, ...AMOUNT_CHANNELS, ...ANGLE_CHANNELS]
                          .flatMap(t => [t, `${t}-fine`])
                          .map((t, i) => (
                            <option key={i} value={t}>{t}</option>
                          ))
                      }
                      <option value="color_wheel">color wheel</option>
                    </select>
                  </td>
                  <td>
                    {
                      channel != null &&
                      <NumberInput
                        min={0}
                        max={255}
                        value={channel.defaultValue}
                        onChange={(v) => {
                          channel.defaultValue = v;
                          save(`Set default value of channel mapping ${index} to ${v}.`);
                        }} />
                    }
                  </td>
                  <ChannelMapping
                    index={index}
                    type={channel?.type}
                    mapping={channel?.mapping}
                    setWheel={setWheel} />
                  <td>
                    <NumberInput
                      min={0}
                      max={255}
                      value={testValues[i] || 0}
                      onChange={(v) => {
                        setTestValues(testValues => {
                          testValues[i] = v;
                          return [...testValues];
                        })
                      }} />
                  </td>
                </tr>
              );
            })
          }
        </tbody>
      </table>
      {
        wheel &&
        <ColorWheelEditor wheel={wheel} onClose={() => setWheel(null)} />
      }
    </Modal>
  );
}

interface ChannelMappingProps {
  index: number;
  type: string | undefined;
  mapping: FixtureDefinition_Channel['mapping'] | undefined;
  setWheel: (wheel: FixtureDefinition_Channel_ColorWheelMapping) => void;
}

function ChannelMapping({ index, type, mapping, setWheel }: ChannelMappingProps) {
  const { save } = useContext(ProjectContext);

  if (type == null || mapping == null) {
    return (
      <td colSpan={4}></td>
    );
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
              }} />
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
              }} />
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
              max="255" />
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
              max="255" />
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
      return (
        <td colSpan={4}>
        </td>
      );
  }
}

interface ColorWheelEditorProps {
  wheel: FixtureDefinition_Channel_ColorWheelMapping;
  onClose: () => void;
}

function ColorWheelEditor({ wheel, onClose }: ColorWheelEditorProps) {
  const { save } = useContext(ProjectContext);
  return (
    <Modal
      title="Edit Color Wheel"
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}>
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
          {
            wheel.colors
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
                      }} />
                  </td>
                  <td>
                    <ColorSwatch color={c.color!} updateDescription="Update color wheel color." />
                  </td>
                  <td>
                    <TextInput
                      value={c.name}
                      onChange={(value) => {
                        c.name = value;
                        save(`Change name of color on wheel to ${value};`)
                      }} />
                  </td>
                  <td>
                    <IconButton
                      title={`Delete ${c.name}`}
                      onClick={() => {
                        wheel.colors = wheel.colors.filter((color) => color != c);
                        save(`Deleted color ${c.name} from wheel.`);
                      }}>
                      <BiX />
                    </IconButton>
                  </td>
                </tr>
              ))
          }
          <tr>
            <td colSpan={4}>
              <Button
                icon={<BiPlus />}
                onClick={() => {
                  wheel.colors.push(new FixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor({
                    name: 'New color',
                    value: 512,
                    color: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                  }));
                  save('Added color to color wheel.');
                }}>
                Add new Color
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}
