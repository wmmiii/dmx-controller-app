import { type Color } from '@dmx-controller/proto/color_pb';
import { useCallback, useEffect, useRef } from 'react';
import { addAudioAnalysisListener } from '../../system_interfaces/audio_input';
import styles from './VisualizerEditor.module.css';
import {
  VERTEX_SHADER_SRC,
  toUserLine,
  wrapShaderWebGL2,
} from './wrapShaderWebGL2';

const MOCK_BPM = 120;

export interface VisualizerPreviewProps {
  glslSource: string;
  color: Color;
  dimmer: number;
  palettePrimary: Color;
  paletteSecondary: Color;
  paletteTertiary: Color;
  onCompileError: (line: number, message: string) => void;
  onCompileSuccess: () => void;
}

interface UniformLocations {
  color: WebGLUniformLocation | null;
  audioBands: WebGLUniformLocation | null;
  beatT: WebGLUniformLocation | null;
  palettePrimary: WebGLUniformLocation | null;
  paletteSecondary: WebGLUniformLocation | null;
  paletteTertiary: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
}

function parseWebGLError(
  log: string,
): { line: number; message: string } | null {
  // Common formats: "ERROR: 0:42: ..." or "0:42(3): error ..."
  const m = log.match(/(?:ERROR:\s*\d+:(\d+)|(\d+):\d+\(\d+\))/);
  if (!m) {return null};
  const wrappedLine = parseInt(m[1] ?? m[2], 10);
  return { line: toUserLine(wrappedLine), message: log.trim() };
}

function cacheUniformLocations(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
): UniformLocations {
  return {
    color: gl.getUniformLocation(prog, 'u_color'),
    audioBands: gl.getUniformLocation(prog, 'u_audio_bands'),
    beatT: gl.getUniformLocation(prog, 'u_beat_t'),
    palettePrimary: gl.getUniformLocation(prog, 'u_palette_primary'),
    paletteSecondary: gl.getUniformLocation(prog, 'u_palette_secondary'),
    paletteTertiary: gl.getUniformLocation(prog, 'u_palette_tertiary'),
    resolution: gl.getUniformLocation(prog, 'u_resolution'),
    time: gl.getUniformLocation(prog, 'u_time'),
  };
}

export function VisualizerPreview({
  glslSource,
  color,
  dimmer,
  palettePrimary,
  paletteSecondary,
  paletteTertiary,
  onCompileError,
  onCompileSuccess,
}: VisualizerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const vsRef = useRef<WebGLShader | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformLocsRef = useRef<UniformLocations | null>(null);
  const animFrameRef = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatPhaseRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const audioBandsRef = useRef(new Float32Array(16));

  useEffect(() => {
    return addAudioAnalysisListener((analysis) => {
      for (let i = 0; i < 16; i++) {
        audioBandsRef.current[i] = analysis.bands[i] ?? 0;
      }
    });
  }, []);

  // Keep all props current in a ref so the render loop never has stale values.
  const propsRef = useRef({
    color,
    dimmer,
    palettePrimary,
    paletteSecondary,
    paletteTertiary,
  });
  propsRef.current = {
    color,
    dimmer,
    palettePrimary,
    paletteSecondary,
    paletteTertiary,
  };

  const onCompileErrorRef = useRef(onCompileError);
  const onCompileSuccessRef = useRef(onCompileSuccess);
  onCompileErrorRef.current = onCompileError;
  onCompileSuccessRef.current = onCompileSuccess;

  const compileFragShader = useCallback((source: string) => {
    const gl = glRef.current;
    const vs = vsRef.current;
    if (!gl || !vs) {return;}

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) {return;}

    gl.shaderSource(fs, wrapShaderWebGL2(source));
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) ?? 'Unknown compile error';
      gl.deleteShader(fs);
      const parsed = parseWebGLError(log);
      onCompileErrorRef.current(parsed?.line ?? 1, parsed?.message ?? log);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      gl.deleteShader(fs);
      return;
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? 'Unknown link error';
      gl.deleteProgram(prog);
      onCompileErrorRef.current(1, log);
      return;
    }

    if (programRef.current) {gl.deleteProgram(programRef.current);}
    programRef.current = prog;
    uniformLocsRef.current = cacheUniformLocations(gl, prog);
    onCompileSuccessRef.current();
  }, []);

  // Initialize WebGL2 once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {return;}

    const gl = canvas.getContext('webgl2');
    if (!gl) {
      onCompileErrorRef.current(0, 'WebGL2 is not supported.');
      return;
    }
    glRef.current = gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SRC);
    gl.compileShader(vs);
    vsRef.current = vs;

    compileFragShader(glslSource);

    const renderLoop = (time: number) => {
      const currentGl = glRef.current;
      const prog = programRef.current;
      const locs = uniformLocsRef.current;

      if (currentGl && prog && locs) {
        // Sync canvas resolution to CSS size.
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const dt = lastTimeRef.current != null ? time - lastTimeRef.current : 0;
        lastTimeRef.current = time;
        beatPhaseRef.current =
          (beatPhaseRef.current + (dt * MOCK_BPM) / 60_000) % 1;

        const {
          color,
          dimmer,
          palettePrimary,
          paletteSecondary,
          paletteTertiary,
        } = propsRef.current;

        currentGl.viewport(0, 0, canvas.width, canvas.height);
        currentGl.useProgram(prog);

        currentGl.uniform4f(
          locs.color,
          color.red,
          color.green,
          color.blue,
          dimmer,
        );
        currentGl.uniform1fv(locs.audioBands, audioBandsRef.current);
        currentGl.uniform1f(locs.beatT, beatPhaseRef.current);
        currentGl.uniform4f(
          locs.palettePrimary,
          palettePrimary.red,
          palettePrimary.green,
          palettePrimary.blue,
          1.0,
        );
        currentGl.uniform4f(
          locs.paletteSecondary,
          paletteSecondary.red,
          paletteSecondary.green,
          paletteSecondary.blue,
          1.0,
        );
        currentGl.uniform4f(
          locs.paletteTertiary,
          paletteTertiary.red,
          paletteTertiary.green,
          paletteTertiary.blue,
          1.0,
        );
        currentGl.uniform2f(locs.resolution, canvas.width, canvas.height);
        currentGl.uniform1f(locs.time, performance.now() % 86_400_000);

        currentGl.drawArrays(currentGl.TRIANGLES, 0, 3);
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (programRef.current) {gl.deleteProgram(programRef.current);}
      if (vsRef.current) {gl.deleteShader(vsRef.current);}
    };
  }, []);

  // Recompile (debounced) whenever glslSource changes.
  useEffect(() => {
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    debounceRef.current = setTimeout(() => compileFragShader(glslSource), 300);
    return () => {
      if (debounceRef.current) {clearTimeout(debounceRef.current);}
    };
  }, [glslSource, compileFragShader]);

  return <canvas ref={canvasRef} className={styles.previewCanvas} />;
}
