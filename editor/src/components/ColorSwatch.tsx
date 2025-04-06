import { Color } from '@dmx-controller/proto/color_pb';
import styles from 'ColorSwatch.module.scss';
import { useContext } from 'react';
import ColorPicker, { themes } from 'react-pick-color';

import { ProjectContext } from '../contexts/ProjectContext';

import { Popover } from './Popover';

interface ColorSwatchProps {
  color: Color;
  updateDescription?: string;
}

export function ColorSwatch({ color, updateDescription }: ColorSwatchProps) {
  const { save, update } = useContext(ProjectContext);

  themes.dark.borderColor = 'transparent';
  themes.dark.background = 'transparent';

  if (updateDescription) {
    return (
      <Popover
        onClose={() => save(updateDescription)}
        popover={
          <ColorPicker
            color={{
              r: color.red * 255,
              g: color.green * 255,
              b: color.blue * 255,
              a: 1,
            }}
            onChange={({ rgb }) => {
              if (color == null) {
                throw new Error('Color not defined!');
              }

              color.red = rgb.r / 255;
              color.green = rgb.g / 255;
              color.blue = rgb.b / 255;
              update();
            }}
            hideAlpha={true}
            theme={themes.dark}
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
