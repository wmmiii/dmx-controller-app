import { Color } from '@dmx-controller/proto/color_pb';
import { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from './ColorSwatch.module.css';

import { Wheel } from '@uiw/react-color';
import { colorToHex } from '../util/colorUtil';
import { Popover } from './Popover';

interface ColorSwatchProps {
  className?: string;
  color: Color;
  updateDescription?: string;
}

export function ColorSwatch({
  className,
  color,
  updateDescription,
}: ColorSwatchProps) {
  const { save, update } = useContext(ProjectContext);

  if (updateDescription) {
    return (
      <div className={className}>
        <Popover
          onClose={() => save(updateDescription)}
          popover={
            <Wheel
              color={colorToHex(color)}
              onChange={(c) => {
                color.red = c.rgb.r / 255;
                color.green = c.rgb.g / 255;
                color.blue = c.rgb.b / 255;
                update();
              }}
            />
          }
        >
          <div
            className={styles.colorSwatch}
            style={{
              backgroundColor: `rgb(${color.red * 255},${color.green * 255},${color.blue * 255})`,
            }}
          ></div>
        </Popover>
      </div>
    );
  } else {
    return (
      <div
        className={`${styles.colorSwatch} ${styles.nonInteractive}`}
        style={{
          backgroundColor: `rgb(${color.red * 255},${color.green * 255},${color.blue * 255})`,
        }}
      ></div>
    );
  }
}
