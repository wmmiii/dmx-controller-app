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

/**
 * A link whose result hasn't been read back yet. Reading link status forces the
 * driver to finish compiling synchronously, which stalls the main thread for as
 * long as the shader takes to compile. With KHR_parallel_shader_compile we can
 * poll for completion from the render loop instead and only read the status once
 * the driver reports it is ready.
 */
interface PendingLink {
  program: WebGLProgram;
  fragmentShader: WebGLShader;
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

function createPersistentTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function VisualizerPreview({
  glslSource,
  color,
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
  const parallelCompileRef = useRef<boolean>(false);
  const pendingLinkRef = useRef<PendingLink | null>(null);
  const animFrameRef = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compiledSourceRef = useRef<string | null>(null);
  const beatPhaseRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const audioBandsRef = useRef(new Float32Array(16));

  // Persistent mode ping-pong: the shader samples `read` while rendering into
  // `write`, then the two swap. Rendering straight into a texture we also
  // sample from is undefined, and copying the canvas back into a texture every
  // frame costs a full-framebuffer copy plus a driver sync.
  const fboRef = useRef<WebGLFramebuffer | null>(null);
  const pingPongRef = useRef<[WebGLTexture, WebGLTexture] | null>(null);
  const pingPongSizeRef = useRef<[number, number]>([0, 0]);
  const readIndexRef = useRef(0);

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
    palettePrimary,
    paletteSecondary,
    paletteTertiary,
    persistent,
  });
  propsRef.current = {
    color,
    palettePrimary,
    paletteSecondary,
    paletteTertiary,
    persistent,
  };

  const onCompileErrorRef = useRef(onCompileError);
  const onCompileSuccessRef = useRef(onCompileSuccess);
  onCompileErrorRef.current = onCompileError;
  onCompileSuccessRef.current = onCompileSuccess;

  const adoptLinkedProgram = useCallback((pending: PendingLink) => {
    const gl = glRef.current;
    if (!gl) {
      return;
    }
    const { program, fragmentShader } = pending;

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const log =
        gl.getShaderInfoLog(fragmentShader) ?? 'Unknown compile error';
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
      const parsed = parseWebGLError(log);
      onCompileErrorRef.current(parsed?.line ?? 1, parsed?.message ?? log);
      return;
    }

    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
      gl.deleteProgram(program);
      onCompileErrorRef.current(1, log);
      return;
    }

    if (programRef.current) {
      gl.deleteProgram(programRef.current);
    }
    programRef.current = program;
    uniformLocsRef.current = cacheUniformLocations(gl, program);
    onCompileSuccessRef.current();
  }, []);

  const compileFragShader = useCallback(
    (source: string) => {
      const gl = glRef.current;
      const vs = vsRef.current;
      if (!gl || !vs) {
        return;
      }
      compiledSourceRef.current = source;

      // Abandon an in-flight link; its result is already stale.
      if (pendingLinkRef.current) {
        gl.deleteShader(pendingLinkRef.current.fragmentShader);
        gl.deleteProgram(pendingLinkRef.current.program);
        pendingLinkRef.current = null;
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

      const pending: PendingLink = { program: prog, fragmentShader: fs };
      if (parallelCompileRef.current) {
        // Render loop polls COMPLETION_STATUS_KHR and adopts it when ready.
        pendingLinkRef.current = pending;
      } else {
        adoptLinkedProgram(pending);
      }
    },
    [adoptLinkedProgram],
  );

  // Initialize WebGL2 once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // The preview is an opaque full-viewport quad: multisampling, depth,
    // stencil and an alpha channel all cost bandwidth for no visible benefit.
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      onCompileErrorRef.current(0, 'WebGL2 is not supported.');
      return;
    }
    glRef.current = gl;

    const parallelCompileExt = gl.getExtension('KHR_parallel_shader_compile');
    parallelCompileRef.current = parallelCompileExt != null;
    const COMPLETION_STATUS_KHR = 0x91b1;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SRC);
    gl.compileShader(vs);
    vsRef.current = vs;

    const ensurePingPong = (width: number, height: number) => {
      const [currentW, currentH] = pingPongSizeRef.current;
      if (pingPongRef.current && currentW === width && currentH === height) {
        return;
      }
      if (pingPongRef.current) {
        gl.deleteTexture(pingPongRef.current[0]);
        gl.deleteTexture(pingPongRef.current[1]);
      }
      pingPongRef.current = [
        createPersistentTexture(gl, width, height),
        createPersistentTexture(gl, width, height),
      ];
      pingPongSizeRef.current = [width, height];
      readIndexRef.current = 0;
      if (!fboRef.current) {
        fboRef.current = gl.createFramebuffer();
      }
      // Start from black rather than whatever the freshly allocated storage
      // happens to contain.
      for (const tex of pingPongRef.current) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboRef.current);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          tex,
          0,
        );
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    compileFragShader(glslSource);

    const renderLoop = (time: number) => {
      const currentGl = glRef.current;

      const pending = pendingLinkRef.current;
      if (pending && parallelCompileExt) {
        if (
          currentGl?.getProgramParameter(pending.program, COMPLETION_STATUS_KHR)
        ) {
          pendingLinkRef.current = null;
          adoptLinkedProgram(pending);
        }
      }

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
          palettePrimary,
          paletteSecondary,
          paletteTertiary,
          persistent,
        } = propsRef.current;

        const usePingPong = persistent && w > 0 && h > 0;
        if (usePingPong) {
          ensurePingPong(w, h);
        }
        const pingPong = usePingPong ? pingPongRef.current : null;

        // Must precede any uniform call — uniforms apply to the current program.
        currentGl.useProgram(prog);

        if (pingPong && fboRef.current) {
          const writeIndex = 1 - readIndexRef.current;
          currentGl.bindFramebuffer(currentGl.FRAMEBUFFER, fboRef.current);
          currentGl.framebufferTexture2D(
            currentGl.FRAMEBUFFER,
            currentGl.COLOR_ATTACHMENT0,
            currentGl.TEXTURE_2D,
            pingPong[writeIndex],
            0,
          );
          currentGl.activeTexture(currentGl.TEXTURE0);
          currentGl.bindTexture(
            currentGl.TEXTURE_2D,
            pingPong[readIndexRef.current],
          );
          if (locs.previousTexture !== null) {
            currentGl.uniform1i(locs.previousTexture, 0);
          }
        } else {
          currentGl.bindFramebuffer(currentGl.FRAMEBUFFER, null);
        }

        currentGl.viewport(0, 0, canvas.width, canvas.height);

        if (locs.usePreviousTexture !== null) {
          currentGl.uniform1i(locs.usePreviousTexture, pingPong ? 1 : 0);
        }

        currentGl.uniform3f(locs.color, color.red, color.green, color.blue);
        currentGl.uniform1ui(locs.timeMs, Math.trunc(performance.now()));
        currentGl.uniform1fv(locs.audioBands, audioBandsRef.current);
        currentGl.uniform1f(locs.beatT, beatT);
        currentGl.uniform1ui(locs.beatCount, beatCount);
        currentGl.uniform3f(
          locs.palettePrimary,
          palettePrimary.red,
          palettePrimary.green,
          palettePrimary.blue,
        );
        currentGl.uniform3f(
          locs.paletteSecondary,
          paletteSecondary.red,
          paletteSecondary.green,
          paletteSecondary.blue,
        );
        currentGl.uniform3f(
          locs.paletteTertiary,
          paletteTertiary.red,
          paletteTertiary.green,
          paletteTertiary.blue,
        );
        currentGl.uniform2f(locs.resolution, canvas.width, canvas.height);

        currentGl.drawArrays(currentGl.TRIANGLES, 0, 3);

        if (pingPong) {
          // Present the freshly rendered texture, then it becomes next frame's
          // `prev`. blitFramebuffer keeps this on the GPU — no readback, no
          // texture reallocation.
          currentGl.bindFramebuffer(currentGl.DRAW_FRAMEBUFFER, null);
          currentGl.blitFramebuffer(
            0,
            0,
            w,
            h,
            0,
            0,
            w,
            h,
            currentGl.COLOR_BUFFER_BIT,
            currentGl.NEAREST,
          );
          currentGl.bindFramebuffer(currentGl.FRAMEBUFFER, null);
          readIndexRef.current = 1 - readIndexRef.current;
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      const currentGl = glRef.current;
      if (!currentGl) {
        return;
      }
      if (pendingLinkRef.current) {
        currentGl.deleteShader(pendingLinkRef.current.fragmentShader);
        currentGl.deleteProgram(pendingLinkRef.current.program);
        pendingLinkRef.current = null;
      }
      if (programRef.current) {
        currentGl.deleteProgram(programRef.current);
      }
      if (vsRef.current) {
        currentGl.deleteShader(vsRef.current);
      }
      if (pingPongRef.current) {
        currentGl.deleteTexture(pingPongRef.current[0]);
        currentGl.deleteTexture(pingPongRef.current[1]);
        pingPongRef.current = null;
      }
      if (fboRef.current) {
        currentGl.deleteFramebuffer(fboRef.current);
        fboRef.current = null;
      }
    };
  }, []);

  // Recompile (debounced) whenever glslSource changes.
  useEffect(() => {
    if (glslSource === compiledSourceRef.current) {
      return;
    }
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
