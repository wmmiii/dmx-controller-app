import { create } from '@bufbuild/protobuf';
import {
  ColorPaletteSchema,
  ColorSchema,
} from '@dmx-controller/proto/color_pb';
import {
  Visualizer,
  VisualizerCompilationResult,
  VisualizerSchema,
} from '@dmx-controller/proto/visualizer_pb';
import clsx from 'clsx';
import { useContext, useEffect, useRef, useState } from 'react';
import { BiCopy, BiPlus, BiTrash } from 'react-icons/bi';

import { Button } from '../../components/Button';
import { ColorSwatch } from '../../components/ColorSwatch';
import { EditableText, NumberInput } from '../../components/Input';
import { MonacoEditor } from '../../components/MonacoEditor';
import { Toggle } from '../../components/Toggle';
import { ProjectContext } from '../../contexts/ProjectContext';
import {
  compileVisualizer,
  getBuiltinVisualizers,
} from '../../system_interfaces/shader';
import { randomUint64 } from '../../util/numberUtils';

import styles from './VisualizerEditor.module.css';
import { VisualizerPreview } from './VisualizerPreview';

const DEFAULT_GLSL = `// Available uniforms:
//   vec4  u_color             — display color RGB + dimmer
//   float u_audio_bands[16]   — frequency bands, 0.0-1.0 (low to high)
//   float u_beat_t            — beat phase, 0.0-1.0 (position within beat)
//   float u_beat_count        — beat number
//   vec4  u_palette_primary   — palette color 1
//   vec4  u_palette_secondary — palette color 2
//   vec4  u_palette_tertiary  — palette color 3
//   vec2  u_resolution        — display size in pixels
//   float u_time_ms           — wall-clock milliseconds
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
      <Button icon={<BiPlus size={18} />} onClick={createNew}>
        Add Visualizer
      </Button>
      {userEntries.length > 0 && (
        <>
          <h3>My Visualizers</h3>
          <ul>
            {userEntries
              .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
              .map(([id, v]) => (
                <li
                  key={id}
                  className={clsx({
                    [styles.selected]: BigInt(id) === selectedId,
                  })}
                  onClick={() => onSelect(BigInt(id))}
                >
                  <EditableText
                    value={v.name}
                    onChange={(name) => {
                      if (name) {
                        v.name = name;
                        save(`Set visualizer name to "${name}".`);
                      }
                    }}
                  />
                </li>
              ))}
          </ul>
        </>
      )}
      {builtinEntries.length > 0 && (
        <>
          <h3>Built-in</h3>
          <ul>
            {builtinEntries
              .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
              .map(([id, v]) => (
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

interface PreviewColumnProps {
  glslSource: string;
  onCompileError: (line: number, message: string) => void;
  onCompileSuccess: () => void;
}

function PreviewColumn({
  glslSource,
  onCompileError,
  onCompileSuccess,
}: PreviewColumnProps) {
  const [previewColor] = useState(() =>
    create(ColorSchema, { red: 1, green: 1, blue: 1 }),
  );
  const [dimmer, setDimmer] = useState(1.0);
  const [persistent, setPersistent] = useState(false);
  const [previewPalette] = useState(() =>
    create(ColorPaletteSchema, {
      primary: { color: { red: 1, green: 0, blue: 1 } },
      secondary: { color: { red: 0, green: 1, blue: 1 } },
      tertiary: { color: { red: 1, green: 1, blue: 0 } },
    }),
  );

  return (
    <div className={styles.previewColumn}>
      <div className={styles.previewControls}>
        <label>
          Color
          <ColorSwatch
            color={previewColor}
            updateDescription="Update preview color"
          />
        </label>
        <label>
          Dimmer
          <NumberInput title="Dimmer" value={dimmer} onChange={setDimmer} />
        </label>
        <label>
          Primary
          <ColorSwatch
            color={previewPalette.primary!.color!}
            updateDescription="Update preview primary"
          />
        </label>
        <label>
          Secondary
          <ColorSwatch
            color={previewPalette.secondary!.color!}
            updateDescription="Update preview secondary"
          />
        </label>
        <label>
          Tertiary
          <ColorSwatch
            color={previewPalette.tertiary!.color!}
            updateDescription="Update preview tertiary"
          />
        </label>
        <label>
          Persistent
          <Toggle
            title="Use previous frame as prev_pixel input."
            value={persistent}
            onChange={setPersistent}
          />
        </label>
      </div>
      <VisualizerPreview
        glslSource={glslSource}
        color={previewColor}
        dimmer={dimmer}
        persistent={persistent}
        palettePrimary={previewPalette.primary!.color!}
        paletteSecondary={previewPalette.secondary!.color!}
        paletteTertiary={previewPalette.tertiary!.color!}
        onCompileError={onCompileError}
        onCompileSuccess={onCompileSuccess}
      />
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
  const [browserError, setBrowserError] = useState<{
    line: number;
    message: string;
  } | null>(null);

  // Track the last known project source for undo/redo sync detection
  const projectSource = visualizer?.glslSource ?? '';
  const lastProjectSourceRef = useRef(projectSource);

  // Sync editor with project when project changes externally (undo/redo)
  // Only sync if user hasn't made local edits (editSource matches last known project source)
  useEffect(() => {
    if (projectSource !== lastProjectSourceRef.current) {
      if (editSource === lastProjectSourceRef.current) {
        setEditSource(projectSource);
      }
      lastProjectSourceRef.current = projectSource;
    }
  }, [projectSource, editSource]);

  // Refs to capture current values for save-on-unmount (avoids stale closures)
  const editSourceRef = useRef(editSource);
  const selectedIdRef = useRef(selectedId);
  const isBuiltinRef = useRef(isBuiltin);
  const visualizerRef = useRef(visualizer);
  const saveRef = useRef(save);

  // Keep refs in sync with latest values
  editSourceRef.current = editSource;
  selectedIdRef.current = selectedId;
  isBuiltinRef.current = isBuiltin;
  visualizerRef.current = visualizer;
  saveRef.current = save;

  // Attempt save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      const currentSource = editSourceRef.current;
      const currentId = selectedIdRef.current;
      const currentVisualizer = visualizerRef.current;
      const currentSave = saveRef.current;

      if (
        !isBuiltinRef.current &&
        currentId != null &&
        currentVisualizer &&
        currentSource !== currentVisualizer.glslSource
      ) {
        // Fire-and-forget compile & save
        compileVisualizer(currentId, currentSource)
          .then((result) => {
            if (result.success) {
              currentVisualizer.glslSource = currentSource;
              currentSave(`Update visualizer "${currentVisualizer.name}".`);
            }
          })
          .catch(() => {
            // Silent failure on unmount - user already navigated away
          });
      }
    };
  }, []);

  if (selectedId == null || visualizer == null) {
    return <div className={styles.emptyPane}>Select a visualizer to edit.</div>;
  }

  const displayedError =
    browserError ??
    (compileResult && !compileResult.success
      ? { line: compileResult.errorLine, message: compileResult.errorMessage }
      : null);

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
      const result = await compileVisualizer(selectedId, editSource);
      setCompileResult(result);
      if (result.success) {
        setBrowserError(null);
        visualizer.glslSource = editSource;
        save(`Update visualizer "${visualizer.name}".`);
      }
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className={styles.visualizerEditor}>
      <PreviewColumn
        glslSource={editSource}
        onCompileError={(line, message) => setBrowserError({ line, message })}
        onCompileSuccess={() => setBrowserError(null)}
      />
      <div className={styles.editorColumn}>
        <div className={styles.editorHeader}>
          {!isBuiltin && (
            <Button
              variant="warning"
              icon={<BiTrash size={18} />}
              onClick={handleDelete}
            >
              Delete
            </Button>
          )}
          <div className={styles.spacer} />
          <Button icon={<BiCopy size={18} />} onClick={handleCopy}>
            {isBuiltin ? 'Copy to Edit' : 'Copy'}
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
        {compileResult?.success && !browserError && (
          <div className={styles.compileSuccess}>Compiled and saved.</div>
        )}
        {displayedError && (
          <div className={styles.errorDisplay}>
            Line {displayedError.line}: {displayedError.message}
          </div>
        )}
        <div className={styles.editorWrapper}>
          <MonacoEditor
            value={editSource}
            onChange={(v) => setEditSource(v ?? '')}
            readOnly={isBuiltin}
            error={displayedError ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
