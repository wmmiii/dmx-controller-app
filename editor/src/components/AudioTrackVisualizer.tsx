import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import WaveSurfer from 'wavesurfer.js';
import { BEAT_MARKER, WAVEFORM_COLOR, WAVEFORM_CURSOR_COLOR, WAVEFORM_PROGRESS_COLOR, WAVEFORM_SAMPLE_RATE } from '../util/styleUtils';
import { ProjectContext } from '../contexts/ProjectContext';

export interface AudioController {
  play: () => void;
  pause: () => void;
}

interface AudioTrackVisualizerProps {
  fileId: number;
  setController: (controller: AudioController) => void;
  setPlaying: (playing: boolean) => void;
  onProgress: (t: number) => void;
  setVisible?: (startMs: number, endMs: number) => void;
  minPxPerSec: number;
  beatSubdivisions?: number;
  className?: string;
}

export function AudioTrackVisualizer({
  fileId,
  setController,
  setPlaying,
  onProgress,
  setVisible,
  minPxPerSec,
  beatSubdivisions,
  className,
}: AudioTrackVisualizerProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const containerRef = useRef<HTMLDivElement>();
  const [ws, setWs] = useState<WaveSurfer | null>(null);
  const [regions, setRegions] = useState<RegionsPlugin | null>(null);

  const audioFile = useMemo(
    () => project?.assets?.audioFiles[fileId],
    [fileId, project]);

  const fileBlob = useMemo(() => {
    if (!audioFile) {
      return undefined;
    }
    return new Blob([audioFile.contents], {
      type: audioFile.mime,
    });
  }, [audioFile]);

  useEffect(() => {
    if (containerRef.current != null && fileBlob != null) {
      const ws = WaveSurfer.create({
        container: containerRef.current,
        cursorColor: WAVEFORM_CURSOR_COLOR,
        hideScrollbar: true,
        progressColor: WAVEFORM_PROGRESS_COLOR,
        sampleRate: WAVEFORM_SAMPLE_RATE,
        waveColor: WAVEFORM_COLOR,

        plugins: [
          MinimapPlugin.create({
            height: 20,
            waveColor: WAVEFORM_COLOR,
            progressColor: WAVEFORM_PROGRESS_COLOR,
          }),
        ],
      });

      ws.on('audioprocess', (seconds: number) => onProgress(seconds * 1000));
      ws.on('seeking', (seconds: number) => onProgress(seconds * 1000));
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));

      setRegions(ws.registerPlugin(RegionsPlugin.create()));

      ws.loadBlob(fileBlob)
        .then(() => setVisible(0, ws.getDuration()))
        .then(() => setWs(ws));

      return () => {
        setWs(null);
        ws.destroy();
      };
    }
  }, [containerRef.current, fileBlob, onProgress, setPlaying]);

  const audioController: AudioController = useMemo(() => {
    if (ws) {
      return {
        play: () => ws.play(),
        pause: () => ws.pause(),
      };
    } else {
      return {
        play: () => { },
        pause: () => { },
      };
    }
  }, [ws]);

  // Add visibility callback.
  useEffect(() => {
    if (ws && setVisible) {
      const callback = (startTime: number, endTime: number) =>
        setVisible(startTime * 1000, endTime * 1000);
      ws.on('scroll', callback);

      () => ws.un('scroll', callback);
    }
  }, [ws, setVisible]);

  // Set zoom level.
  useEffect(() => {
    if (ws) {
      ws.zoom(minPxPerSec);
    }
  }, [ws, minPxPerSec]);

  // Set external controller.
  useEffect(() => {
    setController(audioController);
  }, [audioController]);

  // Draw markers.
  useEffect(() => {
    if (ws && regions) {
      regions.clearRegions();

      const beatData = audioFile?.beatMetadata;
      if (beatData) {
        for (
          let t = beatData.offsetMs / 1000;
          t < ws.getDuration();
          t += (beatData.lengthMs / 1000)
        ) {
          regions.addRegion({
            start: t,
            color: BEAT_MARKER,
            drag: false,
          });
        }

        if (beatSubdivisions) {
          for (
            let t = beatData.offsetMs / 1000;
            t < ws.getDuration();
            t += (beatData.lengthMs / 1000 / beatSubdivisions)
          ) {
            regions.addRegion({
              start: t,
              color: BEAT_MARKER,
              drag: false,
            });
          }
        }
      }
    }
  }, [ws, regions, audioFile?.beatMetadata, beatSubdivisions]);

  return (
    <div ref={containerRef} className={className}></div>
  );
}