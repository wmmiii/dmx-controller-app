import React, { createRef, useContext, useEffect, useMemo, useRef, useState } from 'react';
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap.js";
import RegionsPlugin, { Region } from "wavesurfer.js/dist/plugins/regions.js";
import WaveSurfer from 'wavesurfer.js';
import { BEAT_MARKER, WAVEFORM_COLOR, WAVEFORM_CURSOR_COLOR, WAVEFORM_PROGRESS_COLOR, WAVEFORM_SAMPLE_RATE } from '../util/styleUtils';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { ShortcutContext } from '../contexts/ShortcutContext';

export interface AudioController {
  play: () => void;
  pause: () => void;
}

interface AudioTrackVisualizerProps {
  audioBlob: Blob;
  beatMetadata: BeatMetadata;
  setController: (controller: AudioController) => void;
  setPlaying: (playing: boolean) => void;
  onProgress: (t: number) => void;
  setVisible?: (startMs: number, endMs: number) => void;
  setTotalDuration?: (ms: number) => void;
  minPxPerSec: number;
  beatSubdivisions?: number;
  loop?: boolean;
  className?: string;
}

export function AudioTrackVisualizer({
  audioBlob,
  beatMetadata,
  setController,
  setPlaying,
  onProgress,
  setVisible,
  setTotalDuration,
  minPxPerSec,
  beatSubdivisions,
  loop,
  className,
}: AudioTrackVisualizerProps): JSX.Element {
  const { setShortcuts } = useContext(ShortcutContext);
  const containerRef = useRef<HTMLDivElement>();
  const [ws, setWs] = useState<WaveSurfer | null>(null);
  const [regions, setRegions] = useState<RegionsPlugin | null>(null);
  const visibleDuration = useRef<number>();

  useEffect(() => {
    if (containerRef.current != null && audioBlob != null) {
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

      ws.on('timeupdate', (seconds: number) => onProgress(seconds * 1000));
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));
      ws.on('decode', (seconds: number) => {
        const ms = seconds * 1000;
        setVisible(0, ms);
        if (setTotalDuration) {
          setTotalDuration(ms);
        }
      });

      setRegions(ws.registerPlugin(RegionsPlugin.create()));

      ws.loadBlob(audioBlob)
        .then(() => setWs(ws));

      return () => {
        setWs(null);
        ws.destroy();
      };
    }
  }, [containerRef.current, audioBlob, onProgress, setPlaying]);

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
      const callback = (startTime: number, endTime: number) => {
        visibleDuration.current = endTime - startTime;
        setVisible(startTime * 1000, endTime * 1000);
      }
      ws.on('scroll', callback);

      () => ws.un('scroll', callback);
    }
  }, [ws, setVisible]);

  // Add loop callback.
  useEffect(() => {
    if (ws && loop) {
      const callback = (t: number) => {
        if (ws.getDuration() - t < 0.14) {
          ws.setTime(0);
        }
      }
      ws.on('timeupdate', callback);

      () => ws.un('timeupdate', callback);
    }
  }, [ws, loop]);

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

      if (beatMetadata) {
        for (
          let t = Number(beatMetadata.offsetMs) / 1000;
          t < ws.getDuration();
          t += (beatMetadata.lengthMs / 1000)
        ) {
          regions.addRegion({
            start: t,
            color: BEAT_MARKER,
            drag: false,
          });
        }

        if (beatSubdivisions) {
          for (
            let t = Number(beatMetadata.offsetMs) / 1000;
            t < ws.getDuration();
            t += (beatMetadata.lengthMs / 1000 / beatSubdivisions)
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
  }, [ws, regions, beatMetadata, beatSubdivisions]);

  useEffect(() => {
    if (ws) {
      return setShortcuts([
        {
          shortcut: { key: 'Home' },
          action: () => {
            ws.seekTo(0);
          },
          description: 'Jump to start of track.',
        },
        {
          shortcut: { key: 'End' },
          action: () => {
            ws.seekTo(1);
          },
          description: 'Jump to end of track.',
        },
        {
          shortcut: { key: 'PageUp' },
          action: () => {
            const t = ws.getCurrentTime();
            ws.setTime(Math.max(
              t - (visibleDuration.current || 0) / 2,
              0));
          },
          description: 'Jump backwards in track.',
        },
        {
          shortcut: { key: 'PageDown' },
          action: () => {
            const t = ws.getCurrentTime();
            ws.setTime(Math.min(
              t + (visibleDuration.current || 0) / 2,
              ws.getDuration()));
          },
          description: 'Jump forwards in track',
        },
      ]);
    }
  }, [ws]);

  return (
    <div ref={containerRef} className={className}></div>
  );
}