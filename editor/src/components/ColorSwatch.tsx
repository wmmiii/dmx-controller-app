import { Color } from "@dmx-controller/proto/color_pb";

import styles from 'ColorSwatch.module.scss';

interface ColorSwatchProps {
  color: Color;
}

export function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <div
      className={styles.colorSwatch}
      style={{ backgroundColor: `rgb(${color.red * 255},${color.green * 255},${color.blue * 255})` }}>
    </div>
  );
}