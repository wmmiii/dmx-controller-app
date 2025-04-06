import Crunker from "crunker";

const audioSegments = new Crunker().fetchAudio(
  "/static/tick.mp3",
  "/static/tock.mp3",
);

const blobCache: { [key: string]: Blob } = {};

export async function getAudioBlob(
  beats: number,
  subdivisions: number,
): Promise<Blob> {
  const key = `${beats}x${subdivisions}`;
  if (blobCache[key]) {
    return blobCache[key];
  }

  const crunker = new Crunker();
  const [tickBuffer, tockBuffer] = await audioSegments;

  const segments = [];
  for (let b = 0; b < beats; ++b) {
    segments.push(tickBuffer);
    for (let s = 1; s < subdivisions; ++s) {
      segments.push(tockBuffer);
    }
  }

  const concatenated = await crunker.concatAudio(segments);
  const exported = await crunker.export(concatenated, "audio/mpeg");

  blobCache[key] = exported.blob;
  return exported.blob;
}
