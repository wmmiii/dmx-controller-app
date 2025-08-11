import { JSX, useContext, useState } from 'react';

import { BiPlus, BiTrash } from 'react-icons/bi';
import { EditableText, TextInput } from '../../components/Input';
import { Tabs, TabsType } from '../../components/Tabs';
import { ProjectContext } from '../../contexts/ProjectContext';
import { deleteOutput } from '../../engine/outputs/outputs';
import { createNewWledOutput } from '../../engine/outputs/wledOutput';
import { randomUint64 } from '../../util/numberUtils';
import { createNewPatch, getActivePatch } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import { GroupEditor } from './GroupEditor';
import styles from './PatchPage.module.scss';
import { WledEditor } from './WledEditor';

const GROUP_KEY = 'group';
const NEW_OUTPUT_KEY = 'new';

export default function PatchPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [tabKey, setTabKey] = useState(GROUP_KEY);

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
      case 'serialDmxOutput':
        tabs[outputId.toString()] = {
          name: (
            <>
              <EditableText
                value={output.name}
                onChange={(name) => {
                  output.name = name;
                  save(`Change name of output to ${name}.`);
                }}
              />
            </>
          ),
          contents: <DmxEditor outputId={outputId} />,
        };
        break;
      case 'wledOutput':
        tabs[outputId.toString()] = {
          name: (
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
                      deleteOutput(project, outputId);
                      setTabKey(GROUP_KEY);
                      save(`Delete output ${output.name}.`);
                      ev.stopPropagation();
                    }}
                  />
                </>
              )}
            </>
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
      const id = randomUint64();
      getActivePatch(project).outputs[id.toString()] = createNewWledOutput();
      save('Add WLED device.');
      setTabKey(id.toString());
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
                  project.patches[id.toString()] = createNewPatch('New Patch');
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
    </div>
  );
}
