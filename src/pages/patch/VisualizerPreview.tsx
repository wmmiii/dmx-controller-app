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
  persistent: boolean;
  onCompileError: (line: number, message: string) => void;
  onCompileSuccess: () => void;
}

interface UniformLocations {
  color: WebGLUniformLocation | null;
  timeMs: WebGLUniformLocation | null;
  audioBands: WebGLUniformLocation | null;
  beatT: WebGLUniformLocation | null;
  beatCount: WebGLUniformLocation | null;
  palettePrimary: WebGLUniformLocation | null;
  paletteSecondary: WebGLUniformLocation | null;
  paletteTertiary: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  previousTexture: WebGLUniformLocation | null;
  usePreviousTexture: WebGLUniformLocation | null;
}

function parseWebGLError(
  log: string,
): { line: number; message: string } | null {
  // Common formats: "ERROR: 0:42: ..." or "0:42(3): error ..."
  const m = log.match(/(?:ERROR:\s*\d+:(\d+)|(\d+):\d+\(\d+\))/);
  if (!m) {
    return null;
  }
  const wrappedLine = parseInt(m[1] ?? m[2], 10);
  return { line: toUserLine(wrappedLine), message: log.trim() };
}

function cacheUniformLocations(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
): UniformLocations {
  return {
    color: gl.getUniformLocation(prog, 'u_color'),
    timeMs: gl.getUniformLocation(prog, 'u_time_ms'),
    audioBands: gl.getUniformLocation(prog, 'u_audio_bands'),
    beatT: gl.getUniformLocation(prog, 'u_beat_t'),
    beatCount: gl.getUniformLocation(prog, 'u_beat_count'),
    palettePrimary: gl.getUniformLocation(prog, 'u_palette_primary'),
    paletteSecondary: gl.getUniformLocation(prog, 'u_palette_secondary'),
    paletteTertiary: gl.getUniformLocation(prog, 'u_palette_tertiary'),
    resolution: gl.getUniformLocation(prog, 'u_resolution'),
    previousTexture: gl.getUniformLocation(prog, 'u_previous_texture'),
    usePreviousTexture: gl.getUniformLocation(prog, 'u_use_previous_texture'),
  };
}

export function VisualizerPreview({
  glslSource,
  color,
  dimmer,
  palettePrimary,
  paletteSecondary,
  paletteTertiary,
  persistent,
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

  // Persistent mode: texture to store previous frame
  const previousTextureRef = useRef<WebGLTexture | null>(null);

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
    persistent,
  });
  propsRef.current = {
    color,
    dimmer,
    palettePrimary,
    paletteSecondary,
    paletteTertiary,
    persistent,
  };

  const onCompileErrorRef = useRef(onCompileError);
  const onCompileSuccessRef = useRef(onCompileSuccess);
  onCompileErrorRef.current = onCompileError;
  onCompileSuccessRef.current = onCompileSuccess;

  const compileFragShader = useCallback((source: string) => {
    const gl = glRef.current;
    const vs = vsRef.current;
    if (!gl || !vs) {
      return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) {
      onCompileErrorRef.current(
        0,
        'Failed to create fragment shader (WebGL context lost?)',
      );
      return;
    }

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
      onCompileErrorRef.current(
        0,
        'Failed to create shader program (WebGL context lost?)',
      );
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

    if (programRef.current) {
      gl.deleteProgram(programRef.current);
    }
    programRef.current = prog;
    uniformLocsRef.current = cacheUniformLocations(gl, prog);
    onCompileSuccessRef.current();
  }, []);

  // Initialize WebGL2 once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

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

    // Helper to ensure previous texture exists and matches canvas size
    const ensurePreviousTexture = (width: number, height: number) => {
      if (!previousTextureRef.current) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        previousTextureRef.current = tex;
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    };

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
        // Accumulate beat position, then split into count (integer) and phase (fractional)
        beatPhaseRef.current += (dt * MOCK_BPM) / 60_000;
        const beatT = beatPhaseRef.current % 1; // 0-1 fractional position
        const beatCount = Math.floor(beatPhaseRef.current); // Integer beat number

        const {
          color,
          dimmer,
          palettePrimary,
          paletteSecondary,
          paletteTertiary,
          persistent,
        } = propsRef.current;

        // Ensure previous texture exists for persistent mode
        if (persistent && w > 0 && h > 0) {
          ensurePreviousTexture(w, h);
        }

        currentGl.viewport(0, 0, canvas.width, canvas.height);
        currentGl.useProgram(prog);

        // Bind the previous frame texture if in persistent mode
        if (persistent && previousTextureRef.current) {
          currentGl.activeTexture(currentGl.TEXTURE0);
          currentGl.bindTexture(
            currentGl.TEXTURE_2D,
            previousTextureRef.current,
          );
          if (locs.previousTexture !== null) {
            currentGl.uniform1i(locs.previousTexture, 0);
          }
        }
        if (locs.usePreviousTexture !== null) {
          currentGl.uniform1i(locs.usePreviousTexture, persistent ? 1 : 0);
        }

        currentGl.uniform4f(
          locs.color,
          color.red,
          color.green,
          color.blue,
          dimmer,
        );
        currentGl.uniform1ui(locs.timeMs, Math.trunc(performance.now()));
        currentGl.uniform1fv(locs.audioBands, audioBandsRef.current);
        currentGl.uniform1f(locs.beatT, beatT);
        currentGl.uniform1ui(locs.beatCount, beatCount);
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

        // Render to canvas
        currentGl.drawArrays(currentGl.TRIANGLES, 0, 3);

        // If persistent mode, copy the canvas to the previous texture for next frame
        if (persistent && previousTextureRef.current) {
          currentGl.bindTexture(
            currentGl.TEXTURE_2D,
            previousTextureRef.current,
          );
          // Copy the canvas pixels to the texture
          currentGl.copyTexImage2D(
            currentGl.TEXTURE_2D,
            0,
            currentGl.RGBA,
            0,
            0,
            w,
            h,
            0,
          );
          currentGl.bindTexture(currentGl.TEXTURE_2D, null);
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      const currentGl = glRef.current;
      if (!currentGl) return;
      if (programRef.current) {
        currentGl.deleteProgram(programRef.current);
      }
      if (vsRef.current) {
        currentGl.deleteShader(vsRef.current);
      }
      if (previousTextureRef.current) {
        currentGl.deleteTexture(previousTextureRef.current);
      }
    };
  }, []);

  // Recompile (debounced) whenever glslSource changes.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => compileFragShader(glslSource), 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [glslSource, compileFragShader]);

  return <canvas ref={canvasRef} className={styles.previewCanvas} />;
}
