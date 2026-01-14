import { create, toJsonString } from '@bufbuild/protobuf';
import { RenderMode, RenderModeSchema } from '@dmx-controller/proto/render_pb';
import { useEffect } from 'react';
import { setRenderMode } from '../system_interfaces/engine';

export function useRenderMode(renderMode: RenderMode) {
  useEffect(() => {
    setRenderMode(renderMode);

    return () => {
      setRenderMode(
        create(RenderModeSchema, {
          mode: {
            case: 'blackout',
            value: {},
          },
        }),
      );
    };
  }, [toJsonString(RenderModeSchema, renderMode)]);
}
