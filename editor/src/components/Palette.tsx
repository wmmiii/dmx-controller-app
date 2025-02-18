import { ColorPalette, ColorPalette_ColorDescription } from "@dmx-controller/proto/color_pb";
import ColorPicker from "react-pick-color";
import IconBxsCog from "../icons/IconBxsCog";
import styles from './Palette.module.scss';
import { Button, IconButton } from "./Button";
import { Modal } from "./Modal";
import { ProjectContext } from "../contexts/ProjectContext";
import { TextInput } from "./Input";
import { stringifyColor } from "../util/colorUtil";
import { useContext, useState } from "react";

interface PaletteSwatchProps {
  palette: ColorPalette;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  className?: string;
}

export function PaletteSwatch({ palette, active, onClick, onDelete, className }: PaletteSwatchProps) {
  const [editPalette, setEditPalette] = useState(false);

  const classes = [styles.paletteSwatch];
  if (active) {
    classes.push(styles.active);
  }
  if (className) {
    classes.push(className);
  }
  if (palette.primary?.color == null || palette.secondary?.color == null || palette.tertiary?.color == null) {
    throw new Error('Palette color not set!');
  }

  return (
    <div
      className={classes.join(' ')} onClick={onClick}
      title={palette.name}>
      <div
        className={styles.primary}
        style={{ backgroundColor: stringifyColor(palette.primary.color) }}>
      </div>
      <div
        className={styles.secondary}
        style={{ backgroundColor: stringifyColor(palette.secondary.color) }}>
      </div>
      <div
        className={styles.tertiary}
        style={{ backgroundColor: stringifyColor(palette.tertiary.color) }}>
      </div>
      <IconButton
        title="Modify palette"
        onClick={() => setEditPalette(true)}>
        <IconBxsCog />
      </IconButton>
      {
        editPalette && <EditPaletteDialog palette={palette} onDelete={onDelete} onClose={() => setEditPalette(false)} />
      }
    </div>
  );
}

interface EditPaletteDialogProps {
  palette: ColorPalette;
  onDelete: () => void;
  onClose: () => void;
}

function EditPaletteDialog({ palette, onDelete, onClose }: EditPaletteDialogProps) {
  const { save, update } = useContext(ProjectContext);

  if (palette.primary?.color == null || palette.secondary?.color == null || palette.tertiary?.color == null) {
    throw new Error('Palette color not set!');
  }

  const done = () => {
    save(`Edit color palette ${palette.name}.`)
    onClose();
  };

  return (
    <Modal
      title={`Edit ${palette.name}`}
      onClose={done}
      bodyClass={styles.editModal}>
      <TextInput
        value={palette.name}
        onChange={(v) => {
          palette.name = v;
          update();
        }} />
      <Button
        variant="warning"
        onClick={() => {
          onClose();
          onDelete();
        }}>
        <>Delete palette {palette.name}</>
      </Button>
      <div className={styles.colorSelectors}>
        <EditColor name="Primary" color={palette.primary} />
        <EditColor name="Secondary" color={palette.secondary} />
        <EditColor name="Tertiary" color={palette.tertiary} />
      </div>
    </Modal>
  );
}

interface EditColorProps {
  name: string;
  color: ColorPalette_ColorDescription;
}

function EditColor({ name, color }: EditColorProps) {
  const { update } = useContext(ProjectContext);

  if (color?.color == null) {
    throw new Error('Color not defined!');
  }

  return (
    <div>
      {name}
      <ColorPicker
        color={{
          r: color.color.red * 255,
          g: color.color.green * 255,
          b: color.color.blue * 255,
          a: 1,
        }}
        onChange={({ rgb }) => {
          if (color?.color == null) {
            throw new Error('Color not defined!');
          }

          color.color.red = rgb.r / 255;
          color.color.green = rgb.g / 255;
          color.color.blue = rgb.b / 255;
          update();
        }}
        theme={{
          background: 'transparent',
          borderColor: 'none',
        }} />
    </div>
  );
}
