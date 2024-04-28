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
import { nextId } from '../util/mapUtils';
import { getApplicableMembers } from '../engine/groupUtils';

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
          Object.entries(project.physicalFixtures)
            .sort((a, b) => a[1].channelOffset - b[1].channelOffset)
            .map(([id, fixture]) => {
              const definition =
                project.fixtureDefinitions[fixture.fixtureDefinitionId];

              return (
                <li onClick={() => {
                  setSelectedFixtureId(parseInt(id));
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
          Object.entries(project.physicalFixtureGroups)
            .map(([id, group]) => (
              <li onClick={() => setSelectedGroupId(parseInt(id))}>
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
        Name:&nbsp;
        <input
          value={fixture.name}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            fixture.name = e.target.value;
            save();
          }} />
      </label>
      <label>
        Definition:&nbsp;
        <select
          value={fixture.fixtureDefinitionId}
          onChange={(e) => {
            fixture.fixtureDefinitionId = parseInt(e.target.value);
            save();
          }}>
          {
            Object.entries(project.fixtureDefinitions)
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
        Channel:&nbsp;
        <input
          type="number"
          min={0}
          max={512}
          step={1}
          value={fixture.channelOffset}
          onChange={(e) => {
            fixture.channelOffset = parseInt(e.target.value);
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
        Name:&nbsp;
        <input
          value={group.name}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            group.name = e.target.value;
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
          Object.entries(project.fixtureDefinitions)
            .map(([id, definition]) => (
              <li onClick={() => setSelectedDefinitionId(parseInt(id))}>
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
        Name:&nbsp;
        <input
          value={definition.name}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            definition.name = e.target.value;
            save();
            e.stopPropagation();
          }} />
      </label>
      <label>
        Manufacturer:&nbsp;
        <input
          value={definition.manufacturer}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            definition.manufacturer = e.target.value;
            save();
          }} />
      </label>
      <label>
        Total channels:&nbsp;
        <input
          type="number"
          min={0}
          max={512}
          step={1}
          value={definition.numChannels}
          onChange={(e) => {
            definition.numChannels = parseInt(e.target.value);
            save();
          }} />
        {
          (nextId(definition.channels) > definition.numChannels) &&
          <IconBxError />
        }
      </label>
      <div>Channel Mappings:</div>
      {
        Object.entries(definition.channels)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .map(([id, channel]) => (
            <div className={styles.row}>
              <input
                type="number"
                min={0}
                max={512}
                step={1}
                value={id}
                onChange={(e) => {
                  delete definition.channels[parseInt(id)];
                  definition.channels[parseInt(e.target.value)] = channel;
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
                    Min deg:&nbsp;
                    <input
                      type="number"
                      step={1}
                      value={channel.minDegrees}
                      onChange={(e) => {
                        channel.minDegrees = parseInt(e.target.value);
                        save();
                      }} />
                  </label>
                  <label>
                    Max deg:&nbsp;
                    <input
                      type="number"
                      step={1}
                      value={channel.maxDegrees}
                      onChange={(e) => {
                        channel.maxDegrees = parseInt(e.target.value);
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
                <input
                  value={d.name}
                  onChange={(e) => {
                    d.name = e.target.value;
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
                Object.entries(d.channels)
                  .map(([index, value]) => (
                    <div className={styles.row}>
                      Channel:&nbsp;
                      <input
                        type="number"
                        min={0}
                        max={255}
                        step={1}
                        value={index}
                        onChange={(e) => {
                          delete d.channels[parseInt(index)];
                          d.channels[parseInt(e.target.value)] = value;
                          save();
                        }} />
                      Value:&nbsp;
                      <input
                        type="number"
                        min={0}
                        max={255}
                        step={1}
                        value={value}
                        onChange={(e) => {
                          d.channels[parseInt(index)] =
                            parseInt(e.target.value);
                          save();
                        }} />
                      <IconButton
                        title="Remove Channel"
                        onClick={() => {
                          delete d.channels[parseInt(index)];
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