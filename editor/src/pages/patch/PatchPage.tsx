import { JSX, useContext, useState } from 'react';

import { Button } from '../../components/Button';
import { TextInput } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { ProjectContext } from '../../contexts/ProjectContext';
import { GROUP_ALL_ID } from '../../engine/fixtures/writableDevice';
import { createNewWledOutput } from '../../engine/outputs/wledOutput';
import { randomUint64 } from '../../util/numberUtils';
import { createNewPatch, getActivePatch } from '../../util/projectUtils';
import { DmxEditor } from './DmxEditor';
import { GroupList } from './GroupList';
import styles from './PatchPage.module.scss';
import { WledEditor } from './WledEditor';

export default function PatchPage(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [outputId, setOutputId] = useState(GROUP_ALL_ID);

  const tabs = {
    [GROUP_ALL_ID.toString()]: {
      name: 'Groups',
      contents: <GroupList />,
    },
  };

  for (const [outputIdString, output] of Object.entries(
    getActivePatch(project).outputs,
  )) {
    const outputId = BigInt(outputIdString);
    switch (output.output.case) {
      case 'serialDmxOutput':
        tabs[outputId.toString()] = {
          name: output.name,
          contents: <DmxEditor outputId={outputId} />,
        };
        break;
      case 'wledOutput':
        tabs[outputId.toString()] = {
          name: output.name,
          contents: <WledEditor outputId={outputId} />,
        };
        break;
      default:
        throw Error(`Unknown output type in PatchPage! ${output.output.case}`);
    }
  }

  return (
    <div className={styles.wrapper}>
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
              save(`Change active patch to ${getActivePatch(project).name}.`);
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
        <Button
          onClick={() => {
            const id = randomUint64();
            getActivePatch(project).outputs[id.toString()] =
              createNewWledOutput();
            save('Add WLED device.');
          }}
        >
          Create new WLED device
        </Button>
      </div>
      <Tabs
        className={styles.tabWrapper}
        selectedTab={outputId.toString()}
        setSelectedTab={(tab) => setOutputId(BigInt(tab))}
        tabs={tabs}
      />
    </div>
  );
}
