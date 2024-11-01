import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import IconBxPlus from '../icons/IconBxPlus';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_Component } from '@dmx-controller/proto/scene_pb';
import { NumberInput, TextInput, ToggleInput } from './Input';

import styles from './SceneEditor.module.scss';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { LiveBeat } from './LiveBeat';
import IconBxsCog from '../icons/IconBxsCog';
import { Modal } from './Modal';
import IconBxMinus from '../icons/IconBxMinus';
import IconBxPause from '../icons/IconBxPause';
import IconBxPlay from '../icons/IconBxPlay';
import IconBxGridVertical from '../icons/IconBxGridVertical';
import IconBxX from '../icons/IconBxX';
import IconBxWrench from '../icons/IconBxWrench';
import { UniverseSequenceEditor } from './UniverseSequenceEditor';

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
  const [draggingComponent, setDraggingComponent] = useState<Scene_Component | null>(null);

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

  const onDragOver = (newIndex: number) => {
    const originalIndex = scene.components.indexOf(draggingComponent);
    if (originalIndex !== newIndex) {
      scene.components.splice(originalIndex, 1);
      scene.components.splice(newIndex, 0, draggingComponent);
      save();
    }
  }

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
      <table className={styles.componentList}>
        <tbody>
          {
            scene.components.map((c, i) => (
              <tr
                key={i}
                draggable={draggingComponent === c}
                onDragOver={() => onDragOver(i)}>
                <Component
                  component={c}
                  onDelete={() => {
                    scene.components.splice(i, 1);
                    save();
                  }}
                  onDragStart={() => setDraggingComponent(c)} />
              </tr>
            ))
          }
          <tr>
            <td></td>
            <td colSpan={2}>
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
            </td>
          </tr>
        </tbody>
      </table>
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
  onDragStart: () => void;
}

function Component({ component, onDelete, onDragStart }: ComponentProps) {
  const { save, project } = useContext(ProjectContext);

  const [showSequenceEditor, setShowSequenceEditor] = useState(false);

  return (
    <>
      <td className={styles.rearrange}>
        <div
          className={styles.dragHandle}
          onMouseDown={onDragStart}>
          <IconBxGridVertical />
        </div>
      </td>
      <td>
        <IconButton
          title={component.active ?
            `Disable ${project.universeSequences[component.universeSequenceId]?.name}` :
            `Enable ${project.universeSequences[component.universeSequenceId]?.name}`
          }
          variant={component.active ? 'primary' : 'default'}
          onClick={() => {
            component.active = !component.active;
            save();
          }}>
          {
            component.active ?
              <IconBxPause /> :
              <IconBxPlay />
          }
        </IconButton>
      </td>
      <td>
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
      </td>
      <td>
        <IconButton
          title="Show editor"
          onClick={() => setShowSequenceEditor(true)}>
          <IconBxWrench />
        </IconButton>
        {
          showSequenceEditor &&
          <Modal
            bodyClass={styles.universeSequenceEditor}
            title={`Edit ${project.universeSequences[component.universeSequenceId].name}`}
            onClose={() => setShowSequenceEditor(false)}
            fullScreen={true}>
            <UniverseSequenceEditor universeSequenceId={component.universeSequenceId} />
          </Modal>
        }
      </td>
      <td>
        <input
          className={styles.shortcut}
          onChange={() => { }}
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
      </td>
      <td>
        <ToggleInput
          className={styles.switch}
          value={component.duration?.case === 'durationMs'}
          onChange={(value) => {
            if (value) {
              component.duration = {
                case: 'durationMs',
                value: 1000,
              }
            } else {
              component.duration.case = undefined;
              component.duration.value = undefined;
            }
            save();
          }}
          labels={{ left: 'Beat', right: 'Seconds' }} />
        <NumberInput
          type='float'
          min={0.001}
          max={300}
          value={component.duration?.value / 1000 || NaN}
          onChange={(value) => {
            component.duration.value = Math.floor(value * 1000);
            save();
          }}
          disabled={component.duration?.case !== 'durationMs'} />
      </td>
      <td>
        <IconButton
          title="Delete Component"
          onClick={onDelete}>
          <IconBxX />
        </IconButton>
      </td>
    </>
  );
}
