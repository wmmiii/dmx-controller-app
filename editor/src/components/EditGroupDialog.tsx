import { PhysicalFixtureGroup, PhysicalFixtureGroup_FixtureList } from "@dmx-controller/proto/fixture_pb";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ProjectContext } from "../contexts/ProjectContext";
import { getApplicableMembers } from "../engine/group";
import { Modal } from "./Modal";

import styles from "./EditGroupDialog.module.scss";
import { Button, IconButton } from "./Button";
import { TextInput } from "./Input";
import IconBxX from "../icons/IconBxX";
import { getActiveUniverse } from "../util/projectUtils";
import { Project } from "@dmx-controller/proto/project_pb";
import { universeToUint8Array } from "../engine/utils";
import { renderGroupDebugToUniverse } from "../engine/universe";
import { SerialContext } from "../contexts/SerialContext";

interface EditGroupDialogProps {
  groupId: bigint;
  group: PhysicalFixtureGroup;
  close: () => void;
  onDelete: () => void;
}

export function EditGroupDialog({
  groupId,
  group,
  close,
  onDelete,
}: EditGroupDialogProps): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);
  const [newMemberIndex, setNewMemberIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number>(-1);

  useEffect(() => {
    const render = () => {
      const project = projectRef.current;
      if (project != null) {
        return universeToUint8Array(
          projectRef.current,
          renderGroupDebugToUniverse(
            project,
            groupId,
          ));
      } else {
        return new Uint8Array(512);
      }
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [projectRef]);

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
      {

        (Object.keys(group.fixtures).length +
          group.groups.length === 0) &&
        <div className='row'>No Members</div>
      }
      {
        group.groups.length > 0 &&
        <>
          <hr />
          <h3>Groups</h3>
        </>
      }
      {
        group.groups.map((id, i) => (
          <div key={id} className={styles.row}>
            ⧉ {project.groups[id.toString()]?.name}
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
        group.fixtures?.[project.activeUniverse.toString()]?.fixtures.length > 0 &&
        <>
          <hr />
          <h3>Fixtures</h3>
        </>
      }
      {
        group.fixtures?.[project.activeUniverse.toString()]?.fixtures.map((id, index) => (
          <div key={id} className={`${styles.row} ${styles.draggable}`}
            draggable={true}
            onDrag={() => setDraggingIndex(index)}
            onDragOver={() => {
              if (draggingIndex >= 0 && draggingIndex != index) {
                const fixtures = group.fixtures?.[project.activeUniverse.toString()]?.fixtures;
                const fixtureId = fixtures.splice(draggingIndex, 1)[0];
                fixtures.splice(index, 0, fixtureId);
                update();
              }
            }}
            onDrop={() => {
              setDraggingIndex(-1);
              save(`Reorder fixtures in ${group.name}.`)
            }}>
            ⧇ {getActiveUniverse(project).fixtures[id.toString()].name}
            <IconButton
              title="Remove Fixture"
              onClick={() => {
                const name = getActiveUniverse(project).fixtures[id.toString()].name;
                group.fixtures[project.activeUniverse.toString()].fixtures.splice(index, 1);
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
                {m.id.output.case === 'group' ? '⧉' : '⧇'}
                &nbsp;
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