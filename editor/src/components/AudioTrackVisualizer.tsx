import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { ProjectContext } from '../contexts/ProjectContext';
import { WAVEFORM_COLOR, WAVEFORM_CURSOR_COLOR, WAVEFORM_PROGRESS_COLOR } from '../util/styleUtils';

export interface AudioController {
  play: () => void;
  pause: () => void;
}

interface AudioTrackVisualizerProps {
  fileId: number;
  setController: (controller: AudioController) => void;
  setPlaying: (playing: boolean) => void;
  onProgress: (t: number) => void;
  className?: string;
}

export function AudioTrackVisualizer({
  fileId,
  setController,
  setPlaying,
  onProgress,
  className,
}: AudioTrackVisualizerProps): JSX.Element {
  const { project } = useContext(ProjectContext);
  const containerRef = useRef<HTMLDivElement>();
  const [ws, setWs] = useState<WaveSurfer | null>(null);

  const fileBlob = useMemo(() => {
    const file = project?.assets?.audioFiles[fileId];
    if (!file) {
      return undefined;
    }
    return new Blob([file.contents], {
      type: file.mime,
    });
  }, [fileId, project]);

  useEffect(() => {
    if (containerRef.current != null && fileBlob != null) {
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: WAVEFORM_COLOR,
        cursorColor: WAVEFORM_CURSOR_COLOR,
        progressColor: WAVEFORM_PROGRESS_COLOR,
        sampleRate: 22050,
      });

      ws.on('audioprocess', (seconds: number) => onProgress(seconds * 1000));
      ws.on('seeking', (seconds: number) => onProgress(seconds * 1000));
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));

      ws.loadBlob(fileBlob);

      setWs(ws);

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
  }, [ws])

  useEffect(() => {
    setController(audioController);
  }, [audioController]);

  return (
    <div ref={containerRef} className={className}></div>
  );
}