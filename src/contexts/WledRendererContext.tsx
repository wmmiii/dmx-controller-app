import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { getWledWritableOutput } from '../engine/outputs/wledOutput';
import { getActivePatch, getOutput } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';
import { RenderingContext } from './RenderingContext';

export const WledRendererContext = createContext({
  warnings: {} as { [outputId: string]: string },
});

export function WledRendererProvider({ children }: PropsWithChildren) {
  const { project, update } = useContext(ProjectContext);
  const { renderFunction } = useContext(RenderingContext);
  const [warnings, setWarnings] = useState<{ [outputId: string]: string }>({});

  const startRenderLoop = (outputId: bigint) => {
    let cont = true;
    let frame = 0;
    (async () => {
      const wledOutput = getActivePatch(project).outputs[outputId.toString()]
        .output.value as WledOutput;

      let lastUpdate;

      const latencySamples: number[] = [];

      while (cont) {
        const wledWritableOutput = getWledWritableOutput(project, outputId);
        const startMs = new Date().getTime();
        renderFunction.current(++frame, wledWritableOutput);

        const wledUpdate = {
          transition: 0,
          seg: wledWritableOutput.segments.map((s, i) => ({
            id: i,
            col: [
              [
                Math.min(Math.floor(s.primaryColor.red * 255), 255),
                Math.min(Math.floor(s.primaryColor.green * 255), 255),
                Math.min(Math.floor(s.primaryColor.blue * 255), 255),
              ],
            ],
            fx: s.effect,
            sx: Math.floor(s.speed * 255),
            pal: s.palette,
            bri: Math.floor(s.brightness * 255),
          })),
        };

        if (JSON.stringify(lastUpdate) === JSON.stringify(wledUpdate)) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          continue;
        }

        lastUpdate = wledUpdate;

        try {
          const response = await fetch(
            `http://${wledOutput.ipAddress}/json/state`,
            {
              method: 'POST',
              body: JSON.stringify(wledUpdate),
            },
          );
          latencySamples.push(new Date().getTime() - startMs);
          if (!response.ok) {
            console.error(await response.text());
            const output = getOutput(project, outputId);
            setWarnings(
              Object.assign({}, warnings, {
                [outputId.toString()]: `Error response from WLED device ${output.name}!`,
              }),
            );
          } else {
            setWarnings((warnings) => {
              delete warnings[outputId.toString()];
              return Object.assign({}, warnings);
            });
          }
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
