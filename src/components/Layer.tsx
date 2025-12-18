import { create } from '@bufbuild/protobuf';
import { createRef, JSX, useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import {
  Layer as LayerProto,
  TimecodedEffect,
  TimecodedEffectSchema,
} from '@dmx-controller/proto/effect_pb';
import { BiTrash } from 'react-icons/bi';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { IconButton } from './Button';
import styles from './Layer.module.scss';
import { TimecodeEffect as EffectComponent } from './TimecodeEffect';

interface NewEffect {
  firstMs: number;
  secondMs: number;
  minMs: number;
  maxMs: number;
  effectIndex: number;
}

interface LayerProps {
  layer: LayerProto;
  selectedEffect: TimecodedEffect | null;
  setSelectedEffectAddress: (address: number | null) => void;
  copyEffect: TimecodedEffect | null;
  onDelete: () => void;
  maxMs: number;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function Layer({
  layer,
  selectedEffect,
  setSelectedEffectAddress,
  copyEffect,
  onDelete,
  maxMs,
  msToPx,
  pxToMs,
  snapToBeat,
}: LayerProps): JSX.Element {
  const { save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [newEffect, setNewEffect] = useState<NewEffect | null>(null);
  const layerRef = createRef<HTMLDivElement>();

  useEffect(() => {
    const index = selectedEffect ? layer.effects.indexOf(selectedEffect) : -1;
    if (index < 0) {
      return () => {};
    }

    return setShortcuts([
      {
        shortcut: { key: 'Delete' },
        action: () => {
          layer.effects.splice(index, 1);
          setSelectedEffectAddress(null);
          save('Delete effect.');
        },
        description: 'Delete the currently selected effect.',
      },
    ]);
  }, [layer, selectedEffect, setSelectedEffectAddress, save]);

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      onMouseDown={(e) => {
        const ms = pxToMs(e.clientX);
        let index = layer.effects.findIndex((e) => e.startMs > ms);
        if (index < 0) {
          index = layer.effects.length;
        }
        setNewEffect({
          firstMs: ms,
          secondMs: ms,
          minMs: Math.max(layer.effects[index - 1]?.endMs || 0, 0),
          maxMs: Math.min(
            layer.effects[index]?.startMs || Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
          ),
          effectIndex: index,
        });
      }}
    >
      <IconButton
        className={styles.deleteButton}
        title="Delete layer"
        variant="warning"
        onClick={onDelete}
      >
        <BiTrash />
      </IconButton>
      {newEffect && (
        <>
          <div
            className={styles.newEffect}
            style={{
              left: msToPx(Math.min(newEffect.firstMs, newEffect.secondMs)),
              width:
                msToPx(Math.max(newEffect.firstMs, newEffect.secondMs)) -
                msToPx(Math.min(newEffect.firstMs, newEffect.secondMs)),
            }}
          ></div>
          <div
            className={styles.createMask}
            onMouseMove={(e) => {
              const ms = pxToMs(e.clientX);
              setNewEffect(
                Object.assign({}, newEffect, {
                  secondMs: Math.min(
                    Math.max(ms, newEffect.minMs),
                    newEffect.maxMs,
                    maxMs,
                  ),
                }),
              );
            }}
            onMouseUp={() => {
              if (Math.abs(newEffect.firstMs - newEffect.secondMs) < 100) {
                setNewEffect(null);
                return;
              }

              const e = create(TimecodedEffectSchema, {
                startMs: Math.min(newEffect.firstMs, newEffect.secondMs),
                endMs: Math.max(newEffect.firstMs, newEffect.secondMs),
                effect: {
                  effect: {
                    value: {
                      stateStart: {},
                      stateEnd: {},
                      timingMode: {
                        timing: {
                          case: 'oneShot',
                          value: {},
                        },
                      },
                    },
                    case: 'rampEffect',
                  },
                },
              });
              layer.effects.splice(newEffect.effectIndex, 0, e);
              save('Add new effect.');
              setNewEffect(null);
              setSelectedEffectAddress(newEffect.effectIndex);
            }}
          ></div>
        </>
      )}
      {layer.effects.map((e, i) => (
        <EffectComponent
          key={i}
          className={styles.effect}
          style={{
            left: msToPx(e.startMs),
            width: msToPx(e.endMs) - msToPx(e.startMs),
          }}
          timecodeEffect={e}
          selectedEffect={selectedEffect}
          setSelectedEffect={() => setSelectedEffectAddress(i)}
          copyEffect={copyEffect}
          minMs={layer.effects[i - 1]?.endMs || 0}
          maxMs={layer.effects[i + 1]?.startMs || maxMs}
          pxToMs={(px: number) =>
            pxToMs(px - (layerRef.current?.getBoundingClientRect().left ?? 0))
          }
          snapToBeat={snapToBeat}
        />
      ))}
    </div>
  );
}
