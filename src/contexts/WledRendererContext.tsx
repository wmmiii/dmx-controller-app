import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { renderWled } from '../engine/renderRouter';
import { sendWled } from '../system_interfaces/wled';
import { getActivePatch, getOutput } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';

export const WledRendererContext = createContext({
  warnings: {} as { [outputId: string]: string },
});

export function WledRendererProvider({ children }: PropsWithChildren) {
  const { project, update } = useContext(ProjectContext);
  const [warnings, setWarnings] = useState<{ [outputId: string]: string }>({});

  const startRenderLoop = (outputId: bigint) => {
    let cont = true;
    let frame = 0;
    (async () => {
      const wledOutput = getActivePatch(project).outputs[outputId.toString()]
        .output.value as WledOutput;

      const latencySamples: number[] = [];

      while (cont) {
        const startMs = new Date().getTime();
        const renderTarget = await renderWled(outputId, frame++);

        try {
          await sendWled(wledOutput.ipAddress, renderTarget);
          latencySamples.push(new Date().getTime() - startMs);
        } catch (e) {
          console.error(e);
          const output = getOutput(project, outputId);
          setWarnings(
            Object.assign({}, warnings, {
              [outputId.toString()]: `Could not connect to WLED device ${output.name}!`,
            }),
          );
        }

        if (latencySamples.length >= 40) {
          const total = latencySamples.reduce((a, b) => a + b);
          const latency = Math.floor(total / latencySamples.length / 2);
          getOutput(project, outputId).latencyMs = latency;
          latencySamples.length = 0;
          update();
        }
      }
    })();

    return () => (cont = false);
  };

  useEffect(() => {
    const renderLoops: Array<() => void> = [];
    Object.entries(getActivePatch(project).outputs)
      .filter(([_, output]) => output.output.case === 'wledOutput')
      .forEach(([id, _]) => renderLoops.push(startRenderLoop(BigInt(id))));

    return () => renderLoops.forEach((f) => f());
  }, [project]);

  return (
    <WledRendererContext.Provider value={{ warnings }}>
      {children}
    </WledRendererContext.Provider>
  );
}
