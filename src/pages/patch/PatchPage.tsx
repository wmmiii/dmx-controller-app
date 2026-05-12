import { JSX, useContext, useState } from 'react';

import { create } from '@bufbuild/protobuf';
import {
  Output,
  OutputSchema,
  PatchSchema,
} from '@dmx-controller/proto/output_pb';
import { BiPlus, BiTrash } from 'react-icons/bi';
import { Button } from '../../components/Button';
import { EditableText } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Tabs, TabsType } from '../../components/Tabs';
import { ProjectContext } from '../../contexts/ProjectContext';
import { randomUint64 } from '../../util/numberUtils';
import {
  deleteFromOutputTargets,
  getActivePatch,
} from '../../util/projectUtils';
import { DdpEditor } from './DdpEditor';
import { DisplayEditor } from './DisplayEditor';
import { GroupEditor } from './GroupEditor';
import styles from './PatchPage.module.css';
import { SacnEditor } from './SacnEditor';
import { SerialEditor } from './SerialEditor';
import { WledEditor } from './WledEditor';

const GROUP_KEY = 'group';
const DISPLAY_KEY = 'display';
const NEW_OUTPUT_KEY = 'new';

export default function PatchPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [tabKey, setTabKey] = useState(GROUP_KEY);
  const [showNewOutputDialog, setShowNewOutputDialog] = useState(false);

  const tabs: TabsType = {
    [GROUP_KEY]: {
      name: 'Groups',
      contents: <GroupEditor />,
    },
    [DISPLAY_KEY]: {
      name: 'Displays',
      contents: <DisplayEditor />,
    },
  };

  for (const [outputIdString, output] of Object.entries(
    getActivePatch(project).outputs,
  ).sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))) {
    const outputId = BigInt(outputIdString);
    switch (output.output.case) {
      case 'sacnDmxOutput':
        tabs[outputId.toString()] = {
          name: (
            <OutputTabHeader
              output={output}
              outputId={outputId}
              tabKey={tabKey}
              setTabKey={setTabKey}
            />
          ),
          contents: <SacnEditor outputId={outputId} />,
        };
        break;
      case 'serialDmxOutput':
        tabs[outputId.toString()] = {
          name: (
            <OutputTabHeader
              output={output}
              outputId={outputId}
              tabKey={tabKey}
              setTabKey={setTabKey}
            />
          ),
          contents: <SerialEditor outputId={outputId} />,
        };
        break;
      case 'wledOutput':
        tabs[outputId.toString()] = {
          name: (
            <OutputTabHeader
              output={output}
              outputId={outputId}
              tabKey={tabKey}
              setTabKey={setTabKey}
            />
          ),
          contents: <WledEditor outputId={outputId} />,
        };
        break;
      case 'ddpOutput':
        tabs[outputId.toString()] = {
          name: (
            <OutputTabHeader
              output={output}
              outputId={outputId}
              tabKey={tabKey}
              setTabKey={setTabKey}
            />
          ),
          contents: <DdpEditor outputId={outputId} />,
        };
        break;
      case undefined:
        // Corrupted or legacy output with no type - show error tab so user can delete it
        tabs[outputId.toString()] = {
          name: (
            <OutputTabHeader
              output={output}
              outputId={outputId}
              tabKey={tabKey}
              setTabKey={setTabKey}
            />
          ),
          contents: (
            <p style={{ color: 'var(--red-9)', padding: '1rem' }}>
              This output has no type set (corrupted or legacy data). Please
              delete it using the trash icon in the tab header and recreate it.
            </p>
          ),
        };
        break;
      default: {
        const exhaustiveCheck: never = output.output;
        throw Error(
          `Unknown output type in PatchPage! ${(exhaustiveCheck as { case: unknown }).case}`,
        );
      }
    }
  }
  tabs[NEW_OUTPUT_KEY] = {
    name: <BiPlus />,
    contents: <></>,
  };

  const setTab = (key: string) => {
    if (key === NEW_OUTPUT_KEY) {
      setShowNewOutputDialog(true);
    } else {
      setTabKey(key);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Tabs
        className={styles.tabWrapper}
        selectedTab={tabKey.toString()}
        setSelectedTab={(tab) => setTab(tab)}
        tabs={tabs}
        before={
          <div className={styles.patch}>
            <Select
              value={project.activePatch.toString()}
              onChange={(value) => {
                if (value === 'new') {
                  const id = randomUint64();
                  project.patches[id.toString()] = create(PatchSchema, {
                    name: 'New Patch',
                    outputs: {},
                  });
                  project.activePatch = id;
                  save('Create a new patch.');
                } else {
                  project.activePatch = BigInt(value);
                  save(
                    `Change active patch to ${getActivePatch(project).name}.`,
                  );
                }
              }}
              options={[
                ...Object.entries(project.patches).map(([i, p]) => ({
                  value: i.toString(),
                  label: p.name,
                })),
                { value: 'new', label: '+ Add new patch' },
              ]}
            />
            <EditableText
              value={getActivePatch(project).name}
              onChange={(v) => {
                getActivePatch(project).name = v;
                save(`Set patch name to "${v}".`);
              }}
            />
          </div>
        }
      />
      {showNewOutputDialog && (
        <Modal
          title="Create new output"
          bodyClass={styles.createNew}
          onClose={() => setShowNewOutputDialog(false)}
          footer={
            <>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DMX Serial Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'serialDmxOutput',
                        value: {
                          fixtures: {},
                        },
                      },
                    },
                  );
                  save('Create Serial DMX output.');
                  setTabKey(id.toString());
                  setShowNewOutputDialog(false);
                }}
                disabled={Boolean(
                  Object.values(getActivePatch(project).outputs).find(
                    (o) => o.output.case === 'serialDmxOutput',
                  ),
                )}
              >
                Serial Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DMX SACN Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'sacnDmxOutput',
                        value: {
                          ipAddress: '0.0.0.0',
                          fixtures: {},
                        },
                      },
                    },
                  );
                  save('Create SACN DMX output.');
                  setTabKey(id.toString());
                  setShowNewOutputDialog(false);
                }}
              >
                SACN Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'WLED Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'wledOutput',
                        value: {
                          segments: {},
                        },
                      },
                    },
                  );
                  save('Create WLED output.');
                  setTabKey(id.toString());
                  setShowNewOutputDialog(false);
                }}
              >
                WLED Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DDP Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'ddpOutput',
                        value: {
                          ipAddress: '',
                        },
                      },
                    },
                  );
                  save('Create DDP output.');
                  setTabKey(id.toString());
                  setShowNewOutputDialog(false);
                }}
              >
                DDP Output
              </Button>
            </>
          }
        >
          <p>Which type of output would you like to create?</p>
        </Modal>
      )}
    </div>
  );
}

interface OutputTabHeaderProps {
  output: Output;
  outputId: bigint;
  tabKey: string;
  setTabKey: (key: string) => void;
}

function OutputTabHeader({
  output,
  outputId,
  tabKey,
  setTabKey,
}: OutputTabHeaderProps) {
  const { project, save } = useContext(ProjectContext);
  return (
    <>
      <EditableText
        value={output.name}
        onChange={(name) => {
          output.name = name;
          save(`Change name of output to ${name}.`);
        }}
      />
      {tabKey === outputId.toString() && (
        <>
          &nbsp;
          <BiTrash
            size="1em"
            onClick={(ev) => {
              deleteFromOutputTargets(project, (id) => id.output === outputId);

              delete getActivePatch(project).outputs[outputId.toString()];

              setTabKey(GROUP_KEY);
              save(`Delete output ${output.name}.`);
              ev.stopPropagation();
            }}
          />
        </>
      )}
    </>
  );
}
