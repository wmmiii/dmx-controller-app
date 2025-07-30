import { Project } from '@dmx-controller/proto/project_pb';
import { JSX, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { getApplicableMembers } from '../engine/group';
import { renderGroupDebugToUniverse } from '../engine/render';
import IconBxX from '../icons/IconBxX';

import { TargetGroup } from '@dmx-controller/proto/output_pb';
import { DmxOutput } from '../engine/context';
import { Button, IconButton } from './Button';
import styles from './EditGroupDialog.module.scss';
import { TextInput } from './Input';
import { Modal } from './Modal';
import { getOutputTargetName } from './OutputSelector';

interface EditGroupDialogProps {
  groupId: bigint;
  group: TargetGroup;
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
  const [draggingIndex, setDraggingIndex] = useState<number>(-1);

  useEffect(() => {
    const render = (_frame: number, output: DmxOutput) => {
      const project = projectRef.current;
      if (project != null) {
        renderGroupDebugToUniverse(project, groupId, output);
      }
    };
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [projectRef]);

  const applicableMembers = useMemo(
    () => getApplicableMembers(project, groupId),
    [project, group],
  );

  return (
    <Modal
      title={'Edit ' + group.name}
      onClose={close}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={close} variant="primary">
            Done
          </Button>
        </div>
      }
    >
      <div>
        <Button variant="warning" onClick={onDelete}>
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
          }}
        />
      </label>
      {group.targets.length === 0 && <div className="row">No Members</div>}
      {group.targets.map((id, index) => {
        const name = getOutputTargetName(project, id);
        return (
          <div
            key={index}
            className={`${styles.row} ${styles.draggable}`}
            draggable={true}
            onDrag={() => setDraggingIndex(index)}
            onDragOver={() => {
              if (draggingIndex >= 0 && draggingIndex != index) {
                const fixtureId = group.targets.splice(draggingIndex, 1)[0];
                group.targets.splice(index, 0, fixtureId);
                update();
              }
            }}
            onDrop={() => {
              setDraggingIndex(-1);
              save(`Reorder members in ${group.name}.`);
            }}
          >
            {name}
            <IconButton
              title={`Remove ${name}`}
              onClick={() => {
                group.targets.splice(index, 1);
                save(`Remove fixture ${name} from group ${group.name}.`);
              }}
            >
              <IconBxX />
            </IconButton>
          </div>
        );
      })}
      <label className={styles.row}>
        <select
          value="-1"
          onChange={(e) => {
            const index = parseInt(e.target.value);
            if (index === -1) {
              return;
            }
            const newMember = applicableMembers[index];
            group.targets.push(newMember.id);
            const name = getOutputTargetName(project, newMember.id);
            save(`Add ${name} to group ${group.name}`);
          }}
        >
          <option value="-1">Add Member</option>
          {applicableMembers.map((m, i) => (
            <option key={i} value={i}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
