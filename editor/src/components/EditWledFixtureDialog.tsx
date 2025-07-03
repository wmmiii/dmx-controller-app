import { create } from '@bufbuild/protobuf';
import {
  WLEDConfig_Fixture,
  WLEDConfig_Group,
  WLEDConfig_GroupSchema,
  WLEDConfig_Segment,
  WLEDConfig_SegmentSchema,
} from '@dmx-controller/proto/wled_pb';
import { JSX, useCallback, useContext, useMemo, useState } from 'react';
import { BiRefresh, BiTrash } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
import IconBxError from '../icons/IconBxError';
import IconBxPlus from '../icons/IconBxPlus';
import { randomUint64 } from '../util/numberUtils';
import { Button, IconButton } from './Button';
import styles from './EditDialog.module.scss';
import { TextInput } from './Input';
import { Modal } from './Modal';
import { HorizontalSplitPane } from './SplitPane';

interface EditWledFixtureDialogProps {
  wledFixtureId: bigint;
  onClose: () => void;
  onDelete: () => void;
}

export function EditWledFixtureDialog({
  wledFixtureId,
  onClose,
  onDelete,
}: EditWledFixtureDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [syncError, setSyncError] = useState<null | string>(null);

  const wledFixture = useMemo(
    () => project.wled!.fixtures[String(wledFixtureId)],
    [wledFixtureId, project],
  );

  const syncSegments = useCallback(async () => {
    const response = await fetch(`http://${wledFixture.address}/json`);
    if (response.ok) {
      const body = await response.json();
      body['state']['seg'].forEach((s: any) => {
        wledFixture.segments[s['id']] = create(WLEDConfig_SegmentSchema, {
          name: s['n'],
        });
      });
      save(`Sync segments of ${wledFixture.name}.`);
    } else {
      setSyncError(await response.text());
    }
    console.log(response);
  }, [wledFixture]);

  return (
    <Modal
      title={'Edit ' + wledFixture.name}
      fullScreen={true}
      onClose={onClose}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={onClose} variant="primary">
            Done
          </Button>
        </div>
      }
    >
      <HorizontalSplitPane
        defaultAmount={1 / 3}
        left={
          <>
            <p>
              <Button variant="warning" onClick={onDelete}>
                Delete WLED Fixture
              </Button>
            </p>
            <p>
              <span>Name</span>
              <TextInput
                value={wledFixture.name}
                onChange={(v) => {
                  wledFixture.name = v;
                  save(`Change WLED fixture name to ${v}.`);
                }}
              />
            </p>
            <p>
              <span>IP Address</span>
              <TextInput
                value={wledFixture.address}
                onChange={(v) => {
                  wledFixture.address = v;
                  save(`Change WLED fixture address to ${v}.`);
                }}
              />
            </p>
          </>
        }
        right={
          <HorizontalSplitPane
            defaultAmount={1 / 2}
            left={
              <>
                <h3>Segments</h3>
                <Button icon={<BiRefresh />} onClick={syncSegments}>
                  Sync Segments
                </Button>
                {syncError && (
                  <p>
                    <IconBxError />
                    &nbsp;{syncError}
                  </p>
                )}
                <ul>
                  {Object.entries(wledFixture.segments).map(([id, s]) => (
                    <li key={id}>
                      {s.name ? (
                        s.name
                      ) : (
                        <span className={styles.faint}>Segment {id}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            }
            right={
              <>
                <h3>Groups</h3>
                <Button
                  onClick={() => {
                    const id = randomUint64();
                    wledFixture.groups[String(id)] = create(
                      WLEDConfig_GroupSchema,
                      { name: 'New Group' },
                    );
                    save(`Add group to ${wledFixture.name}.`);
                  }}
                  icon={<IconBxPlus />}
                >
                  Add Group
                </Button>
                <ul>
                  {Object.entries(wledFixture.groups)
                    .sort(([_a, aGroup], [_b, bGroup]) =>
                      aGroup.name.localeCompare(bGroup.name),
                    )
                    .map(([id, group]) => (
                      <WledGroup key={id} fixture={wledFixture} group={group} />
                    ))}
                </ul>
              </>
            }
          />
        }
      />
    </Modal>
  );
}

interface WledGroupProps {
  fixture: WLEDConfig_Fixture;
  group: WLEDConfig_Group;
}

function WledGroup({ fixture, group }: WledGroupProps) {
  const { save } = useContext(ProjectContext);

  const candidateSegments = useMemo(() => {
    return Object.entries(fixture.segments).filter(
      ([id, _]) => group.segmentId.indexOf(parseInt(id)) === -1,
    );
  }, [fixture, group, group.segmentId.toString()]);

  return (
    <li>
      <TextInput
        value={group.name}
        onChange={(val) => {
          group.name = val;
          save(`Update the name of a group in ${fixture.name} to ${val}.`);
        }}
      />
      <hr />
      <ul>
        {group.segmentId
          .map(
            (id) => [id, fixture.segments[id]] as [number, WLEDConfig_Segment],
          )
          .map(([id, s]) => (
            <li key={id}>
              {s.name || `Segment ${id}`}{' '}
              <IconButton
                title={`Remove ${s.name}`}
                onClick={() => {
                  group.segmentId = group.segmentId.filter((i) => i !== id);
                  const name = s.name || `Segment ${id}`;
                  save(`Remove ${name} from ${group.name}.`);
                }}
              >
                <BiTrash />
              </IconButton>
            </li>
          ))}
        <li>
          <select
            value={-1}
            onChange={(e) => {
              const id = parseInt(e.target.value);
              group.segmentId.push(id);
              group.segmentId = group.segmentId.sort((a, b) => a - b);
              const name = fixture.segments[id].name || `Segment ${id}`;
              save(`Add ${name} to ${group.name}.`);
            }}
          >
            <option value={-1}>&lt;Add segment&gt;</option>
            {candidateSegments.map(([id, s]) => (
              <option value={id}>{s.name || `Segment ${id}`}</option>
            ))}
          </select>
        </li>
      </ul>
    </li>
  );
}
