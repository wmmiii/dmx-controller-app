import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component } from '@dmx-controller/proto/scene_pb';
import { TextInput } from './Input';

import styles from './SceneEditor.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { LiveBeat } from './LiveBeat';
import IconBxsCog from '../icons/IconBxsCog';
import { Modal } from './Modal';
import IconBxMinus from '../icons/IconBxMinus';

interface SceneEditorProps {
  className?: string;
  sceneId: number;
  onDelete: () => void;
}

export function SceneEditor({
  className,
  sceneId,
  onDelete,
}: SceneEditorProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);

  const [sceneDetailsModal, setSceneDetailsModal] = useState(false);

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
          description: `Group toggle all components with the "${s}" shortcut.`,
        })));
  }, [scene.components.map(c => c.shortcut)]);

  const classes = [styles.sceneEditor, className];

  return (
    <div className={classes.join(' ')}>
      <div className={styles.header}>
        <Button
          className={styles.activateButton}
          disabled={project.activeScene === sceneId}
          onClick={() => {
            project.activeScene = sceneId;
            save();
          }}>
          {project.activeScene === sceneId ? 'Active' : 'Activate'}
        </Button>
        <Button onClick={() => setSceneDetailsModal(true)}>
          Scene Details
        </Button>
        <LiveBeat />
      </div>
      <ol className={styles.componentList}>
        {
          scene.components.map((c, i) => (
            <li key={i}>
              <Component
                component={c}
                onDelete={() => {
                  scene.components.splice(i, 1);
                  save();
                }}
                swapDown={i === 0 ? undefined : () => {
                  const temp = scene.components[i];
                  scene.components[i] = scene.components[i - 1];
                  scene.components[i - 1] = temp;
                  save();
                }}
                swapUp={i === scene.components.length - 1 ? undefined : () => {
                  const temp = scene.components[i];
                  scene.components[i] = scene.components[i + 1];
                  scene.components[i + 1] = temp;
                  save();
                }} />
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
      {
        sceneDetailsModal &&
        <Modal
          title={`${scene.name} Details`}
          footer={
            <Button
              variant="primary"
              onClick={() => setSceneDetailsModal(false)}>
              Done
            </Button>
          }
          onClose={() => setSceneDetailsModal(false)}>
          <TextInput
            value={scene.name}
            onChange={(v) => {
              scene.name = v;
              save();
            }} />
          <Button
            variant="warning"
            onClick={onDelete}>
            Delete Scene
          </Button>&nbsp;
          Cannot be undone!
        </Modal>
      }
    </div>
  );
}

interface ComponentProps {
  component: Scene_Component;
  onDelete: () => void;
  swapUp?: () => void;
  swapDown?: () => void;
}

function Component({ component, onDelete, swapUp, swapDown }: ComponentProps) {
  const { save, project } = useContext(ProjectContext);

  const [componentDetailsModal, setComponentDetailsModal] = useState(false);

  return (
    <div className={styles.component}>
      <div className={styles.row}>
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
                  <option key={id} value={id}>{sequence.name}</option>
                );
              })
          }
        </select>
        <IconButton
          title="Component Settings"
          onClick={() => setComponentDetailsModal(true)}>
          <IconBxsCog />
        </IconButton>
      </div>

      <div className={styles.row}>
        {
          swapDown &&
          <IconButton title="Decrease Priority" onClick={swapDown}>
            <IconBxMinus />
          </IconButton>
        }
        {
          swapUp &&
          <IconButton title="Increase Priority" onClick={swapUp}>
            <IconBxPlus />
          </IconButton>
        }
        Shortcut:&nbsp;
        <input
          className={styles.shortcut}
          onChange={() => {}}
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
      {
        componentDetailsModal &&
        <Modal
          title="Component Settings"
          footer={
            <Button
              variant="primary"
              onClick={() => setComponentDetailsModal(false)}>
              Done
            </Button>
          }
          onClose={() => setComponentDetailsModal(false)}>
          <div>
            <Button
              variant="warning"
              onClick={onDelete}>
              Delete Component
            </Button>&nbsp;
            Cannot be undone!
          </div>
        </Modal>
      }
    </div>
  );
}
