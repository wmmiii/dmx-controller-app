import { useContext, useEffect } from 'react';

import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { getWledWritableOutput } from '../engine/outputs/wledOutput';
import { getActivePatch } from '../util/projectUtils';
import { ProjectContext } from './ProjectContext';
import { RenderingContext } from './RenderingContext';

export function WledRenderer() {
  const { renderFunction } = useContext(RenderingContext);
  const { project } = useContext(ProjectContext);

  const startRenderLoop = (outputId: bigint) => {
    let cont = true;
    let frame = 0;
    (async () => {
      const wledOutput = getActivePatch(project).outputs[outputId.toString()]
        .output.value as WledOutput;

      let lastUpdate;

      while (cont) {
        const wledWritableOutput = getWledWritableOutput(project, outputId);
        renderFunction.current(++frame, wledWritableOutput);

        const wledUpdate = {
          transition: 0,
          seg: wledWritableOutput.segments.map((s, i) => ({
            id: i,
            col: [
              [
                Math.floor(s.primaryColor.red * 255),
                Math.floor(s.primaryColor.green * 255),
                Math.floor(s.primaryColor.blue * 255),
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
          if (!response.ok) {
            console.error(await response.text());
          }
        } catch (e) {
          console.error(e);
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

  return <></>;
}
