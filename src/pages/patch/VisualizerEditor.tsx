import { create } from '@bufbuild/protobuf';
import {
  Visualizer,
  VisualizerCompilationResult,
  VisualizerSchema,
} from '@dmx-controller/proto/visualizer_pb';
import clsx from 'clsx';
import { useContext, useEffect, useState } from 'react';
import { BiCopy, BiTrash } from 'react-icons/bi';
import { Button } from '../../components/Button';
import { MonacoEditor } from '../../components/MonacoEditor';
import { ProjectContext } from '../../contexts/ProjectContext';
import {
  compileVisualizer,
  getBuiltinVisualizers,
} from '../../system_interfaces/shader';
import { randomUint64 } from '../../util/numberUtils';
import styles from './VisualizerEditor.module.css';

const DEFAULT_GLSL = `// Available uniforms:
//   vec4  u_color             — display color RGB + dimmer
//   float u_audio_bands[16]   — frequency bands, 0.0-1.0 (low to high)
//   float u_beat_t            — beat phase, 0.0-1.0
//   vec4  u_palette_primary   — palette color 1
//   vec4  u_palette_secondary — palette color 2
//   vec4  u_palette_tertiary  — palette color 3
//   vec2  u_resolution        — display size in pixels
//   float u_time              — wall-clock milliseconds (wraps daily)
//
// Parameters:
//   vec2 uv          — normalized coords (0,0) top-left to (1,1) bottom-right
//   vec2 frag_coord  — raw pixel coords
//   vec4 prev_pixel  — output of the previous shader in a sequence (or black)

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    return vec4(u_palette_primary.rgb, 1.0);
}
`;

export function VisualizerEditor() {
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [builtins, setBuiltins] = useState<{ [id: string]: Visualizer }>({});

  useEffect(() => {
    getBuiltinVisualizers()
      .then(setBuiltins)
      .catch((e) => console.error('Failed to load builtin visualizers:', e));
  }, []);

  return (
    <div className={styles.visualizerContents}>
      <VisualizerList
        builtins={builtins}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <VisualizerEditorPane
        key={selectedId?.toString() ?? 'none'}
        builtins={builtins}
        selectedId={selectedId}
        setSelected={setSelectedId}
        onDeleted={() => setSelectedId(null)}
      />
    </div>
  );
}

interface VisualizerListProps {
  builtins: { [id: string]: Visualizer };
  selectedId: bigint | null;
  onSelect: (id: bigint) => void;
}

function VisualizerList({
  builtins,
  selectedId,
  onSelect,
}: VisualizerListProps) {
  const { project, save } = useContext(ProjectContext);

  const userEntries = Object.entries(project.visualizers);
  const builtinEntries = Object.entries(builtins);

  const createNew = () => {
    const id = randomUint64();
    project.visualizers[id.toString()] = create(VisualizerSchema, {
      name: 'New Visualizer',
      glslSource: DEFAULT_GLSL,
    });
    save('Create new visualizer.');
    onSelect(id);
  };

  return (
    <div className={styles.visualizerList}>
      <Button onClick={createNew}>+ Add Visualizer</Button>
      {userEntries.length > 0 && (
        <>
          <h3>My Visualizers</h3>
          <ul>
            {userEntries.map(([id, v]) => (
              <li
                key={id}
                className={clsx({
                  [styles.selected]: BigInt(id) === selectedId,
                })}
                onClick={() => onSelect(BigInt(id))}
              >
                {v.name}
              </li>
            ))}
          </ul>
        </>
      )}
      {builtinEntries.length > 0 && (
        <>
          <h3>Built-in</h3>
          <ul>
            {builtinEntries.map(([id, v]) => (
              <li
                key={id}
                className={clsx({
                  [styles.selected]: BigInt(id) === selectedId,
                })}
                onClick={() => onSelect(BigInt(id))}
              >
                {v.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface VisualizerEditorPaneProps {
  selectedId: bigint | null;
  setSelected: (id: bigint) => void;
  builtins: { [id: string]: Visualizer };
  onDeleted: () => void;
}

function VisualizerEditorPane({
  selectedId,
  setSelected,
  builtins,
  onDeleted,
}: VisualizerEditorPaneProps) {
  const { project, save } = useContext(ProjectContext);

  const visualizer =
    builtins[String(selectedId)] ?? project.visualizers[String(selectedId)];
  const isBuiltin = builtins[String(selectedId)] != null;

  const [editSource, setEditSource] = useState(visualizer?.glslSource ?? '');
  const [compileResult, setCompileResult] =
    useState<VisualizerCompilationResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  if (selectedId == null || visualizer == null) {
    return <div className={styles.emptyPane}>Select a visualizer to edit.</div>;
  }

  const handleCopy = () => {
    const newId = randomUint64();
    project.visualizers[newId.toString()] = create(VisualizerSchema, {
      name: `Copy of ${visualizer.name}`,
      glslSource: visualizer.glslSource,
    });
    save(`Copy visualizer "${visualizer.name}".`);
    setSelected(newId);
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete visualizer "${visualizer.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    delete project.visualizers[selectedId.toString()];
    save(`Delete visualizer "${visualizer.name}".`);
    onDeleted();
  };

  const handleCompileSave = async () => {
    if (isBuiltin || visualizer == null) {
      return;
    }
    setIsCompiling(true);
    setCompileResult(null);
    try {
      console.log('compiling');
      const result = await compileVisualizer(selectedId, editSource);
      console.log('result', result);
      setCompileResult(result);
      if (result.success) {
        visualizer.glslSource = editSource;
        save(`Update visualizer "${visualizer.name}".`);
      }
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className={styles.visualizerEditor}>
      <div className={styles.editorHeader}>
        {!isBuiltin && (
          <Button variant="warning" icon={<BiTrash />} onClick={handleDelete}>
            Delete
          </Button>
        )}
        <div className={styles.editorHeaderSpacer} />
        <Button icon={<BiCopy />} onClick={handleCopy}>
          {isBuiltin ? 'Copy to Edit' : 'Duplicate'}
        </Button>
        {!isBuiltin && (
          <Button
            variant="primary"
            onClick={handleCompileSave}
            disabled={isCompiling}
          >
            {isCompiling ? 'Compiling...' : 'Compile & Save'}
          </Button>
        )}
      </div>
      {isBuiltin && (
        <div className={styles.readonlyBanner}>
          Read-only. Click &ldquo;Copy to Edit&rdquo; to create an editable
          copy.
        </div>
      )}
      <div className={styles.editorWrapper}>
        <MonacoEditor
          value={editSource}
          onChange={(v) => setEditSource(v ?? '')}
          readOnly={isBuiltin}
          error={
            compileResult && !compileResult.success
              ? {
                  line: compileResult.errorLine,
                  message: compileResult.errorMessage,
                }
              : undefined
          }
        />
      </div>
      {compileResult && !compileResult.success && (
        <div className={styles.errorDisplay}>
          Line {compileResult.errorLine}: {compileResult.errorMessage}
        </div>
      )}
      {compileResult?.success && (
        <div className={styles.compileSuccess}>Compiled and saved.</div>
      )}
    </div>
  );
}
