import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import { SacnDmxOutput } from '@dmx-controller/proto/output_pb';
import { getDmxWritableOutput } from '../engine/outputs/dmxOutput';
import { outputDmxSacn } from '../system_interfaces/sacn';
import { getActivePatch, getOutput } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';
import { RenderingContext } from './RenderingContext';

export const SacnRendererContext = createContext({
  warnings: {} as { [outputId: string]: string },
});

export function SacnRendererProvider({ children }: PropsWithChildren) {
  const { project, update } = useContext(ProjectContext);
  const { renderFunction } = useContext(RenderingContext);
  const [warnings, setWarnings] = useState<{ [outputId: string]: string }>({});

  const startRenderLoop = (outputId: bigint) => {
    let cont = true;
    let frame = 0;
    (async () => {
      const sacnOutput = getActivePatch(project).outputs[outputId.toString()]
        .output.value as SacnDmxOutput;

      const latencySamples: number[] = [];

      while (cont) {
        const sacnWritableOutput = getDmxWritableOutput(project, outputId);
        const startMs = new Date().getTime();
        renderFunction.current(++frame, sacnWritableOutput);

        try {
          await outputDmxSacn(
            sacnOutput.universe,
            sacnOutput.ipAddress,
            sacnWritableOutput.uint8Array,
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
      }
    })();

    return () => (cont = false);
  };

  useEffect(() => {
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
