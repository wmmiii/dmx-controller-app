import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import {
  VERTEX_SHADER_SRC,
  parseWebGLError,
  wrapShaderWebGL2,
} from '../pages/patch/wrapShaderWebGL2';

interface CompileVisualizerRequest {
  id: number;
  glsl_source: string;
}

type CompileResponse =
  | { success: true }
  | { success: false; error_line?: number; error_message: string };

initVisualizerBridge();

async function initVisualizerBridge(): Promise<void> {
  await listen<CompileVisualizerRequest>(
    'compile-visualizer',
    async (event) => {
      const { id, glsl_source } = event.payload;
      let response: CompileResponse;
      try {
        response = compileVisualizer(glsl_source);
      } catch (err) {
        response = { success: false, error_message: String(err) };
      }
      await invoke('mcp_frontend_response', { id, response });
    },
  ).catch((err) => {
    console.error('Failed to register visualizer bridge:', err);
  });
}

function compileVisualizer(glslSource: string): CompileResponse {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return {
      success: false,
      error_message: 'WebGL2 is not available in this webview.',
    };
  }

  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    return {
      success: false,
      error_message: 'Failed to allocate WebGL objects.',
    };
  }

  gl.shaderSource(vs, VERTEX_SHADER_SRC);
  gl.compileShader(vs);

  gl.shaderSource(fs, wrapShaderWebGL2(glslSource));
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(fs) ?? 'Unknown compile error';
    const parsed = parseWebGLError(log);
    return {
      success: false,
      error_line: parsed?.line ?? 1,
      error_message: parsed?.message ?? log,
    };
  }

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    return {
      success: false,
      error_message: gl.getProgramInfoLog(prog) ?? 'Unknown link error',
    };
  }

  return { success: true };
}
