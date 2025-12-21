import { create } from '@bufbuild/protobuf';
import {
  Effect_SequenceEffect,
  FixtureStateSchema,
  type Effect_RampEffect,
  type Effect_RandomEffect,
  type Effect_StaticEffect,
  type Effect_StrobeEffect,
  type FixtureState,
} from '@dmx-controller/proto/effect_pb';

export function getStates(
  effect:
    | Effect_StaticEffect
    | Effect_RampEffect
    | Effect_StrobeEffect
    | Effect_RandomEffect
    | Effect_SequenceEffect
    | undefined,
) {
  if (!effect) {
    return {
      a: create(FixtureStateSchema, {}),
      b: create(FixtureStateSchema, {}),
    };
  }
  const e: any = effect;
  const a: FixtureState =
    e.state ??
    e.stateStart ??
    e.stateA ??
    getStates(e.effectA?.value)?.a ??
    create(FixtureStateSchema, {});
  const b: FixtureState =
    e.state ??
    e.stateEnd ??
    e.stateB ??
    getStates(e.effectB?.value)?.a ??
    create(FixtureStateSchema, {});
  return {
    a: a,
    b: b,
  };
}
