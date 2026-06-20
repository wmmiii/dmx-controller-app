import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export function ShaderSpikeTest() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await invoke<string>('test_shader_spike');
      setResult(response);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>wgpu iOS Compatibility Test</h2>
      <button onClick={runTest} disabled={loading}>
        {loading ? 'Testing...' : 'Run wgpu Test'}
      </button>
      {result && (
        <pre
          style={{ color: 'green', marginTop: '10px', whiteSpace: 'pre-wrap' }}
        >
          {result}
        </pre>
      )}
      {error && (
        <pre style={{ color: 'red', marginTop: '10px', whiteSpace: 'pre-wrap' }}>
          ERROR: {error}
        </pre>
      )}
    </div>
  );
}
