import styles from './LightLayer.module.scss';
import { Effect as EffectComponent, EffectSelectContext } from "./Effect";
import { Effect, Effect_RampEffect, Effect_StaticEffect } from "@dmx-controller/proto/effect_pb";
import { LightLayer as LightLayerProto } from "@dmx-controller/proto/light_layer_pb";
import { useContext, useState } from "react";

interface NewEffect {
  firstMs: number;
  secondMs: number;
  minMs: number;
  maxMs: number;
  effectIndex: number;
}

interface LightLayerProps {
  className?: string;
  layer: LightLayerProto;
  maxMs: number;
  msToPx: (ms: number) => number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
  save: () => void;
}

export function LightLayer({
  className,
  layer,
  maxMs,
  msToPx,
  pxToMs,
  snapToBeat,
  save,
}: LightLayerProps): JSX.Element {
  const { selectEffect } = useContext(EffectSelectContext);
  const [newEffect, setNewEffect] = useState<NewEffect | null>(null);

  return (
    <div
      className={className || styles.layer}
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
                  ms, newEffect.minMs), newEffect.maxMs, maxMs),
              }));
            }}
            onMouseUp={() => {
              if (Math.abs(newEffect.firstMs - newEffect.secondMs) < 100) {
                setNewEffect(null);
                return;
              }

              const e = new Effect({
                startMs: Math.min(newEffect.firstMs, newEffect.secondMs),
                endMs: Math.max(newEffect.firstMs, newEffect.secondMs),
                effect: {
                  value: new Effect_RampEffect({
                    start: {
                      case: 'fixtureStateStart',
                      value: {},
                    },
                    end: {
                      case: 'fixtureStateEnd',
                      value: {},
                    },
                  }),
                  case: 'rampEffect',
                },
              });
              layer.effects.splice(newEffect.effectIndex, 0, e);
              save();
              setNewEffect(null);
              selectEffect({
                effect: e,
                delete: () => {
                  layer.effects.splice(newEffect.effectIndex, 1);
                  save();
                }
              })
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
          maxMs={layer.effects[i + 1]?.startMs || maxMs}
          pxToMs={pxToMs}
          snapToBeat={snapToBeat}
          save={() => save()}
          onDelete={() => {
            layer.effects.splice(i, 1);
            save();
          }} />
      ))}
    </div>
  );
}
