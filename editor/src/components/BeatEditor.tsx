import { AudioFile } from "@dmx-controller/proto/audio_pb";
import { Modal } from "./Modal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { Button } from "./Button";
import IconBxZoomIn from "../icons/IconBxZoomin";
import IconBxZoomOut from "../icons/IconBxZoomOut";
import IconBxPulse from "../icons/IconBxPulse";

import styles from './BeatEditor.module.scss';

interface BeatEditorProps {
  file: AudioFile;
  onCancel: () => void;
}

export function BeatEditor({ file, onCancel }: BeatEditorProps): JSX.Element {
  const waveRef = useRef<HTMLDivElement>();
  const [zoomLevel, setZoomLevel] = useState(128);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const [waveSurferRegions, setWaveSurferRegions] =
    useState<RegionsPlugin | null>(null);
  const [firstMarker, setFirstMarker] = useState<number>(1000);
  const [secondMarker, setSecondMarker] = useState<number>(2000);
  const [lastMarker, setLastMarker] = useState<number>(3000);
  const [beatsPerDuration, setBeatsPerDuration] = useState(1);
  const [t, setT] = useState(0);

  const segmentDuration = useMemo(() => {
    const totalDuration = lastMarker - firstMarker;
    const firstMarkerDuration = secondMarker - firstMarker;
    const actualNumSegments = totalDuration / firstMarkerDuration;

    const minSegmentDuration = totalDuration / Math.floor(actualNumSegments);
    const maxSegmentDuration = totalDuration / Math.ceil(actualNumSegments);

    if (Math.abs(minSegmentDuration - firstMarkerDuration) <
      Math.abs(maxSegmentDuration - firstMarkerDuration)) {
      return minSegmentDuration;
    } else {
      return maxSegmentDuration;
    }
  }, [firstMarker, secondMarker, lastMarker]);

  const calculatedFirstMarker = useMemo(
    () => firstMarker % segmentDuration,
    [firstMarker, segmentDuration]);

  const beatDuration = segmentDuration / beatsPerDuration;
  const firstBeat = firstMarker % beatDuration;

  const fileBlob = useMemo(
    () => {
      return new Blob([file.contents], {
        type: file.mime,
      });
    },
    [file]);

  useEffect(() => {
    if (waveRef.current != null && fileBlob != null) {
      const ws = WaveSurfer.create({
        container: waveRef.current,
        waveColor: 'rgb(200, 0, 200)',
        progressColor: 'rgb(100, 0, 100)',
        sampleRate: 22050,
      });

      ws.on('click', (seconds) => ws.seekTo(seconds));
      ws.on('audioprocess', (seconds: number) => setT(seconds * 1000));

      ws.registerPlugin(SpectrogramPlugin.create({
        height: 100,
      }));

      setWaveSurferRegions(ws.registerPlugin(RegionsPlugin.create()));

      ws.loadBlob(fileBlob)
        .then(() => setLastMarker((ws.getDuration() - 2) * 1000))
        .then(() => setWaveSurfer(ws));

      return () => {
        setWaveSurfer(null);
        ws.destroy();
      }
    }
  }, [waveRef.current, fileBlob]);

  // Set zoom level.
  useEffect(() => waveSurfer?.zoom(zoomLevel), [waveSurfer, zoomLevel]);

  // Draw markers.
  useEffect(() => {
    if (!!waveSurfer && !!waveSurferRegions) {
      waveSurferRegions.clearRegions();

      waveSurferRegions.addRegion({
        id: 'first-marker',
        start: firstMarker / 1000,
        content: 'First marker',
        color: '#FFFFFF',
      });

      waveSurferRegions.addRegion({
        id: 'second-marker',
        start: secondMarker / 1000,
        content: 'Second marker',
        color: '#FFFFFF',
      });

      waveSurferRegions.addRegion({
        id: 'last-marker',
        start: lastMarker / 1000,
        content: 'Last marker',
        color: 'rgba(255, 255, 255, 0.5)',
      });

      for (
        let t = calculatedFirstMarker / 1000;
        t < waveSurfer.getDuration();
        t += (segmentDuration / 1000)
      ) {
        waveSurferRegions.addRegion({
          start: t,
          color: 'rgba(255, 255, 255, 0.1)',
          drag: false,
        });
      }

      for (
        let t = firstBeat / 1000;
        t < waveSurfer.getDuration();
        t += (beatDuration / 1000)
      ) {
        waveSurferRegions.addRegion({
          start: t,
          color: 'rgba(255, 255, 255, 0.1)',
          drag: false,
        });
      }

      return waveSurferRegions.on('region-updated', (region) => {
        const markers = [firstMarker, secondMarker, lastMarker];
        switch (region.id) {
          case 'first-marker':
            markers[0] = Math.floor(region.start * 1000);
            break;
          case 'second-marker':
            markers[1] = Math.floor(region.start * 1000);
            break;
          case 'last-marker':
            markers[2] = Math.floor(region.start * 1000);
            break;
        }
        markers.sort((a, b) => a - b);
        setFirstMarker(markers[0]);
        setSecondMarker(markers[1]);
        setLastMarker(markers[2]);
      });
    }
  }, [waveSurfer, waveSurferRegions, firstMarker, secondMarker, lastMarker, beatsPerDuration]);

  const playPause = useCallback(() => {
    if (waveSurfer) {
      waveSurfer.playPause();
    }
  }, [waveSurfer]);

  const beat = ((t - firstBeat) % beatDuration) / beatDuration;

  return (
    <Modal
      title="Beat Editor"
      onClose={() => onCancel()}>
      <Button
        icon={<IconBxZoomIn />}
        onClick={() => setZoomLevel(zoomLevel * 2)}>
        Zoom In
      </Button>
      <Button
        icon={<IconBxZoomOut />}
        onClick={() => setZoomLevel(zoomLevel / 2)}>
        Zoom Out
      </Button>
      <div ref={waveRef}></div>
      <Button onClick={playPause}>Play/Pause</Button>
      Beats per segment:&nbsp;
      <input
        type="number"
        step="1"
        value={beatsPerDuration}
        onChange={(e) => setBeatsPerDuration(parseInt(e.target.value))} />
      {beatsPerDuration}
      <div className={styles.beat} style={{opacity: 1 - beat}}>
        <IconBxPulse />
      </div>
    </Modal>
  );
}