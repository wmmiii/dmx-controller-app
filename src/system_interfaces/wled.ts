import { toBinary } from '@bufbuild/protobuf';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const sendWled = isTauri ? tauriSendWled : webSendWled;

async function tauriSendWled(
  ipAddress: string,
  renderTarget: WledRenderTarget,
) {
  await invoke('output_wled', {
    ipAddress: ipAddress,
    wledRenderTargetBin: toBinary(WledRenderTargetSchema, renderTarget),
  });
}

async function webSendWled(ipAddress: string, renderTarget: WledRenderTarget) {
  const wledUpdate = {
    transition: 0,
    seg: renderTarget.segments.map((s, i) => {
      return {
        id: i,
        col: [
          [
            Math.min(Math.floor(s.primaryColor!.red * 255), 255),
            Math.min(Math.floor(s.primaryColor!.green * 255), 255),
            Math.min(Math.floor(s.primaryColor!.blue * 255), 255),
          ],
        ],
        fx: s.effect,
        sx: Math.floor(s.speed * 255),
        pal: s.palette,
        bri: Math.floor(s.brightness * 255),
      };
    }),
  };

  await fetch(`http://${ipAddress}/json/state`, {
    method: 'POST',
    body: JSON.stringify(wledUpdate),
  });
}
