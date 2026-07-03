import type * as Monaco from 'monaco-editor';
import { Suspense, lazy, useEffect, useRef } from 'react';

const MonacoEditorInner = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
);

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  error?: {
    message: string;
    line: number;
  };
}

export function MonacoEditor({
  value,
  onChange,
  readOnly,
  error,
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) {
      return;
    }
    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }
    if (error) {
      monacoRef.current.editor.setModelMarkers(model, 'glsl', [
        {
          startLineNumber: error.line,
          startColumn: 1,
          endLineNumber: error.line,
          endColumn: 1000,
          message: error.message,
          severity: monacoRef.current.MarkerSeverity.Error,
        },
      ]);
    } else {
      monacoRef.current.editor.setModelMarkers(model, 'glsl', []);
    }
  }, [error]);

  return (
    <Suspense fallback={<div>Loading editor...</div>}>
      <MonacoEditorInner
        height="100%"
        language="c"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={{
          readOnly,
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          fontSize: 14,
          fontFamily: 'monospace',
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
        }}
      />
    </Suspense>
  );
}
