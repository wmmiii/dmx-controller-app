import { createContext, PropsWithChildren, useRef } from 'react';
import { WritableOutput } from '../engine/context';

type RenderFunction = (frame: number, output: WritableOutput) => void;

export const RenderingContext = createContext({
  renderFunction: {
    current: (() => {}) as RenderFunction,
  },
  setRenderFunction: (_f: RenderFunction) => {},
  clearRenderFunction: (_f: RenderFunction) => {},
  subscribeToRender: (
    _outputId: bigint,
    _f: (output: WritableOutput) => void,
  ) => {},
  unsubscribeFromRender: (
    _outputId: bigint,
    _f: (output: WritableOutput) => void,
  ) => {},
});

export function RenderingProvider({ children }: PropsWithChildren) {
  const renderFunction = useRef<RenderFunction>(() => {});
  const wrappedRenderFunction = useRef<RenderFunction>(() => {});
  const renderSubscribers = useRef<
    Map<bigint, Array<(output: WritableOutput) => void>>
  >(new Map());

  return (
    <RenderingContext.Provider
      value={{
        renderFunction: wrappedRenderFunction,
        setRenderFunction: (f) => {
          renderFunction.current = f;
          wrappedRenderFunction.current = (frame, output) => {
            f(frame, output);
            const subscribers = renderSubscribers.current.get(output.outputId);
            subscribers?.forEach((s) => s(output));
          };
        },
        clearRenderFunction: (f) => {
          if (renderFunction.current === f) {
            renderFunction.current = () => {};
            wrappedRenderFunction.current = () => {};
          }
        },
        subscribeToRender: (outputId, f) => {
          let subscribers = renderSubscribers.current.get(outputId);
          if (!subscribers) {
            subscribers = [];
            renderSubscribers.current.set(outputId, subscribers);
          }
          subscribers.push(f);
        },
        unsubscribeFromRender: (outputId, f) => {
          let subscribers = renderSubscribers.current.get(outputId);
          if (subscribers) {
            subscribers = subscribers.filter((s) => s !== f);
          }
        },
      }}
    >
      {children}
    </RenderingContext.Provider>
  );
}
