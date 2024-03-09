import React, { useContext, useEffect, useMemo, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import Spectrogram from 'wavesurfer.js/dist/plugins/spectrogram.js';
import { ProjectContext } from '../contexts/ProjectContext';
import { WAVEFORM_COLOR, WAVEFORM_CURSOR_COLOR, WAVEFORM_PROGRESS_COLOR } from '../util/styleUtils';

interface TrackVisualizerProps {
  fileId: number;
  onProgress: (t: number) => void;
  className?: string;
}

export function TrackVisualizer({ fileId, onProgress, className }: TrackVisualizerProps):
  JSX.Element {
    const {project} = useContext(ProjectContext);
    const containerRef = useRef<HTMLDivElement>();

    const fileBlob = useMemo(() => {
      const file = project?.assets?.audioFiles[fileId];
      if (!file) {
        return undefined;
      }
      console.log(file);
      return new Blob([file.contents], {
        type: file.mime,
      });
    },
    [fileId, project]);

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
        ws.on('click', () => ws.play());

        ws.registerPlugin(Spectrogram.create({
          height: 100,
        }));

        ws.loadBlob(fileBlob);

        return () => ws.destroy();
      }
    }, [containerRef.current, fileBlob, onProgress]);
  return (
    <div ref={containerRef} className={className}></div>
  );
}