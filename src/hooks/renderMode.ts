import { create, MessageInitShape } from '@bufbuild/protobuf';
import { RenderModeSchema } from '@dmx-controller/proto/render_pb';
import { useEffect } from 'react';
import { setRenderMode } from '../system_interfaces/engine';

let modeLock = Promise.resolve();

export function useRenderMode(
  renderMode: MessageInitShape<typeof RenderModeSchema>,
  deps: unknown[],
) {
  useEffect(() => {
    // IMPORTANT: Must wait on current modeLock BEFORE replacing it
    // Otherwise the render mode will never be set (waits on pending promise forever)
    const next = modeLock.then(() =>
      setRenderMode(create(RenderModeSchema, renderMode)),
    );
    let release: () => void;
    modeLock = new Promise((r) => (release = r));

    return () => {
      next
        .then(() =>
          setRenderMode(
            create(RenderModeSchema, {
              mode: {
                case: 'blackout',
                value: {},
              },
            }),
          ),
        )
        .then(release);
    };
  }, deps);
}
