import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import { SacnDmxOutput } from '@dmx-controller/proto/output_pb';
import { renderDmx } from '../engine/renderRouter';
import { outputDmxSacn, sacnSupported } from '../system_interfaces/sacn';
import { getActivePatch, getOutput } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';

export const SacnRendererContext = createContext({
  warnings: {} as { [outputId: string]: string },
});

export function SacnRendererProvider({ children }: PropsWithChildren) {
  const { project, update } = useContext(ProjectContext);
  const [warnings, setWarnings] = useState<{ [outputId: string]: string }>({});

  const startRenderLoop = (outputId: bigint) => {
    let cont = true;
    let frame = 0;
    (async () => {
      const sacnOutput = getActivePatch(project).outputs[outputId.toString()]
        .output.value as SacnDmxOutput;

      const latencySamples: number[] = [];

      while (cont) {
        const startMs = new Date().getTime();
        const dmxOutput = await renderDmx(outputId, frame++);

        try {
          await outputDmxSacn(
            sacnOutput.universe,
            sacnOutput.ipAddress,
            dmxOutput,
          );
          latencySamples.push(new Date().getTime() - startMs);
        } catch (e) {
          console.error(e);
          const output = getOutput(project, outputId);
          setWarnings(
            Object.assign({}, warnings, {
              [outputId.toString()]: `Could not connect to SACN device ${output.name}!`,
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

        const durationMs = new Date().getTime() - startMs;
        if (durationMs < 25) {
          await new Promise((resolve) => setTimeout(resolve, 16 - durationMs));
        }
      }
    })();

    return () => (cont = false);
  };

  useEffect(() => {
    if (!sacnSupported) {
      return;
    }

    const renderLoops: Array<() => void> = [];
    Object.entries(getActivePatch(project).outputs)
      .filter(([_, output]) => output.output.case === 'sacnDmxOutput')
      .forEach(([id, _]) => renderLoops.push(startRenderLoop(BigInt(id))));

    return () => renderLoops.forEach((f) => f());
  }, [project]);

  return (
    <SacnRendererContext.Provider value={{ warnings }}>
      {children}
    </SacnRendererContext.Provider>
  );
}
