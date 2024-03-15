import { Show_LightLayer } from "@dmx-controller/proto/show_pb";

import styles from './LightLayer.module.scss';
import { Effect as EffectComponent } from "./Effect";
import { useContext, useState } from "react";
import { ProjectContext } from "../contexts/ProjectContext";
import { Effect, Effect_StaticEffect } from "@dmx-controller/proto/effect_pb";

interface NewEffect {
  firstMs: number;
  secondMs: number;
  minMs: number;
  maxMs: number;
  effectIndex: number;
}

interface LightLayerProps {
  layer: Show_LightLayer;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
  forceUpdate: () => void;
}

export function LightLayer({
  layer,
  msToPx,
  pxToMs,
  snapToBeat,
  forceUpdate,
}: LightLayerProps): JSX.Element {
  const { save } = useContext(ProjectContext);
  const [newEffect, setNewEffect] = useState<NewEffect | null>(null);

  return (
    <div
      className={styles.layer}
      onMouseDown={(e) => {
        const ms = pxToMs(e.clientX);
        let index = layer.effects.findIndex(e => e.startMs > ms);
        if (index < 0) {
          index = layer.effects.length;
        }
        setNewEffect({
          firstMs: ms,
          secondMs: ms,
          minMs: Math.max(
            layer.effects[index - 1]?.endMs || 0,
            0),
          maxMs: Math.min(
            layer.effects[index]?.startMs || Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER),
          effectIndex: index,
        })
      }}>
      {
        newEffect &&
        <>
          <div
            className={styles.newEffect}
            style={{
              left: msToPx(Math.min(newEffect.firstMs, newEffect.secondMs)),
              width: msToPx(Math.max(newEffect.firstMs, newEffect.secondMs)) -
                msToPx(Math.min(newEffect.firstMs, newEffect.secondMs)),
            }}>
          </div>
          <div
            className={styles.createMask}
            onMouseMove={(e) => {
              const ms = pxToMs(e.clientX);
              setNewEffect(Object.assign({}, newEffect, {
                secondMs: Math.min(Math.max(
                  ms, newEffect.minMs), newEffect.maxMs),
              }));
            }}
            onMouseUp={() => {
              layer.effects.splice(newEffect.effectIndex, 0, new Effect({
                startMs: Math.min(newEffect.firstMs, newEffect.secondMs),
                endMs: Math.max(newEffect.firstMs, newEffect.secondMs),
                effect: {
                  value: new Effect_StaticEffect({
                    state: {},
                  }),
                  case: 'staticEffect',
                },
              }));
              save();
              setNewEffect(null);
            }}>
          </div>
        </>
      }
      {layer.effects.map((e, i) => (
        <EffectComponent
          key={i}
          className={styles.effect}
          style={{
            left: msToPx(e.startMs),
            width: msToPx(e.endMs) - msToPx(e.startMs),
          }}
          effect={e}
          minMs={layer.effects[i - 1]?.endMs || 0}
          maxMs={layer.effects[i + 1]?.startMs || Number.MAX_SAFE_INTEGER}
          pxToMs={pxToMs}
          snapToBeat={snapToBeat}
          save={() => save()}
          onDelete={() => {
            layer.effects.splice(i, 1);
            save();
          }}
          forceUpdate={forceUpdate} />
      ))}
    </div>
  );
}
