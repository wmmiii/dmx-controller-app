import React, { createRef, useContext, useEffect, useMemo, useState } from 'react';
import IconBxCopyAlt from '../icons/IconBxCopy';
import IconBxX from '../icons/IconBxX';
import RangeInput from '../components/RangeInput';
import styles from './UniversePage.module.scss';
import { Button, IconButton } from '../components/Button';
import { FixtureDefinition, FixtureDefinition_Channel, FixtureDefinition_Channel_AmountMapping, FixtureDefinition_Channel_AngleMapping, PhysicalFixture, PhysicalFixtureGroup, PhysicalFixtureGroup_FixtureList } from '@dmx-controller/proto/fixture_pb';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Modal } from '../components/Modal';
import { NumberInput, TextInput } from '../components/Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { SerializedUniverse, Universe } from '@dmx-controller/proto/universe_pb';
import { AMOUNT_CHANNEL, ANGLE_CHANNEL, ChannelTypes, COLOR_CHANNELS, deleteFixture, deleteFixtureGroup, isAmountChannel, isAngleChannel, isColorChannel } from '../engine/fixture';
import { getActiveUniverse } from '../util/projectUtils';
import { getApplicableMembers } from '../engine/group';
import { randomUint64 } from '../util/numberUtils';
import IconBxDownload from '../icons/IconBxDownload';
import { downloadBlob, escapeForFilesystem } from '../util/fileUtils';
import IconBxUpload from '../icons/IconBxUpload';

export default function UniversePage(): JSX.Element {
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

function FixtureList(): JSX.Element {
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
        const file = button.files[0];
        const body = new Uint8Array(await file.arrayBuffer())
        const serialized = SerializedUniverse.fromBinary(body);
        project.fixtureDefinitions =
            Object.assign({}, serialized.fixtureDefinitions, project.fixtureDefinitions);
        project.universes[serialized.id.toString()] = serialized.universe;
        project.activeUniverse = serialized.id;
        save(`Upload universe ${serialized.universe.name}.`);
      };
      button.addEventListener('change', handleUpload);
      return () => button.removeEventListener('change', handleUpload);
    }
  }, [uploadButtonRef.current, project, save]);

  if (!project) {
    return null;
  }

  return (
    <div className={styles.pane}>
      <select
        value={project.activeUniverse.toString()}
        onChange={(e) => {
          project.activeUniverse = BigInt(e.target.value);
          save(`Change active universe to ${getActiveUniverse(project).name}.`);
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
          save(`Set universe name to "${v}".`);
        }}
      />
      <IconButton
        title={`Download universe ${getActiveUniverse(project).name}`}
        onClick={() => {
          const fixtures: { [id: string]: FixtureDefinition } = {};
          const universe = getActiveUniverse(project);
          Object.values(universe.fixtures)
            .map(f => {
              const id = f.fixtureDefinitionId.toString();
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

          downloadBlob(blob, escapeForFilesystem(universe.name) + '.universe.dmxapp');
        }}>
        <IconBxDownload />
      </IconButton>
      <IconButton
        title="Upload universe"
        onClick={() => uploadButtonRef.current?.click()}>
        <IconBxUpload />
      </IconButton>
      <input ref={uploadButtonRef} type="file" hidden></input>
      <Button onClick={() => {
        const id = randomUint64();
        project.universes[id.toString()] = new Universe({
          name: 'New Universe'
        });
        project.activeUniverse = id;
        save('Create a new universe.');
      }}>
        Create new universe
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
      <h2>Fixtures</h2>
      <ol>
        {
          Object.entries(getActiveUniverse(project).fixtures)
            .sort((a, b) => a[1].channelOffset - b[1].channelOffset)
            .map(([id, fixture]) => {
              const definition =
                project.fixtureDefinitions[fixture.fixtureDefinitionId.toString()];

              return (
                <li key={id} onClick={() => {
                  setSelectedFixtureId(BigInt(id));
                }}>
                  (
                  {fixture.channelOffset + 1}
                  &nbsp;—&nbsp;
                  {fixture.channelOffset + definition?.numChannels}
                  ) {fixture.name}
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
      <h2>Groups</h2>
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
            const name = getActiveUniverse(project).fixtures[selectedFixtureId.toString()].name;
            deleteFixture(project, selectedFixtureId);
            save(`Delete fixture ${name}.`);
          }} />
      }
      {
        selectedGroup &&
        <EditGroupDialog
          groupId={selectedGroupId}
          group={selectedGroup}
          close={() => setSelectedGroupId(null)}
          onDelete={() => {
            const name = project.groups[selectedGroupId.toString()].name;
            deleteFixtureGroup(project, selectedGroupId);
            save(`Delete fixture group ${name}.`);
          }} />
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

  const definition = useMemo(
    () => project.fixtureDefinitions[fixture.fixtureDefinitionId.toString()],
    [project, fixture])

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
        <span>Definition</span>
        <select
          value={fixture.fixtureDefinitionId.toString()}
          onChange={(e) => {
            fixture.fixtureDefinitionId = BigInt(e.target.value);
            const definitionName = project.fixtureDefinitions[fixture.fixtureDefinitionId.toString()].name;
            save(`Change fixture definition for ${fixture.name} to ${definitionName}`);
          }}>
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
        ANGLE_CHANNEL
          .filter(t => Object.values(definition.channels).some(c => c.type === t))
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

interface EditGroupDialogProps {
  groupId: bigint;
  group: PhysicalFixtureGroup;
  close: () => void;
  onDelete: () => void;
}

function EditGroupDialog({
  groupId,
  group,
  close,
  onDelete,
}: EditGroupDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [newMemberIndex, setNewMemberIndex] = useState<number | null>(null);

  const applicableMembers = useMemo(
    () => getApplicableMembers(project, groupId),
    [project, group]);


  return (
    <Modal
      title={"Edit " + group.name}
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
          Delete Group
        </Button>
      </div>
      <label>
        <span>Name</span>
        <TextInput
          value={group.name}
          onChange={(v) => {
            group.name = v;
            save(`Change group name to ${v}.`);
          }} />
      </label>
      <div>Members:</div>
      {

        (Object.keys(group.fixtures).length +
          group.groups.length === 0) &&
        <div className='row'>No Members</div>
      }
      {
        group.groups.map((id, i) => (
          <div key={id} className={styles.row}>
            {project.groups[id.toString()]?.name}
            <IconButton
              title="Remove Group"
              onClick={() => {
                const name = project.groups[group.groups[i].toString()].name;
                group.groups.splice(i, 1);
                save(`Remove group ${name} from group ${group.name}.`);
              }}>
              <IconBxX />
            </IconButton>
          </div>
        ))
      }
      {
        group.fixtures?.[project.activeUniverse.toString()]?.fixtures.map((id, i) => (
          <div key={id} className={styles.row}>
            {getActiveUniverse(project).fixtures[id.toString()].name}
            <IconButton
              title="Remove Fixture"
              onClick={() => {
                const name = getActiveUniverse(project).fixtures[id.toString()].name;
                group.fixtures[project.activeUniverse.toString()].fixtures.splice(i, 1);
                save(`Remove fixture ${name} from group ${group.name}.`);
              }}>
              <IconBxX />
            </IconButton>
          </div>
        ))
      }
      <label className={styles.row}>
        <select
          value={newMemberIndex === null ? ' ' : newMemberIndex}
          onChange={(e) => {
            try {
              setNewMemberIndex(parseInt(e.target.value));
            } catch {
              setNewMemberIndex(null);
            }
          }}>
          <option value="null">
            &lt;Select Member&gt;
          </option>
          {
            applicableMembers.map((m, i) => (
              <option key={i} value={i}>
                {m.name}
              </option>
            ))
          }
        </select>
        <Button
          onClick={() => {
            if (newMemberIndex === null) {
              return;
            }

            const newMember = applicableMembers[newMemberIndex];

            let name: string;
            if (newMember.id.output.case === 'fixtures') {
              const id = newMember.id.output.value.fixtures[project.activeUniverse.toString()];
              if (group.fixtures[project.activeUniverse.toString()] == null) {
                group.fixtures[project.activeUniverse.toString()] = new PhysicalFixtureGroup_FixtureList({
                  fixtures: [],
                });
              }
              group.fixtures[project.activeUniverse.toString()].fixtures.push(id);
              name = getActiveUniverse(project).fixtures[id.toString()].name;
            } else if (newMember.id.output.case === 'group') {
              group.groups.push(newMember.id.output.value);
              name = project.groups[newMember.id.output.value.toString()].name;
            } else {
              throw new Error(`Unrecognized member type: ${newMember.id.output}`);
            }

            setNewMemberIndex(null);

            save(`Add ${name} to group ${group.name}.`);
          }}>
          + Add New Member
        </Button>
      </label>
    </Modal>
  );
}

function FixtureDefinitionList(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [selectedDefinitionId, setSelectedDefinitionId] =
    useState<bigint | null>(null);

  const selectedDefinition = useMemo(
    () => project?.fixtureDefinitions[selectedDefinitionId?.toString()],
    [project, selectedDefinitionId]);

  if (!project) {
    return;
  }

  return (
    <div className={styles.pane}>
      <h2>Fixture Definitions</h2>
      <ul>
        {
          Object.entries(project.fixtureDefinitions)
            .map(([id, definition]) => (
              <li key={id} onClick={() => setSelectedDefinitionId(BigInt(id))}>
                {definition.name}
              </li>
            ))
        }
      </ul>
      <Button onClick={() => {
        const newId = randomUint64();
        project.fixtureDefinitions[newId.toString()] = new FixtureDefinition({
          name: 'New Fixture Definition',
        });
        setSelectedDefinitionId(newId);
        save('Create new fixture definition.');
      }}>
        + Add New Fixture Definition
      </Button>
      {
        selectedDefinition &&
        <EditDefinitionDialog definition={selectedDefinition}
          close={() => setSelectedDefinitionId(null)}
          copy={() => {
            const newId = randomUint64();
            const definition = new FixtureDefinition(selectedDefinition);
            definition.name = "Copy of " + selectedDefinition.name;
            project.fixtureDefinitions[newId.toString()] = definition;
            setSelectedDefinitionId(newId);
            save(`Copy fixture definition ${selectedDefinition.name}.`);
          }}
          deleteDefinition={() => {
            const name = project.fixtureDefinitions[selectedDefinitionId.toString()].name;
            delete project.fixtureDefinitions[selectedDefinitionId.toString()];
            save(`Delete fixture definition ${name}.`);
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
  const [testIndex, setTestIndex] = useState(0);
  const [testValues, setTestValues] = useState([]);

  useEffect(() => {
    const testValues: number[] = [];
    Object.entries(definition.channels).forEach(([i, c]) => {
      testValues[parseInt(i) - 1 + testIndex] = c.defaultValue || 0;
    });
    setTestValues(testValues);
  }, [setTestValues]);

  useEffect(() => {
    const render = () => {
      const universe = new Uint8Array(512);
      for (let i = 0; i < definition.numChannels; ++i) {
        universe[i + testIndex] = testValues[i] || 0;
      }
      return universe;
    };

    setRenderUniverse(render);
    return () => clearRenderUniverse(render);
  }, [definition, testIndex, testValues, setRenderUniverse, clearRenderUniverse]);

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
        title="Copy Fixture Definition"
        onClick={copy}>
        <IconBxCopyAlt />
      </IconButton>
      <IconButton
        variant='warning'
        title="Delete Fixture Definition"
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
              save(`Change fixture definition name to ${v}.`);
            }} />
        </label>
        <label>
          <span>Manufacturer</span>
          <TextInput
            value={definition.manufacturer}
            onChange={(v) => {
              definition.manufacturer = v;
              save(`Set manufacturer of fixture definition ${definition.name} to ${v}.`);
            }} />
        </label>
      </div>
      <label>
        <span>Total channels</span>
        <NumberInput
          min={Math.max(0, ...Object.keys(definition.channels).map(i => parseInt(i)))}
          max={512}
          value={definition.numChannels}
          onChange={(v) => {
            definition.numChannels = v;
            save(`Set number of channels of ${definition.name} to ${v}.`);
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
            Array.from(Array(definition.numChannels), (_, i) => {
              const index = i + 1;
              const channel = definition.channels[index];
              return (
                <tr key={index}>
                  <td>{index}</td>
                  <td>
                    <select
                      value={channel?.type || 'unset'}
                      onChange={(e) => {
                        if (e.target.value === 'unset') {
                          delete definition.channels[index];
                          save(`Delete mapping for channel ${index}.`);
                          return;
                        }

                        const newType = e.target.value as ChannelTypes;
                        if (definition.channels[index] == null) {
                          definition.channels[index] = new FixtureDefinition_Channel({
                            type: newType,
                            mapping: {
                              case: undefined,
                              value: undefined,
                            },
                          });
                        }

                        const channel = definition.channels[index];
                        if (isAngleChannel(newType) && channel.mapping.case !== 'angleMapping') {
                          definition.channels[index].mapping = {
                            case: 'angleMapping',
                            value: new FixtureDefinition_Channel_AngleMapping({
                              minDegrees: 0,
                              maxDegrees: 360,
                            }),
                          };
                        } else if (isAmountChannel(newType) && channel.mapping.case !== 'amountMapping') {
                          definition.channels[index].mapping = {
                            case: 'amountMapping',
                            value: new FixtureDefinition_Channel_AmountMapping({
                              minValue: 0,
                              maxValue: 255,
                            }),
                          };
                        } else if (channel.mapping.case != undefined) {
                          definition.channels[index].mapping = {
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
                        [...COLOR_CHANNELS, ...AMOUNT_CHANNEL, ...ANGLE_CHANNEL]
                          .flatMap(t => [t, `${t}-fine`])
                          .map((t, i) => (
                            <option key={i} value={t}>{t}</option>
                          ))
                      }
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
                  {
                    isAngleChannel(channel?.type) ?
                      <>
                        <td>
                          <NumberInput
                            min={-720}
                            max={720}
                            value={(channel.mapping.value as FixtureDefinition_Channel_AngleMapping).minDegrees}
                            onChange={(v) => {
                              (channel.mapping.value as FixtureDefinition_Channel_AngleMapping).minDegrees = v;
                              save(`Set channel ${index} min degrees to ${v}.`);
                            }} />
                        </td>
                        <td>
                          <NumberInput
                            min={-720}
                            max={720}
                            value={(channel.mapping.value as FixtureDefinition_Channel_AngleMapping).maxDegrees}
                            onChange={(v) => {
                              (channel.mapping.value as FixtureDefinition_Channel_AngleMapping).maxDegrees = v;
                              save(`Set channel ${index} max degrees to ${v}.`);
                            }} />
                        </td>
                      </> :
                      <>
                        <td></td>
                        <td></td>
                      </>
                  }
                  {
                    isAmountChannel(channel?.type) ?
                      <>
                        <td>
                          <RangeInput
                            title={`Minimum value for ${channel?.type} channel.`}
                            value={(channel.mapping.value as FixtureDefinition_Channel_AmountMapping).minValue}
                            onChange={(value) => {
                              (channel.mapping.value as FixtureDefinition_Channel_AmountMapping).minValue = value;
                              save(`Set channel ${index} min value to ${value}.`);
                            }}
                            max="255" />
                        </td>
                        <td>
                          <RangeInput
                            title={`Maximum value for ${channel?.type} channel.`}
                            value={(channel.mapping.value as FixtureDefinition_Channel_AmountMapping).maxValue}
                            onChange={(value) => {
                              (channel.mapping.value as FixtureDefinition_Channel_AmountMapping).maxValue = value;
                              save(`Set channel ${index} max value to ${value}.`);
                            }}
                            max="255" />
                        </td>
                      </> :
                      <>
                        <td></td>
                        <td></td>
                      </>
                  }
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
    </Modal>
  );
}
