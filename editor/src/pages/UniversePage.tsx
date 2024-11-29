import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import IconBxCopyAlt from '../icons/IconBxCopy';
import IconBxX from '../icons/IconBxX';
import styles from './UniversePage.module.scss';
import { Button, IconButton } from '../components/Button';
import { FixtureDefinition, FixtureDefinition_Channel, PhysicalFixture, PhysicalFixtureGroup } from '@dmx-controller/proto/fixture_pb';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Modal } from '../components/Modal';
import { ProjectContext } from '../contexts/ProjectContext';
import { idMapToArray } from '../util/mapUtils';
import { getApplicableMembers } from '../engine/group';
import { NumberInput, TextInput } from '../components/Input';
import { deleteFixture, deleteFixtureGroup } from '../engine/fixture';
import { SerialContext } from '../contexts/SerialContext';
import { getActiveUniverse } from '../util/projectUtils';
import { randomUint64 } from '../util/numberUtils';
import { Universe } from '@dmx-controller/proto/universe_pb';

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

  const selectedFixture = useMemo(
    () => getActiveUniverse(project)?.fixtures[String(selectedFixtureId)],
    [project, selectedFixtureId]);
  const selectedGroup = useMemo(
    () => project?.groups[String(selectedGroupId)],
    [project, selectedGroupId]);

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
            idMapToArray(project.fixtureDefinitions)
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
              group.fixtures[project.activeUniverse.toString()].fixtures.push(id);
              name = getActiveUniverse(project).fixtures[id.toString()].name;
            } else if (newMember.id.output.case === 'group') {
              group.groups.push(newMember.id.output.value);
              name = project.groups[newMember.id.output.value.toString()].name;
            } else {
              throw new Error(`Unrecognized member type: ${newMember.id.output.case}`);
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
      testValues[parseInt(i) - 1] = c.defaultValue || 0;
    });
    setTestValues(testValues);
  }, [setTestValues]);

  useEffect(() => {
    const render = () => {
      const universe = new Uint8Array(512);
      for (let i = 0; i < definition.numChannels; ++i) {
        universe[i] = testValues[i] || 0;
      }
      return universe;
    };

    setRenderUniverse(render);
    return () => clearRenderUniverse(render);
  }, [definition, testValues, setRenderUniverse, clearRenderUniverse]);

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
            <th>Strobe</th>
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
                        if (channel == null) {
                          definition.channels[index] = new FixtureDefinition_Channel({
                            type: e.target.value,
                            minValue: 0,
                            maxValue: 255,
                          });
                          save(`Add mapping for channel ${index}.`);
                        } else if (e.target.value === 'unset') {
                          delete definition.channels[index];
                          save(`Delete mapping for channel ${index}.`);
                        } else {
                          channel.type = e.target.value;
                          save(`Change type of mapping for channel ${index}.`);
                        }
                      }}>
                      <option value="unset">Unset</option>
                      <option value="other">Other</option>
                      <option value="red">Red</option>
                      <option value="red-fine">Red Fine</option>
                      <option value="green">Green</option>
                      <option value="green-fine">Green Fine</option>
                      <option value="blue">Blue</option>
                      <option value="blue-fine">Blue Fine</option>
                      <option value="white">White</option>
                      <option value="white-fine">White Fine</option>
                      <option value="brightness">Brightness</option>
                      <option value="brightness-fine">Brightness Fine</option>
                      <option value="strobe">Strobe</option>
                      <option value="pan">Pan</option>
                      <option value="pan-fine">Pan Fine</option>
                      <option value="tilt">Tilt</option>
                      <option value="tilt-fine">Tilt Fine</option>
                      <option value="zoom">Zoom</option>
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
                    (
                      channel?.type === 'pan' || channel?.type === 'pan-fine' ||
                      channel?.type === 'tilt' || channel?.type === 'tilt-fine'
                    ) ?
                      <>
                        <td>
                          <NumberInput
                            min={-720}
                            max={720}
                            value={channel.minDegrees}
                            onChange={(v) => {
                              channel.minDegrees = v;
                              save(`Set channel ${index} min degrees to ${v}.`);
                            }} />
                        </td>
                        <td>
                          <NumberInput
                            min={-720}
                            max={720}
                            value={channel.maxDegrees}
                            onChange={(v) => {
                              channel.maxDegrees = v;
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
                    channel?.type === 'strobe' ?
                      <td>
                        <NumberInput
                          title='No Strobe'
                          type='integer'
                          min={0}
                          max={255}
                          value={channel.strobe.noStrobe}
                          onChange={(value) => {
                            channel.strobe.noStrobe = value;
                          }} />

                        <NumberInput
                          title='Slow Strobe'
                          type='integer'
                          min={0}
                          max={255}
                          value={channel.strobe.slowStrobe}
                          onChange={(value) => {
                            channel.strobe.slowStrobe = value;
                          }} />

                        <NumberInput
                          title='Fast Strobe'
                          type='integer'
                          min={0}
                          max={255}
                          value={channel.strobe.fastStrobe}
                          onChange={(value) => {
                            channel.strobe.fastStrobe = value;
                          }} />
                      </td> :
                      <td></td>
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
