import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { BeatContext } from '../contexts/BeatContext';
import { Button } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component } from '@dmx-controller/proto/scene_pb';
import { SerialContext } from '../contexts/SerialContext';
import { TextInput } from './Input';
import { renderSceneToUniverse } from '../engine/universe';

import styles from './SceneEditor.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';

interface SceneEditorProps {
  className?: string;
  sceneId: number;
}

export function SceneEditor({
  className,
  sceneId
}: SceneEditorProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const { beat: beatMetadata } = useContext(BeatContext);
  const { setRenderUniverse, clearRenderUniverse } = useContext(SerialContext);

  const scene = useMemo(() => project?.scenes[sceneId], [sceneId]);

  const toggleComponents = useCallback((shortcut: string) => {
    const components = scene.components.filter((c) => c.shortcut === shortcut);
    if (components.find(c => !c.active)) {
      components.forEach(c => c.active = true);
    } else {
      components.forEach(c => c.active = false);
    }
    save();
  }, [scene]);

  useEffect(() => {
    const shortcuts = new Set(
      scene.components.map(c => c.shortcut).filter(c => c != null && c !== ''));

    return setShortcuts(
      Array.from(shortcuts)
        .map(s => ({
          shortcut: { key: 'Digit' + s },
          action: () => toggleComponents(s),
          description: `Group toggle all components with a "${s}" shortcut.`,
        })));
  }, [scene]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const render = () => renderSceneToUniverse(
      new Date().getTime(),
      sceneId,
      beatMetadata,
      project,
    );
    setRenderUniverse(render);

    return () => clearRenderUniverse(render);
  }, [sceneId, beatMetadata, project]);

  const classes = [styles.sceneEditor, className];

  return (
    <div className={classes.join(' ')}>
      <div>

      </div>
      <ol className={styles.componentList}>
        {
          scene.components.map((c, i) => (
            <li key={i}>
              <Component component={c} />
            </li>
          ))
        }
        <li>
          <Button
            icon={<IconBxPlus />}
            onClick={() => {
              scene.components.push(new Scene_Component({
                name: "New Component",
                universeSequenceId: 0,
                active: false,
              }));
              save();
            }}>
            Add Component
          </Button>
        </li>
      </ol>
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
}

function Component({ component }: ComponentProps) {
  const { save, project } = useContext(ProjectContext);

  return (
    <div className={styles.component}>
      <TextInput value={component.name} onChange={(v) => {
        component.name = v;
        save();
      }} />

      <select
        value={component.universeSequenceId}
        onChange={(e) => {
          component.universeSequenceId = parseInt(e.target.value);
          save();
        }}>
        <option value={0}>&lt;Unset&gt;</option>
        {
          Object.keys(project.universeSequences)
            .map(id => {
              const sequence = project.universeSequences[parseInt(id)];
              return (
                <option value={id}>{sequence.name}</option>
              );
            })
        }
      </select>

      <div>
        Shortcut:&nbsp;
        <input
          onKeyDown={(e) => {
            if (e.code.startsWith('Digit')) {
              component.shortcut = e.code.substring(5);
              save();
            } else if (e.code === 'Backspace' || e.code === 'Delete') {
              component.shortcut = '';
              save();
            }
          }}
          value={component.shortcut} />
      </div>

      <Button
        variant={component.active ? 'primary' : 'default'}
        onClick={() => {
          component.active = !component.active;
          save();
        }}>
        {component.active ? 'Active' : 'Disabled'}
      </Button>
    </div>
  );
}
