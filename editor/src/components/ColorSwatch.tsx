import { Color } from '@dmx-controller/proto/color_pb';
import { useContext } from 'react';
import { ColorPicker, useColor } from 'react-color-palette';
import { ProjectContext } from '../contexts/ProjectContext';
import styles from './ColorSwatch.module.scss';

import { stringifyColor } from '../util/colorUtil';
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

  const [iColor, setIColor] = useColor(stringifyColor(color));

  if (updateDescription) {
    return (
      <div className={className}>
        <Popover
          onClose={() => save(updateDescription)}
          popover={
            <ColorPicker
              color={iColor}
              onChange={(iColor) => {
                setIColor(iColor);

                color.red = iColor.rgb.r / 255;
                color.green = iColor.rgb.g / 255;
                color.blue = iColor.rgb.b / 255;
                update();
              }}
              hideAlpha={true}
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
