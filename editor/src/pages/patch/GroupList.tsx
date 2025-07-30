import { create } from '@bufbuild/protobuf';

import { TargetGroupSchema } from '@dmx-controller/proto/output_pb';
import { useContext, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { EditGroupDialog } from '../../components/EditGroupDialog';
import { ProjectContext } from '../../contexts/ProjectContext';
import { deleteTargetGroup } from '../../engine/group';
import { randomUint64 } from '../../util/numberUtils';

export function GroupList() {
  const { project, save } = useContext(ProjectContext);
  const [selectedGroupId, setSelectedGroupId] = useState<bigint | null>(null);

  const selectedGroup = useMemo(
    () => project?.groups[String(selectedGroupId)],
    [project, selectedGroupId],
  );

  return (
    <div>
      <ul>
        {Object.entries(project.groups).map(([id, group]) => (
          <li key={id} onClick={() => setSelectedGroupId(BigInt(id))}>
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
      {selectedGroup != null && selectedGroupId != null ? (
        <EditGroupDialog
          groupId={selectedGroupId}
          group={selectedGroup}
          close={() => setSelectedGroupId(null)}
          onDelete={() => {
            const name = project.groups[selectedGroupId.toString()].name;
            deleteTargetGroup(project, selectedGroupId);
            save(`Delete fixture group ${name}.`);
          }}
        />
      ) : null}
    </div>
  );
}
