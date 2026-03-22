import { clone, create } from '@bufbuild/protobuf';
import { ColorPaletteSchema } from '@dmx-controller/proto/color_pb';
import { type Project } from '@dmx-controller/proto/project_pb';
import { Scene_Tile_LoopDetailsSchema } from '@dmx-controller/proto/scene_pb';
import { SettingsSchema } from '@dmx-controller/proto/settings_pb';

export default function upgradeProject(p: Project): void {
  // Migrate color palettes from deprecated map (field 7) to new array (field 2)
  for (const scene of Object.values(p.scenes)) {
    if (
      scene.colorPalettes.length === 0 &&
      Object.keys(scene.deprecatedColorPalettes).length > 0
    ) {
      for (const [idStr, palette] of Object.entries(
        scene.deprecatedColorPalettes,
      )) {
        const migratedPalette = clone(ColorPaletteSchema, palette);
        migratedPalette.id = BigInt(idStr);
        scene.colorPalettes.push(migratedPalette);
      }
      // Clear deprecated field after migration
      scene.deprecatedColorPalettes = {};
    }
  }

  Object.values(p.patches)
    .flatMap((p) => Object.values(p.outputs))
    .forEach((o) => {
      if (o.output.case === 'sacnDmxOutput') {
        o.output.value.universe = 1;
      }
    });

  Object.values(p.scenes)
    .flatMap((s) => s.tileMap)
    .map((t) => t.tile)
    .forEach((t) => {
      if (t && t.timingDetails.case == undefined) {
        t.timingDetails = {
          case: 'loop',
          value: create(Scene_Tile_LoopDetailsSchema, {
            fadeIn: {
              amount: {
                case: 'beat',
                value: 0,
              },
            },
            fadeOut: {
              amount: {
                case: 'beat',
                value: 0,
              },
            },
          }),
        };
      }
    });

  if (p.settings?.touchInterface === undefined) {
    if (p.settings === undefined) {
      p.settings = create(SettingsSchema, {
        touchInterface: Boolean(window.ontouchstart),
      });
    } else {
      p.settings.touchInterface === Boolean(window.ontouchstart);
    }
  }
}
