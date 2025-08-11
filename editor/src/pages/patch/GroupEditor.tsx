import { create, equals } from '@bufbuild/protobuf';

import {
  OutputTarget,
  OutputTargetSchema,
  TargetGroupSchema,
} from '@dmx-controller/proto/output_pb';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BiTrash } from 'react-icons/bi';
import { Button, IconButton } from '../../components/Button';
import { TextInput } from '../../components/Input';
import { getOutputTargetName } from '../../components/OutputSelector';
import { HorizontalSplitPane } from '../../components/SplitPane';
import { ProjectContext } from '../../contexts/ProjectContext';
import { RenderingContext } from '../../contexts/RenderingContext';
import { WritableOutput } from '../../engine/context';
import {
  addToGroup,
  deleteTargetGroup,
  getApplicableMembers,
} from '../../engine/group';
import { renderGroupDebug } from '../../engine/render';
import { randomUint64 } from '../../util/numberUtils';
import styles from './PatchPage.module.scss';

export function GroupEditor() {
  const [selectedGroupId, setSelectedGroupId] = useState<bigint | null>(null);

  return (
    <HorizontalSplitPane
      className={styles.splitPane}
      defaultAmount={0.2}
      left={
        <GroupList
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
        />
      }
      right={
        <GroupEditorPane
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
        />
      }
    />
  );
}

interface GroupListProps {
  selectedGroupId: bigint | null;
  setSelectedGroupId: (groupId: bigint) => void;
}

function GroupList({ selectedGroupId, setSelectedGroupId }: GroupListProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.groupList}>
      <ul>
        {Object.entries(project.groups).map(([id, group]) => (
          <li
            className={BigInt(id) == selectedGroupId ? styles.selected : ''}
            key={id}
            onClick={() => setSelectedGroupId(BigInt(id))}
          >
            {group.name}
          </li>
        ))}
      </ul>
      <Button
        onClick={() => {
          const newId = randomUint64();
          project.groups[newId.toString()] = create(TargetGroupSchema, {
            name: 'New Group',
          });
          setSelectedGroupId(newId);
          save('Create new group.');
        }}
      >
        + Add New Group
      </Button>
    </div>
  );
}

interface GroupEditorPaneProps {
  selectedGroupId: bigint | null;
  setSelectedGroupId: (groupId: bigint | null) => void;
}

function GroupEditorPane({
  selectedGroupId,
  setSelectedGroupId,
}: GroupEditorPaneProps) {
  const { project, save, update } = useContext(ProjectContext);
  const { setRenderFunction, clearRenderFunction } =
    useContext(RenderingContext);

  const [draggingMember, setDraggingMember] = useState<OutputTarget | null>(
    null,
  );

  useEffect(() => {
    const render = (_frame: number, output: WritableOutput) => {
      if (project != null && selectedGroupId != null) {
        renderGroupDebug(project, selectedGroupId, output);
      }
    };

    setRenderFunction(render);
    return () => clearRenderFunction(render);
  }, [project, selectedGroupId]);

  const group = useMemo(() => {
    if (selectedGroupId == null) {
      return null;
    }

    return project.groups[selectedGroupId.toString()];
  }, [project, selectedGroupId]);

  const applicableMembers = useMemo(() => {
    if (!selectedGroupId) {
      return [];
    }
    return getApplicableMembers(project, selectedGroupId);
  }, [selectedGroupId, project]);

  const addToGroupImpl = useCallback(
    (t: OutputTarget) => {
      if (!group || !selectedGroupId) {
        return false;
      }

      const found = group.targets.find((g) => equals(OutputTargetSchema, g, t));
      if (!found) {
        addToGroup(project, selectedGroupId, t);
        return true;
      } else {
        return false;
      }
    },
    [group, selectedGroupId, project],
  );

  if (!group) {
    return <div className={styles.emptyPane}>Select a group to edit.</div>;
  }
  return (
    <div className={styles.groupEditor}>
      <div className={styles.header}>
        <TextInput
          value={group.name}
          onChange={(name) => {
            group.name = name;
            save(`Set group name to "${name}".`);
          }}
        />
        <IconButton
          title={`Delete ${group.name}`}
          variant="warning"
          onClick={() => {
            deleteTargetGroup(project, selectedGroupId!);
            save(`Deleted group "${group.name}".`);
            setSelectedGroupId(null);
          }}
        >
          <BiTrash />
        </IconButton>
      </div>
      <div className={styles.members}>
        <div
          className={styles.outMembers}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragEnter={(e) => {
            if (!draggingMember) {
              return;
            }

            group.targets = group.targets.filter(
              (t) => !equals(OutputTargetSchema, t, draggingMember),
            );

            save(
              `Remove member ${getOutputTargetName(project, draggingMember)} from group ${group.name}.`,
            );
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className={styles.header}>Not in group</div>
          <ul>
            {applicableMembers.map((t, i) => (
              <li
                key={i}
                draggable={true}
                onDragStart={(e) => {
                  setDraggingMember(t);
                  e.stopPropagation();
                }}
                onDragEnd={(e) => {
                  setDraggingMember(null);
                  e.stopPropagation();
                }}
              >
                {getOutputTargetName(project, t)}
              </li>
            ))}
          </ul>
        </div>
        <div
          className={styles.inMembers}
          onDragEnter={(e) => {
            if (!draggingMember) {
              return;
            }

            if (addToGroupImpl(draggingMember)) {
              save(
                `Add member ${getOutputTargetName(project, draggingMember)} to group ${group.name}.`,
              );
            }
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className={styles.header}>In group</div>
          <ol>
            {group.targets.map((t, i) => (
              <li
                key={i}
                draggable={true}
                onDragStart={(e) => {
                  setDraggingMember(t);
                  e.stopPropagation();
                }}
                onDragEnd={(e) => {
                  setDraggingMember(null);
                  e.stopPropagation();
                }}
                onDragEnter={(e) => {
                  if (!draggingMember) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                  }

                  const otherIndex = group.targets.findIndex((t) =>
                    equals(OutputTargetSchema, t, draggingMember),
                  );
                  if (otherIndex > -1) {
                    group.targets.splice(otherIndex, 1);
                    group.targets.splice(i, 0, draggingMember);
                    save(`Rearrange members of ${group.name}.`);
                    update();
                  }
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                {getOutputTargetName(project, t)}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
