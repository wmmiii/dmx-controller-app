import { clone, create } from '@bufbuild/protobuf';
import {
  type TargetedEffect,
  TargetedEffectSchema,
} from '@dmx-controller/proto/targeted_effect_pb';
import { useContext } from 'react';
import { BiPlus, BiTrash } from 'react-icons/bi';

import { ProjectContext } from '../contexts/ProjectContext';
import { getAvailableChannels } from '../engine/fixtures/fixture';
import { IconButton } from './Button';
import { ClipboardControls } from './ClipboardControls';
import styles from './EffectGroupEditor.module.css';
import { OutputSelector, getOutputTargetName } from './OutputSelector';
import { Spacer } from './Spacer';
import { EffectDetails } from './TimecodeEffect';

interface EffectGroupEditorProps {
  targetedEffects: TargetedEffect[];
  name: string;
}

export function EffectGroupEditor({
  targetedEffects,
  name,
}: EffectGroupEditorProps) {
  const { project, save } = useContext(ProjectContext);

  return (
    <div className={styles.detailsPane}>
      {targetedEffects.map((c, i) => {
        if (c.effect == null) {
          throw new Error('Effect is not defined!');
        }
        return (
          <div key={i} className={styles.effect}>
            <div className={styles.header}>
              <h3>Effect {i + 1}</h3>
            </div>
            <div className={styles.header}>
              <ClipboardControls
                typeName="effect channel"
                schema={TargetedEffectSchema}
                value={c}
                onPaste={(c) => {
                  targetedEffects[i] = clone(TargetedEffectSchema, c);
                  save('Paste effect.');
                }}
              />
              <Spacer />
              <IconButton
                title="Delete Effect"
                variant="warning"
                onClick={() => {
                  targetedEffects.splice(i, 1);
                  save(`Delete effect from ${name}`);
                }}
              >
                <BiTrash />
              </IconButton>
            </div>
            <label className={styles.stateHeader}>
              <span>Output</span>
              <OutputSelector
                value={c.outputTarget}
                setValue={(o) => {
                  c.outputTarget = o;
                  save(
                    `Set effect output to ${getOutputTargetName(project, o)}.`,
                  );
                }}
              />
            </label>
            <EffectDetails
              effect={c.effect}
              showPhase={c.outputTarget?.output.case === 'group'}
              availableChannels={getAvailableChannels(c.outputTarget, project)}
              isDisplay={c.outputTarget?.output.case === 'display'}
            />
          </div>
        );
      })}
      <div className={styles.newEffect}>
        <IconButton
          title="Add Effect"
          onClick={() => {
            targetedEffects.push(createTargetedEffect());
            save('Add effect.');
          }}
        >
          <BiPlus />
        </IconButton>
      </div>
    </div>
  );
}

function createTargetedEffect() {
  return create(TargetedEffectSchema, {
    effect: {
      effect: {
        case: 'staticEffect',
        value: {
          state: {},
        },
      },
    },
    outputTarget: {
      output: {
        case: undefined,
        value: undefined,
      },
    },
  });
}
