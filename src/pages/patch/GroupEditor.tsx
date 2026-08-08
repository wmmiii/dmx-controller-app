import {
  create,
  equals,
  fromJsonString,
  toJsonString,
} from '@bufbuild/protobuf';
import {
  OutputTarget,
  OutputTargetSchema,
  TargetGroup,
  TargetGroupSchema,
} from '@dmx-controller/proto/output_pb';
import { useCallback, useContext, useMemo } from 'react';
import { BiPlus, BiTrash } from 'react-icons/bi';
import { Navigate, Outlet, Route, useNavigate, useParams } from 'react-router';

import { Browser } from '../../components/Browser';
import { Button } from '../../components/Button';
import { getOutputTargetName } from '../../components/OutputSelector';
import { VersatileElement } from '../../components/VersatileElement';
import { ProjectContext } from '../../contexts/ProjectContext';
import { VersatileContainer } from '../../contexts/VersatileContianer';
import {
  addToGroup,
  deleteTargetGroup,
  getApplicableMembers,
} from '../../engine/group';
import { useRenderMode } from '../../hooks/renderMode';
import { randomUint64 } from '../../util/numberUtils';
import { sortedEntries } from '../../util/sortUtils';
import styles from './GroupEditor.module.css';

export const groupsRoutes = (
  <Route path="groups" element={<GroupEditor />}>
    <Route path=":groupId" element={<GroupDetail />} />
  </Route>
);

function GroupEditor() {
  const { project, save } = useContext(ProjectContext);
  const navigate = useNavigate();
  const { groupId } = useParams();

  const selectedGroupId = groupId != null ? BigInt(groupId) : null;

  useRenderMode(
    {
      mode: selectedGroupId
        ? {
            case: 'groupDebug',
            value: {
              groupId: selectedGroupId,
            },
          }
        : {
            case: 'blackout',
            value: {},
          },
    },
    [groupId],
  );

  return (
    <Browser
      className={styles.groupContents}
      items={sortedEntries(project.groups).map(([id, group]) => ({
        name: group.name,
        setName: (name) => {
          if (name) {
            group.name = name;
            save(`Set group name to "${name}".`);
          }
        },
        selected: id === groupId,
        onSelect: () => navigate(`/patch/groups/${id}`),
      }))}
      listHeader={
        <Button
          icon={<BiPlus size={18} />}
          onClick={() => {
            const newId = randomUint64();
            project.groups[newId.toString()] = create(TargetGroupSchema, {
              name: 'New Group',
            });
            save('Create new group.');
            navigate(`/patch/groups/${newId}`);
          }}
        >
          Add New Group
        </Button>
      }
      emptyPlaceholder={
        <>
          <p>Select a group to edit.</p>
          <p>
            A group lets you control many fixtures as one. Groups usually map to
            how you think about your lighting. For example: "Hanging Up-Stage",
            "Ground Moving Heads", or "All Wash".
          </p>
          <p>
            Groups live above any single patch. The same group can point to
            different fixtures in each patch, so your effects and shows carry
            over when you move to a new lighting setup.
          </p>
        </>
      }
    >
      {groupId != null ? <Outlet /> : undefined}
    </Browser>
  );
}

function GroupDetail() {
  const { project } = useContext(ProjectContext);
  const navigate = useNavigate();
  const { groupId } = useParams();

  const group = groupId != null ? project.groups[groupId] : undefined;
  if (groupId == null || group == null) {
    return <Navigate to="/patch/groups" replace />;
  }

  return (
    <GroupEditorPane
      groupId={BigInt(groupId)}
      group={group}
      clearGroup={() => navigate('/patch/groups')}
    />
  );
}

interface GroupEditorPaneProps {
  groupId: bigint;
  group: TargetGroup;
  clearGroup: () => void;
}

function GroupEditorPane({ groupId, group, clearGroup }: GroupEditorPaneProps) {
  const { project, save, update } = useContext(ProjectContext);

  const applicableMembers = useMemo(() => {
    if (!groupId) {
      return [];
    }
    return getApplicableMembers(project, groupId);
  }, [groupId, project]);

  const addToGroupImpl = useCallback(
    (t: OutputTarget) => {
      if (!group || !groupId) {
        return false;
      }

      const found = group.targets.find((g) => equals(OutputTargetSchema, g, t));
      if (!found) {
        addToGroup(project, groupId, t);
        return true;
      } else {
        return false;
      }
    },
    [group, groupId, project],
  );

  return (
    <div className={styles.groupEditor}>
      <div className={styles.header}>
        <Button
          icon={<BiTrash />}
          variant="warning"
          onClick={() => {
            deleteTargetGroup(project, groupId!);
            save(`Deleted group "${group.name}".`);
            clearGroup();
          }}
        >
          Delete {group.name}
        </Button>
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
        <VersatileElement<string>
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
