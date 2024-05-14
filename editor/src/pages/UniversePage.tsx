import React, { useContext, useMemo, useState } from 'react';
import IconBxCopyAlt from '../icons/IconBxCopy';
import IconBxError from '../icons/IconBxError';
import IconBxX from '../icons/IconBxX';
import styles from './UniversePage.module.scss';
import { Button, IconButton } from '../components/Button';
import { FixtureDefinition, FixtureDefinition_Channel, PhysicalFixture, PhysicalFixtureGroup } from '@dmx-controller/proto/fixture_pb';
import { HorizontalSplitPane } from '../components/SplitPane';
import { Modal } from '../components/Modal';
import { OutputDescription, OutputSelector } from '../components/OutputSelector';
import { ProjectContext } from '../contexts/ProjectContext';
import { Project_DefaultChannelValues } from '@dmx-controller/proto/project_pb';
import { idMapToArray, nextId } from '../util/mapUtils';
import { getApplicableMembers } from '../engine/group';
import { NumberInput, TextInput } from '../components/Input';

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
  const [editDefaultChannels, setEditDefaultChannels] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const selectedFixture = useMemo(
    () => project?.physicalFixtures[selectedFixtureId],
    [project, selectedFixtureId]);
  const selectedGroup = useMemo(
    () => project?.physicalFixtureGroups[selectedGroupId],
    [project, selectedGroupId]);

  if (!project) {
    return null;
  }

  return (
    <div className={styles.pane}>
      {
        Object.keys(project.physicalFixtures).length > 0 &&
        <Button onClick={() => setEditDefaultChannels(true)}>
          Edit Default Channels
        </Button>
      }
      <h2>Fixtures</h2>
      <ol>
        {
          idMapToArray(project.physicalFixtures)
            .sort((a, b) => a[1].channelOffset - b[1].channelOffset)
            .map(([id, fixture]) => {
              const definition =
                project.fixtureDefinitions[fixture.fixtureDefinitionId];

              return (
                <li onClick={() => {
                  setSelectedFixtureId(id);
                }}>
                  (
                  {fixture.channelOffset + 1}
                  &nbsp;—&nbsp;
                  {fixture.channelOffset + definition.numChannels}
                  ) {fixture.name}
                </li>
              );
            })
        }
      </ol>
      <Button onClick={() => {
        const newId = nextId(project.physicalFixtures);
        project.physicalFixtures[newId] = new PhysicalFixture({
          name: 'New Fixture',
        });
        setSelectedFixtureId(newId);
        save();
      }}>
        + Add New Fixture
      </Button>
      <h2>Groups</h2>
      <ul>
        {
          idMapToArray(project.physicalFixtureGroups)
            .map(([id, group]) => (
              <li onClick={() => setSelectedGroupId(id)}>
                {group.name}
              </li>
            ))
        }
      </ul>
      <Button onClick={() => {
        const newId = nextId(project.physicalFixtureGroups);
        project.physicalFixtureGroups[newId] = new PhysicalFixtureGroup({
          name: 'New Group',
        });
        setSelectedGroupId(newId);
        save();
      }}>
        + Add New Group
      </Button>
      {
        editDefaultChannels &&
        <EditDefaultChannelsDialog
          close={() => setEditDefaultChannels(false)} />
      }
      {
        selectedFixture &&
        <EditFixtureDialog
          fixture={selectedFixture}
          close={() => setSelectedFixtureId(null)}
          save={save}
          onDelete={() => alert('Not implemented!')} />
      }
      {
        selectedGroup &&
        <EditGroupDialog
          groupId={selectedGroupId}
          group={selectedGroup}
          close={() => setSelectedGroupId(null)}
          save={save}
          onDelete={() => alert('Not implemented!')} />
      }
    </div>
  );
}

interface EditFixtureDialogProps {
  fixture: PhysicalFixture;
  close: () => void;
  save: () => void;
  onDelete: () => void;
}

function EditFixtureDialog({
  fixture,
  close,
  save,
  onDelete,
}: EditFixtureDialogProps): JSX.Element {
  const { project } = useContext(ProjectContext);

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
        </Button>&nbsp;
        Cannot be undone!
      </div>
      <label>
        <span>Name</span>
        <TextInput
          value={fixture.name}
          onChange={(v) => {
            fixture.name = v;
            save();
          }} />
      </label>
      <label>
        <span>Definition</span>
        <select
          value={fixture.fixtureDefinitionId}
          onChange={(e) => {
            fixture.fixtureDefinitionId = parseInt(e.target.value);
            save();
          }}>
          {
            idMapToArray(project.fixtureDefinitions)
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, definition]) => (
                <option value={id}>
                  {definition.name}
                </option>
              ))
          }
        </select>
      </label>
      <label>
        <span>Channel</span>
        <NumberInput
          min={0}
          max={512}
          value={fixture.channelOffset}
          onChange={(v) => {
            fixture.channelOffset = v;
            save();
          }} />
      </label>
    </Modal>
  );
}

interface EditGroupDialogProps {
  groupId: number;
  group: PhysicalFixtureGroup;
  close: () => void;
  save: () => void;
  onDelete: () => void;
}

function EditGroupDialog({
  groupId,
  group,
  close,
  save,
  onDelete,
}: EditGroupDialogProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const [newMember, setNewMember] =
    useState<ReturnType<typeof getApplicableMembers>[0]>(null);

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
        </Button>&nbsp;
        Cannot be undone!
      </div>
      <label>
        <span>Name</span>
        <TextInput
          value={group.name}
          onChange={(v) => {
            group.name = v;
            save();
          }} />
      </label>
      <div>Members:</div>
      {

        (group.physicalFixtureIds.length +
          group.physicalFixtureGroupIds.length === 0) &&
        <div className='row'>No Members</div>
      }
      {
        group.physicalFixtureGroupIds.map((id, i) => (
          <div className={styles.row}>
            {project.physicalFixtureGroups[id]?.name}
            <IconButton
              title="Remove Group"
              onClick={() => {
                group.physicalFixtureGroupIds.splice(i, 1);
                save();
              }}>
              <IconBxX />
            </IconButton>
          </div>
        ))
      }
      {
        group.physicalFixtureIds.map((id, i) => (
          <div className={styles.row}>
            {project.physicalFixtures[id].name}
            <IconButton
              title="Remove Fixture"
              onClick={() => {
                group.physicalFixtureIds.splice(i, 1);
                save();
              }}>
              <IconBxX />
            </IconButton>
          </div>
        ))
      }
      <label className={styles.row}>
        <select
          value={JSON.stringify(newMember)}
          onChange={(e) => {
            setNewMember(JSON.parse(e.target.value));
          }}>
          <option value="null">
            &lt;Select Member&gt;
          </option>
          {
            applicableMembers.map((m) => (
              <option value={JSON.stringify(m)}>
                {m.name}
              </option>
            ))
          }
        </select>
        <Button
          onClick={() => {
            if (!newMember) {
              return;
            }

            if (newMember.type === 'fixture') {
              group.physicalFixtureIds.push(newMember.id);
            } else if (newMember.type === 'group') {
              group.physicalFixtureGroupIds.push(newMember.id);
            } else {
              throw new Error(`Unrecognized member type: ${newMember.type}`);
            }

            setNewMember(null);

            save();
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
    useState<number | null>(null);

  const selectedDefinition = useMemo(
    () => project?.fixtureDefinitions[selectedDefinitionId],
    [project, selectedDefinitionId]);

  if (!project) {
    return;
  }

  return (
    <div className={styles.pane}>
      <h2>Fixture Definitions</h2>
      <ul>
        {
          idMapToArray(project.fixtureDefinitions)
            .map(([id, definition]) => (
              <li onClick={() => setSelectedDefinitionId(id)}>
                {definition.name}
              </li>
            ))
        }
      </ul>
      <Button onClick={() => {
        const newId = nextId(project.fixtureDefinitions);
        project.fixtureDefinitions[newId] = new FixtureDefinition({
          name: 'New Fixture Definition',
        });
        setSelectedDefinitionId(newId);
        save();
      }}>
        + Add New Fixture Definition
      </Button>
      {
        selectedDefinition &&
        <EditDefinitionDialog definition={selectedDefinition}
          close={() => setSelectedDefinitionId(null)}
          save={save}
          copy={() => {
            const newId = nextId(project.fixtureDefinitions);
            project.fixtureDefinitions[newId] =
              new FixtureDefinition(selectedDefinition);
            project.fixtureDefinitions[newId].name = "Copy of " + selectedDefinition.name;
            setSelectedDefinitionId(newId);
            save();
          }} />
      }
    </div>
  );
}

interface EditDefinitionDialogProps {
  definition: FixtureDefinition;
  close: () => void;
  save: () => void;
  copy: () => void;
}

function EditDefinitionDialog({
  definition,
  close,
  save,
  copy,
}: EditDefinitionDialogProps): JSX.Element {
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
      <label>
        <span>Name</span>
        <TextInput
          value={definition.name}
          onChange={(v) => {
            definition.name = v;
            save();
          }} />
      </label>
      <label>
        <span>Manufacturer</span>
        <TextInput
          value={definition.manufacturer}
          onChange={(v) => {
            definition.manufacturer = v;
            save();
          }} />
      </label>
      <label>
        <span>Total channels</span>
        <NumberInput
          min={0}
          max={512}
          value={definition.numChannels}
          onChange={(v) => {
            definition.numChannels = v;
            save();
          }} />
        {
          (nextId(definition.channels) > definition.numChannels) &&
          <IconBxError />
        }
      </label>
      <div>Channel Mappings:</div>
      {
        idMapToArray(definition.channels)
          .sort((a, b) => a[0] - b[0])
          .map(([id, channel]) => (
            <div className={styles.row}>
              <NumberInput
                min={0}
                max={512}
                value={id}
                onChange={(v) => {
                  delete definition.channels[id];
                  definition.channels[v] = channel;
                  save();
                }} />
              <select
                value={channel.type}
                onChange={(e) => {
                  channel.type = e.target.value;
                  save();
                }}>
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
                <option value="pan">Pan</option>
                <option value="pan-fine">Pan Fine</option>
                <option value="tilt">Tilt</option>
                <option value="tilt-fine">Tilt Fine</option>
              </select>
              {
                (
                  channel.type === 'pan' || channel.type === 'pan-fine' ||
                  channel.type === 'tilt' || channel.type === 'tilt-fine'
                ) &&
                <>
                  <label>
                    <span>Min deg</span>
                    <NumberInput
                      min={-720}
                      max={720}
                      value={channel.minDegrees}
                      onChange={(v) => {
                        channel.minDegrees = v;
                        save();
                      }} />
                  </label>
                  <label>
                    <span>Max deg</span>
                    <NumberInput
                      min={-720}
                      max={720}
                      value={channel.maxDegrees}
                      onChange={(v) => {
                        channel.maxDegrees = v;
                        save();
                      }} />
                  </label>
                </>
              }
              <IconButton
                title="Delete Channel Mapping"
                onClick={() => {
                  delete definition.channels[parseInt(id)];
                  save();
                }}>
                <IconBxX />
              </IconButton>
            </div>
          ))
      }
      <Button onClick={() => {
        const newChannel = nextId(definition.channels);
        definition.channels[newChannel] =
          new FixtureDefinition_Channel({ type: 'red' });
        save();
      }}>
        + Add New Channel Mapping
      </Button>
    </Modal>
  );
}

interface EditDefaultChannelsDialogProps {
  close: () => void;
}

function EditDefaultChannelsDialog({ close }: EditDefaultChannelsDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  return (
    <Modal
      title={"Edit Default Channels"}
      onClose={close}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={close} variant="primary">
            Done
          </Button>
        </div>
      }>
      {
        project.defaultChannelValues.map((d, i) => {
          let device: OutputDescription;
          switch (d.output.case) {
            case 'physicalFixtureId':
              device = {
                id: d.output.value,
                type: 'fixture',
              };
              break;
            case 'physicalFixtureGroupId':
              device = {
                id: d.output.value,
                type: 'group',
              };
              break;
          }

          return (
            <div className={styles.defaultPreset}>
              <div className={styles.header}>
                <TextInput
                  value={d.name}
                  onChange={(v) => {
                    d.name = v;
                    save();
                  }} />
                <OutputSelector
                  value={device}
                  setValue={(o) => {
                    switch (o.type) {
                      case 'fixture':
                        d.output.case = 'physicalFixtureId';
                        break;
                      case 'group':
                        d.output.case = 'physicalFixtureGroupId';
                        break;
                    }
                    d.output.value = o.id;
                    save();
                  }} />
                <IconButton
                  title="Remove Preset"
                  onClick={() => {
                    project.defaultChannelValues.splice(i, 1);
                    save();
                  }}>
                  <IconBxX />
                </IconButton>
              </div>
              <div>Channels:</div>
              {
                idMapToArray(d.channels)
                  .map(([index, value]) => (
                    <div className={styles.row}>
                      Channel:&nbsp;
                      <NumberInput
                        min={0}
                        max={255}
                        value={index}
                        onChange={(v) => {
                          delete d.channels[index];
                          d.channels[v] = value;
                          save();
                        }} />
                      Value:&nbsp;
                      <NumberInput
                        min={0}
                        max={255}
                        value={value}
                        onChange={(v) => {
                          d.channels[index] = v;
                          save();
                        }} />
                      <IconButton
                        title="Remove Channel"
                        onClick={() => {
                          delete d.channels[index];
                          save();
                        }}>
                        <IconBxX />
                      </IconButton>
                    </div>
                  ))
              }
              <Button onClick={() => {
                const channel = nextId(d.channels);
                d.channels[channel] = 0;
                save();
              }}>
                + Add Channel Default
              </Button>
            </div>
          );
        })
      }
      <Button onClick={() => {
        project.defaultChannelValues.push(new Project_DefaultChannelValues({
          name: 'New Default Channels',
          output: {
            case: "physicalFixtureId",
            value: 0,
          }
        }));
        save();
      }}>
        + Add New Preset
      </Button>
    </Modal>
  );
}