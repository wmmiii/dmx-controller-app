import { ColorPalette } from "@dmx-controller/proto/color_pb";
import IconBxsCog from "../icons/IconBxsCog";
import styles from "./Palette.module.scss";
import { Button, IconButton } from "./Button";
import { Modal } from "./Modal";
import { ProjectContext } from "../contexts/ProjectContext";
import { TextInput } from "./Input";
import { useContext, useMemo, useState } from "react";
import { ColorSwatch } from "./ColorSwatch";
import { ControllerConnection } from "./ControllerConnection";
import { ControllerMapping_ColorPaletteSelection } from "@dmx-controller/proto/controller_pb";

interface PaletteSwatchProps {
  id: string;
  palette: ColorPalette;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  className?: string;
}

export function PaletteSwatch({
  id,
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
    throw new Error("Palette color not set!");
  }

  return (
    <div className={classes.join(" ")} onClick={onClick} title={palette.name}>
      <ColorSwatch color={palette.primary!.color} />
      <ColorSwatch color={palette.secondary!.color} />
      <ColorSwatch color={palette.tertiary!.color} />
      <IconButton title="Modify palette" onClick={() => setEditPalette(true)}>
        <IconBxsCog />
      </IconButton>
      {editPalette && (
        <EditPaletteDialog
          id={id}
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
  palette: ColorPalette;
  onDelete: () => void;
  onClose: () => void;
}

function EditPaletteDialog({
  id,
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
    throw new Error("Palette color not set!");
  }

  const done = () => {
    save(`Edit color palette ${palette.name}.`);
    onClose();
  };

  const action = useMemo(
    () =>
      new ControllerMapping_ColorPaletteSelection({ scene: 0, paletteId: id }),
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
          case: "colorPaletteSelection",
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
