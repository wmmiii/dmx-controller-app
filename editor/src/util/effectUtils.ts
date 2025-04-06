import { create } from '@bufbuild/protobuf';
import {
  Effect_RampEffect,
  Effect_RandomEffect,
  Effect_StaticEffect,
  Effect_StrobeEffect,
  FixtureState,
  FixtureStateSchema,
} from '@dmx-controller/proto/effect_pb';

export function getStates(
  effect:
    | Effect_StaticEffect
    | Effect_RampEffect
    | Effect_StrobeEffect
    | Effect_RandomEffect
    | undefined,
) {
  if (!effect) {
    return {
      a: create(FixtureStateSchema),
      b: create(FixtureStateSchema),
    };
  }
  const e: any = effect;
  const a: FixtureState =
    e.state ??
    e.stateStart ??
    e.stateA ??
    getStates(e.effectA.value)?.a ??
    create(FixtureStateSchema);
  const b: FixtureState =
    e.state ??
    e.stateEnd ??
    e.stateB ??
    getStates(e.effectB.value)?.a ??
    create(FixtureStateSchema);
  return {
    a: a,
    b: b,
  };
}
