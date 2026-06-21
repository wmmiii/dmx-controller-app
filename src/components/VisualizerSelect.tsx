import { type FixtureState } from '@dmx-controller/proto/effect_pb';
import { type Visualizer } from '@dmx-controller/proto/visualizer_pb';
import { useContext, useEffect, useState } from 'react';
import { BiChevronDown, BiChevronUp, BiX } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
import { getBuiltinVisualizers } from '../system_interfaces/shader';
import { IconButton } from './Button';
import { Select } from './Select';
import styles from './VisualizerSelect.module.css';

interface VisualizerSelectProps {
  state: FixtureState;
}

export function VisualizerSelect({ state }: VisualizerSelectProps) {
  const { project, save } = useContext(ProjectContext);
  const [builtins, setBuiltins] = useState<{[key: string]: Visualizer}>({});

  useEffect(() => {
    getBuiltinVisualizers()
      .then(setBuiltins)
      .catch(console.error);
  }, []);

  const getName = (id: bigint): string => {
    const key = id.toString();
    return builtins[key]?.name ?? project.visualizers[key]?.name ?? `#${key}`;
  };

  const handleRemove = (index: number) => {
    state.visualizerIds.splice(index, 1);
    save('Remove visualizer from effect.');
  };

  const handleMoveUp = (index: number) => {
    const ids = state.visualizerIds;
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    save('Reorder visualizers.');
  };

  const handleMoveDown = (index: number) => {
    const ids = state.visualizerIds;
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    save('Reorder visualizers.');
  };

  const handleAdd = (idStr: string) => {
    if (!idStr) {
      return;
    }
    state.visualizerIds.push(BigInt(idStr));
    save('Add visualizer to effect.');
  };

  return (
    <div className={styles.visualizerSelect}>
      {state.visualizerIds.map((id, i) => (
        <div key={i} className={styles.item}>
          <span className={styles.name}>{getName(id)}</span>
          <IconButton
            title="Move up"
            onClick={() => handleMoveUp(i)}
            disabled={i === 0}
          >
            <BiChevronUp />
          </IconButton>
          <IconButton
            title="Move down"
            onClick={() => handleMoveDown(i)}
            disabled={i === state.visualizerIds.length - 1}
          >
            <BiChevronDown />
          </IconButton>
          <IconButton title="Remove visualizer" onClick={() => handleRemove(i)}>
            <BiX />
          </IconButton>
        </div>
      ))}
        <Select
          value=""
          placeholder="+ Add visualizer"
          onChange={handleAdd}
          options={[
    { label: 'My Visualizers', options: Object.entries(project.visualizers).map(([id, v]) => ({
    value: id,
    label: v.name,
  })) },
    { label: 'Built-in', options: Object.entries(builtins).map(([id, v]) => ({
    value: id,
    label: v.name,
  })) },
  ]}
        />
    </div>
  );
}
