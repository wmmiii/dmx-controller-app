import { MessageInitShape, create } from '@bufbuild/protobuf';
import { RenderModeSchema } from '@dmx-controller/proto/render_pb';
import { useEffect } from 'react';

import { setRenderMode } from '../system_interfaces/engine';

let modeLock = Promise.resolve();

export function useRenderMode(
  renderMode: MessageInitShape<typeof RenderModeSchema>,
  deps: unknown[],
) {
  // Apply the current render mode whenever it changes. No teardown here: a
  // dependency change should transition straight to the new mode, not flash
  // through blackout on the way.
  useEffect(() => {
    modeLock = modeLock.then(() =>
      setRenderMode(create(RenderModeSchema, renderMode)),
    );
  }, deps);

  // Blackout only when the owner unmounts, so nothing keeps rendering after the
  // page/component that set the mode is gone.
  useEffect(() => {
    return () => {
      modeLock = modeLock.then(() =>
        setRenderMode(
          create(RenderModeSchema, {
            mode: {
              case: 'blackout',
              value: {},
            },
          }),
        ),
      );
    };
  }, []);
}
