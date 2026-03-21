import { toBinary } from '@bufbuild/protobuf';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';
import { invoke } from '@tauri-apps/api/core';

// DEAD CODE
export async function sendWled(
  ipAddress: string,
  renderTarget: WledRenderTarget,
) {
  await invoke('output_wled', {
    ipAddress: ipAddress,
    wledRenderTargetBin: toBinary(WledRenderTargetSchema, renderTarget),
  });
}
