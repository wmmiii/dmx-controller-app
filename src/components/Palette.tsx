import { create } from '@bufbuild/protobuf';
import { Color, type ColorPalette } from '@dmx-controller/proto/color_pb';
import { useCallback, useContext, useMemo, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import {
  InputBindingSchema,
  InputType,
} from '@dmx-controller/proto/controller_pb';
import { RgbColor, Wheel } from '@uiw/react-color';
import { BiPencil, BiTrash } from 'react-icons/bi';
import { colorToHex, stringifyColor } from '../util/colorUtil';
import { Button, IconButton } from './Button';
import { ControllerConnection } from './ControllerConnection';
import { EditableText, TextInput } from './Input';
import { Modal } from './Modal';
import styles from './Palette.module.css';

interface PaletteSwatchProps {
  paletteId: bigint;
  sceneId: bigint;
  palette: ColorPalette;
  active: boolean;
  edit: boolean;
  onClick: () => void;
  onDelete: () => void;
  className?: string;
}

export function PaletteSwatch({
  paletteId,
  sceneId,
  palette,
  active,
  edit,
  onClick,
  onDelete,
  className,
}: PaletteSwatchProps) {
  const { save } = useContext(ProjectContext);
  const [editPalette, setEditPalette] = useState(false);

  const classes = [styles.paletteSwatch];
  if (active) {
    classes.push(styles.active);
  }
  if (className) {
    classes.push(className);
  }
  if (
    palette.primary?.color == null ||
    palette.secondary?.color == null ||
    palette.tertiary?.color == null
  ) {
    throw new Error('Palette color not set!');
  }

  const background = `linear-gradient(60deg, ${colorToRgb(palette.primary!.color)} 20%, ${colorToRgb(palette.secondary!.color)}, ${colorToRgb(palette.tertiary!.color)} 80%)`;

  return (
    <div className={classes.join(' ')} onClick={onClick} title={palette.name}>
      <div className={styles.details}>
        <EditableText
          value={palette.name}
          onChange={(newName) => {
            palette.name = newName;
            save(`Update palette name to ${newName}.`);
          }}
        />
        <div className={styles.swatchColors} style={{ background }}></div>
      </div>
      {edit && (
        <IconButton
          className={styles.edit}
          title="Modify palette"
          onClick={() => setEditPalette(true)}
        >
          <BiPencil />
        </IconButton>
      )}
      {editPalette && (
        <EditPaletteDialog
          paletteId={paletteId}
          sceneId={sceneId}
          palette={palette}
          onDelete={onDelete}
          onClose={() => setEditPalette(false)}
        />
      )}
    </div>
  );
}

interface EditPaletteDialogProps {
  paletteId: bigint;
  sceneId: bigint;
  palette: ColorPalette;
  onDelete: () => void;
  onClose: () => void;
}

function EditPaletteDialog({
  paletteId,
  sceneId,
  palette,
  onDelete,
  onClose,
}: EditPaletteDialogProps) {
  const { save, update } = useContext(ProjectContext);

  if (
    palette.primary?.color == null ||
    palette.secondary?.color == null ||
    palette.tertiary?.color == null
  ) {
    throw new Error('Palette color not set!');
  }

  const updateColor = useCallback(
    (newColor: RgbColor, paletteColor: Color) => {
      paletteColor.red = newColor.r / 255;
      paletteColor.green = newColor.g / 255;
      paletteColor.blue = newColor.b / 255;
      update();
    },
    [update],
  );

  const done = () => {
    save(`Edit color palette ${palette.name}.`);
    onClose();
  };

  const action = useMemo(
    () =>
      create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'colorPalette',
          value: { paletteId },
        },
      }),
    [paletteId],
  );

  return (
    <Modal
      title={
        <>
          Edit
          <EditableText
            value={palette.name}
            onChange={(v) => {
              palette.name = v;
              update();
            }}
          />
        </>
      }
      onClose={done}
      bodyClass={styles.editModal}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.header}>
        <Button
          icon={<BiTrash />}
          variant="warning"
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          Delete palette
        </Button>
        <div>
          Name:&nbsp;
          <TextInput
            value={palette.name}
            onChange={(v) => {
              palette.name = v;
              update();
            }}
          />
        </div>
        <ControllerConnection
          title="Switch to color palette"
          context={{ type: 'scene', sceneId: sceneId }}
          action={action}
        />
      </div>
      <div className={styles.colorSelectors}>
        <div>
          <h3>Primary</h3>
          <Wheel
            color={colorToHex(palette.primary!.color)}
            onChange={(c) => updateColor(c.rgb, palette.primary!.color!)}
          />
        </div>
        <div>
          <h3>Secondary</h3>
          <Wheel
            color={colorToHex(palette.secondary!.color)}
            onChange={(c) => updateColor(c.rgb, palette.secondary!.color!)}
          />
        </div>
        <div>
          <h3>Tertiary</h3>
          <Wheel
            color={colorToHex(palette.tertiary!.color)}
            onChange={(c) => updateColor(c.rgb, palette.tertiary!.color!)}
          />
        </div>
        <PaletteVisualizer palette={palette} />
      </div>
    </Modal>
  );
}

function colorToRgb(color: Color) {
  return `rgb(${color.red * 255}, ${color.green * 255}, ${color.blue * 255})`;
}

interface PaletteVisualizerProps {
  palette: ColorPalette;
}

function PaletteVisualizer({ palette }: PaletteVisualizerProps) {
  return (
    <div className={styles.visualizer}>
      <div
        className={`${styles.gradient} ${styles.primary}`}
        style={{
          background: `radial-gradient(circle closest-side, ${stringifyColor(palette.primary!.color!)} 10%, transparent 100%)`,
        }}
      ></div>
      <div
        className={`${styles.gradient} ${styles.secondary}`}
        style={{
          background: `radial-gradient(circle closest-side, ${stringifyColor(palette.secondary!.color!)} 10%, transparent 100%)`,
        }}
      ></div>
      <div
        className={`${styles.gradient} ${styles.tertiary}`}
        style={{
          background: `radial-gradient(circle closest-side, ${stringifyColor(palette.tertiary!.color!)} 10%, transparent 100%)`,
        }}
      ></div>
    </div>
  );
}
