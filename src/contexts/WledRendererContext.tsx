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
import { WledOutput, WledRenderTarget } from '@dmx-controller/proto/wled_pb';
import {
  RenderError,
  triggerErrorSubscriptions,
  triggerWledSubscriptions,
} from '../engine/renderRouter';
import { renderWled } from '../system_interfaces/engine';
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
          let renderTarget: WledRenderTarget;

          try {
            renderTarget = await renderWled(outputId, BigInt(startMs), frame++);
            // Trigger render subscriptions for visualizers
            triggerWledSubscriptions(outputId, renderTarget);
            // Clear any previous render errors
            triggerErrorSubscriptions(outputId, null);
          } catch (e) {
            const error: RenderError = {
              outputId,
              message: e instanceof Error ? e.message : String(e),
            };
            triggerErrorSubscriptions(outputId, error);
            console.error('Could not render WLED:', e);
            continue;
          }

          try {
            await sendWled(wledOutput.ipAddress, renderTarget);
            latencySamples.push(new Date().getTime() - startMs);
            // Clear any previous output errors
            triggerErrorSubscriptions(outputId, null);
          } catch (e) {
            const output = getOutput(project, outputId);
            const errorMessage = `Could not connect to WLED device ${output.name}!`;
            const error: RenderError = {
              outputId,
              message: e instanceof Error ? e.message : String(e),
            };
            triggerErrorSubscriptions(outputId, error);
            console.error(e);
            setWarnings(
              Object.assign({}, warnings, {
                [outputId.toString()]: errorMessage,
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
