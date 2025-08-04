import { create } from '@bufbuild/protobuf';
import { type ColorPalette } from '@dmx-controller/proto/color_pb';
import { ControllerMapping_ColorPaletteSelectionSchema } from '@dmx-controller/proto/controller_pb';
import { useContext, useMemo, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { BiCog } from 'react-icons/bi';
import { Button, IconButton } from './Button';
import { ColorSwatch } from './ColorSwatch';
import { ControllerConnection } from './ControllerConnection';
import { TextInput } from './Input';
import { Modal } from './Modal';
import styles from './Palette.module.scss';

interface PaletteSwatchProps {
  id: string;
  scene: number;
  palette: ColorPalette;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  className?: string;
}

export function PaletteSwatch({
  id,
  scene,
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
      <IconButton title="Modify palette" onClick={() => setEditPalette(true)}>
        <BiCog />
      </IconButton>
      {editPalette && (
        <EditPaletteDialog
          id={id}
          scene={scene}
          palette={palette}
          onDelete={onDelete}
          onClose={() => setEditPalette(false)}
        />
      )}
    </div>
  );
}

interface EditPaletteDialogProps {
  id: string;
  scene: number;
  palette: ColorPalette;
  onDelete: () => void;
  onClose: () => void;
}

function EditPaletteDialog({
  id,
  scene,
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

  const done = () => {
    save(`Edit color palette ${palette.name}.`);
    onClose();
  };

  const action = useMemo(
    () =>
      create(ControllerMapping_ColorPaletteSelectionSchema, {
        scene: scene,
        paletteId: id,
      }),
    [id],
  );

  return (
    <Modal
      title={`Edit ${palette.name}`}
      onClose={done}
      bodyClass={styles.editModal}
    >
      <TextInput
        value={palette.name}
        onChange={(v) => {
          palette.name = v;
          update();
        }}
      />
      <ControllerConnection
        title="Color Palette"
        action={{
          case: 'colorPaletteSelection',
          value: action,
        }}
      />
      <Button
        variant="warning"
        onClick={() => {
          onClose();
          onDelete();
        }}
      >
        <>Delete palette {palette.name}</>
      </Button>
      <div className={styles.colorSelectors}>
        <ColorSwatch
          color={palette.primary!.color}
          updateDescription={`Update primary color for ${palette.name}`}
        />
        <ColorSwatch
          color={palette.secondary!.color}
          updateDescription={`Update secondary color for ${palette.name}`}
        />
        <ColorSwatch
          color={palette.tertiary!.color}
          updateDescription={`Update tertiary color for ${palette.name}`}
        />
      </div>
    </Modal>
  );
}
