import {
  createContext,
  createRef,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { toJsonString } from '@bufbuild/protobuf';
import { PatchSchema } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { renderWled } from '../engine/renderRouter';
import { outputLoopSupported } from '../system_interfaces/output_loop';
import { sendWled } from '../system_interfaces/wled';
import { getActivePatch, getOutput } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';

export const WledRendererContext = createContext({
  warnings: {} as { [outputId: string]: string },
});

export function WledRendererProvider({ children }: PropsWithChildren) {
  const { project, update } = useContext(ProjectContext);
  const [warnings, setWarnings] = useState<{ [outputId: string]: string }>({});

  const projectRef = createRef<Project>();

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const startRenderLoop = useCallback(
    (outputId: bigint) => {
      let cont = true;
      let frame = 0;
      (async () => {
        const latencySamples: number[] = [];

        while (cont) {
          const project = projectRef.current;
          if (!project) {
            return;
          }
          const wledOutput = getActivePatch(project).outputs[
            outputId.toString()
          ].output.value as WledOutput;

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
    },
    [projectRef],
  );

  useEffect(() => {
    const wledOutputs = Object.entries(getActivePatch(project).outputs).filter(
      ([_, output]) => output.output.case === 'wledOutput',
    );

    // On Tauri, output loops are automatically managed by the backend
    // when the project is updated, so we don't need to start/stop them here.
    if (outputLoopSupported) {
      return () => {};
    }

    // Web fallback: run the loop in JavaScript
    const renderLoops: Array<() => void> = [];
    wledOutputs.forEach(([id, _]) =>
      renderLoops.push(startRenderLoop(BigInt(id))),
    );

    return () => renderLoops.forEach((f) => f());
  }, [toJsonString(PatchSchema, getActivePatch(project))]);

  return (
    <WledRendererContext.Provider value={{ warnings }}>
      {children}
    </WledRendererContext.Provider>
  );
}
