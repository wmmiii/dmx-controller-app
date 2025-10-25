import { create } from '@bufbuild/protobuf';
import { JSX, useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import {
  Effect,
  EffectSchema,
  Layer as LayerProto,
} from '@dmx-controller/proto/timecoded_pb';
import { ShortcutContext } from '../contexts/ShortcutContext';
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
  className?: string;
  layer: LayerProto;
  selectedEffect: Effect | null;
  setSelectedEffect: (e: Effect | null) => void;
  copyEffect: Effect | null;
  maxMs: number;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function Layer({
  className,
  layer,
  selectedEffect,
  setSelectedEffect,
  copyEffect,
  maxMs,
  msToPx,
  pxToMs,
  snapToBeat,
}: LayerProps): JSX.Element {
  const { save } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [newEffect, setNewEffect] = useState<NewEffect | null>(null);

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
          setSelectedEffect(null);
          save('Delete effect.');
        },
        description: 'Delete the currently selected effect.',
      },
    ]);
  }, [layer, selectedEffect, setSelectedEffect, save]);

  return (
    <div
      className={className || styles.layer}
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

              const e = create(EffectSchema, {
                startMs: Math.min(newEffect.firstMs, newEffect.secondMs),
                endMs: Math.max(newEffect.firstMs, newEffect.secondMs),
                effect: {
                  effect: {
                    value: {
                      stateStart: {},
                      stateEnd: {},
                    },
                    case: 'rampEffect',
                  },
                },
              });
              layer.effects.splice(newEffect.effectIndex, 0, e);
              save('Add new effect.');
              setNewEffect(null);
              setSelectedEffect(e);
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
          setSelectedEffect={setSelectedEffect}
          copyEffect={copyEffect}
          minMs={layer.effects[i - 1]?.endMs || 0}
          maxMs={layer.effects[i + 1]?.startMs || maxMs}
          pxToMs={pxToMs}
          snapToBeat={snapToBeat}
        />
      ))}
    </div>
  );
}
