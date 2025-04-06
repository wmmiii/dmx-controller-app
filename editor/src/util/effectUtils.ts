import {
  Effect_RampEffect,
  Effect_RandomEffect,
  Effect_StaticEffect,
  Effect_StrobeEffect,
  FixtureState,
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
      a: new FixtureState(),
      b: new FixtureState(),
    };
  }
  const e: any = effect;
  const a: FixtureState =
    e.state ??
    e.stateStart ??
    e.stateA ??
    getStates(e.effectA.value)?.a ??
    new FixtureState();
  const b: FixtureState =
    e.state ??
    e.stateEnd ??
    e.stateB ??
    getStates(e.effectB.value)?.a ??
    new FixtureState();
  return {
    a: a,
    b: b,
  };
}
