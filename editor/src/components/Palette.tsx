import { create } from '@bufbuild/protobuf';
import { Color, type ColorPalette } from '@dmx-controller/proto/color_pb';
import { useCallback, useContext, useMemo, useState } from 'react';
import { ColorPicker, IColor, useColor } from 'react-color-palette';

import { ProjectContext } from '../contexts/ProjectContext';

import { ControllerMapping_ActionSchema } from '@dmx-controller/proto/controller_pb';
import { BiCog, BiTrash } from 'react-icons/bi';
import { stringifyColor } from '../util/colorUtil';
import { IconButton } from './Button';
import { ColorSwatch } from './ColorSwatch';
import { ControllerConnection } from './ControllerConnection';
import { TextInput } from './Input';
import { Modal } from './Modal';
import styles from './Palette.module.scss';

interface PaletteSwatchProps {
  paletteId: bigint;
  sceneId: bigint;
  palette: ColorPalette;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  className?: string;
}

export function PaletteSwatch({
  paletteId,
  sceneId,
  palette,
  active,
  onClick,
  onDelete,
  className,
}: PaletteSwatchProps) {
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

  return (
    <div className={classes.join(' ')} onClick={onClick} title={palette.name}>
      <ColorSwatch color={palette.primary!.color} />
      <ColorSwatch color={palette.secondary!.color} />
      <ColorSwatch color={palette.tertiary!.color} />
      <IconButton
        title="Modify palette"
        iconOnly={true}
        onClick={() => setEditPalette(true)}
      >
        <BiCog />
      </IconButton>
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

  const [iPrimary, setIPrimary] = useColor(
    stringifyColor(palette.primary!.color!),
  );
  const [iSecondary, setISecondary] = useColor(
    stringifyColor(palette.secondary!.color!),
  );
  const [iTertiary, setITertiary] = useColor(
    stringifyColor(palette.tertiary!.color!),
  );

  const updateColor = useCallback((newColor: IColor, paletteColor: Color) => {
    paletteColor.red = newColor.rgb.r / 255;
    paletteColor.green = newColor.rgb.g / 255;
    paletteColor.blue = newColor.rgb.b / 255;
    update();
  }, []);

  const done = () => {
    save(`Edit color palette ${palette.name}.`);
    onClose();
  };

  const action = useMemo(
    () =>
      create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [sceneId.toString()]: {
                action: {
                  case: 'colorPaletteId',
                  value: paletteId,
                },
              },
            },
          },
        },
      }),
    [paletteId],
  );

  return (
    <Modal
      title={`Edit ${palette.name}`}
      onClose={done}
      bodyClass={styles.editModal}
    >
      <div className={styles.header}>
        <IconButton
          title={`Delete palette "${palette.name}"`}
          variant="warning"
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          <BiTrash />
        </IconButton>
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
        <ControllerConnection title="Switch to color palette" action={action} />
      </div>
      <div className={styles.colorSelectors}>
        <ColorPicker
          hideAlpha={true}
          color={iPrimary}
          onChange={(color) => {
            setIPrimary(color);
            updateColor(color, palette.primary!.color!);
          }}
        />
        <ColorPicker
          hideAlpha={true}
          color={iSecondary}
          onChange={(color) => {
            setISecondary(color);
            updateColor(color, palette.secondary!.color!);
          }}
        />
        <ColorPicker
          hideAlpha={true}
          color={iTertiary}
          onChange={(color) => {
            setITertiary(color);
            updateColor(color, palette.tertiary!.color!);
          }}
        />
        <PaletteVisualizer palette={palette} />
      </div>
    </Modal>
  );
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
