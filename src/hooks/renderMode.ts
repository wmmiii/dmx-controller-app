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
    let release: () => void;
    modeLock = new Promise((r) => (release = r));
    const next = modeLock.then(() =>
      setRenderMode(create(RenderModeSchema, renderMode)),
    );

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
