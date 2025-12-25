import { JSX, useContext, useState } from 'react';

import { create } from '@bufbuild/protobuf';
import {
  Output,
  OutputSchema,
  PatchSchema,
} from '@dmx-controller/proto/output_pb';
import { BiPlus, BiTrash } from 'react-icons/bi';
import { Button } from '../../components/Button';
import { EditableText, TextInput } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Tabs, TabsType } from '../../components/Tabs';
import { ProjectContext } from '../../contexts/ProjectContext';
import { randomUint64 } from '../../util/numberUtils';
import {
  deleteFromOutputTargets,
  getActivePatch,
} from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import { GroupEditor } from './GroupEditor';
import styles from './PatchPage.module.scss';
import { SacnEditor } from './SacnEditor';
import { WledEditor } from './WledEditor';

const GROUP_KEY = 'group';
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
  };

  for (const [outputIdString, output] of Object.entries(
    getActivePatch(project).outputs,
  )) {
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
          contents: <DmxEditor outputId={outputId} />,
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
      default:
        throw Error(`Unknown output type in PatchPage! ${output.output.case}`);
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
            <select
              value={project.activePatch.toString()}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  const id = randomUint64();
                  project.patches[id.toString()] = create(PatchSchema, {
                    name: 'New Patch',
                    outputs: {},
                  });
                  project.activePatch = id;
                  save('Create a new patch.');
                } else {
                  project.activePatch = BigInt(e.target.value);
                  save(
                    `Change active patch to ${getActivePatch(project).name}.`,
                  );
                }
              }}
            >
              {Object.entries(project.patches).map(([i, p]) => (
                <option key={i} value={i.toString()}>
                  {p.name}
                </option>
              ))}
              <option value="new">+ Add new patch</option>
            </select>
            <TextInput
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
          onClose={() => setShowNewOutputDialog(false)}
        >
          <Button
            onClick={() => {
              const id = randomUint64();
              getActivePatch(project).outputs[id.toString()] = create(
                OutputSchema,
                {
                  name: 'DMX Serial Output',
                  latencyMs: 0,
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
