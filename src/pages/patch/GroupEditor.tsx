import {
  create,
  equals,
  fromJsonString,
  toJsonString,
} from '@bufbuild/protobuf';

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
import { VersatileElement } from '../../components/VersatileElement';
import { ProjectContext } from '../../contexts/ProjectContext';
import { VersatileContainer } from '../../contexts/VersatileContianer';
import {
  addToGroup,
  deleteTargetGroup,
  getApplicableMembers,
} from '../../engine/group';
import { setRenderFunctions } from '../../engine/renderRouter';
import { randomUint64 } from '../../util/numberUtils';
import styles from './PatchPage.module.scss';

export function GroupEditor() {
  const [selectedGroupId, setSelectedGroupId] = useState<bigint | null>(null);

  return (
    <div className={styles.contents}>
      <GroupList
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
      />
      <GroupEditorPane
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
      />
    </div>
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

  useEffect(
    () =>
      setRenderFunctions({
        renderDmx: () => {
          throw new Error('renderDmx not implemented!');
        },
        renderWled: () => {
          throw new Error('renderDmx not implemented!');
        },
      }),
    [project, selectedGroupId],
  );

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
      <VersatileContainer className={styles.members}>
        <VersatileElement
          className={styles.outMembers}
          id="out-group"
          onDragOver={(draggingMember) => {
            group.targets = group.targets.filter(
              (t) => toJsonString(OutputTargetSchema, t) !== draggingMember,
            );
            update();
          }}
        >
          <div className={styles.header}>Not in group</div>
          <div className={styles.list}>
            {applicableMembers.map((t, i) => (
              <VersatileElement
                key={i}
                id={toJsonString(OutputTargetSchema, t)}
                className={styles.listElement}
                element={toJsonString(OutputTargetSchema, t)}
                onClick={() => {
                  if (addToGroupImpl(t)) {
                    save(
                      `Add member ${getOutputTargetName(project, t)} to group ${group.name}.`,
                    );
                  }
                }}
                onDragComplete={() => {
                  save(
                    `Modify group membership for ${getOutputTargetName(project, t)}.`,
                  );
                }}
              >
                {getOutputTargetName(project, t)}
              </VersatileElement>
            ))}
          </div>
        </VersatileElement>
        <VersatileElement
          className={styles.inMembers}
          id="in-group"
          onDragOver={(draggingMember) => {
            addToGroupImpl(fromJsonString(OutputTargetSchema, draggingMember));
            update();
          }}
        >
          <div className={styles.header}>In group</div>
          <div className={styles.list}>
            {group.targets.map((t, i) => (
              <VersatileElement
                key={i}
                className={styles.listElement}
                id={toJsonString(OutputTargetSchema, t)}
                element={toJsonString(OutputTargetSchema, t)}
                onClick={() => {
                  group.targets = group.targets.filter(
                    (ot) => !equals(OutputTargetSchema, ot, t),
                  );

                  save(
                    `Remove member ${getOutputTargetName(project, t)} from group ${group.name}.`,
                  );
                }}
                onDragComplete={() => {
                  save(
                    `Modify group membership for ${getOutputTargetName(project, t)}.`,
                  );
                }}
                onDragOver={(draggingMember) => {
                  const otherIndex = group.targets.findIndex(
                    (t) =>
                      toJsonString(OutputTargetSchema, t) === draggingMember,
                  );
                  if (otherIndex > -1) {
                    group.targets.splice(otherIndex, 1);
                    group.targets.splice(
                      i,
                      0,
                      fromJsonString(OutputTargetSchema, draggingMember),
                    );
                    update();
                  }
                }}
              >
                {getOutputTargetName(project, t)}
              </VersatileElement>
            ))}
          </div>
        </VersatileElement>
      </VersatileContainer>
    </div>
  );
}
