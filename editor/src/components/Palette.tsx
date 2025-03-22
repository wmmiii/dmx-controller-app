import { ColorPalette } from "@dmx-controller/proto/color_pb";
import IconBxsCog from "../icons/IconBxsCog";
import styles from './Palette.module.scss';
import { Button, IconButton } from "./Button";
import { Modal } from "./Modal";
import { ProjectContext } from "../contexts/ProjectContext";
import { TextInput } from "./Input";
import { useContext, useState } from "react";
import { ColorSwatch } from "./ColorSwatch";

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
      <ColorSwatch color={palette.primary!.color} />
      <ColorSwatch color={palette.secondary!.color} />
      <ColorSwatch color={palette.tertiary!.color} />
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
        <ColorSwatch
          color={palette.primary!.color}
          updateDescription={`Update primary color for ${palette.name}`} />
        <ColorSwatch
          color={palette.secondary!.color}
          updateDescription={`Update secondary color for ${palette.name}`} />
        <ColorSwatch
          color={palette.tertiary!.color}
          updateDescription={`Update tertiary color for ${palette.name}`}  />
      </div>
    </Modal>
  );
}
