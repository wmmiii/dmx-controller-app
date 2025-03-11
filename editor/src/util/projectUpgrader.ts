import { Project } from "@dmx-controller/proto/project_pb";
import { idMapToArray } from "./mapUtils";
import { Effect, FixtureState } from "@dmx-controller/proto/effect_pb";
import { randomUint64 } from "./numberUtils";
import { Universe } from "@dmx-controller/proto/universe_pb";
import { OutputId, OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { FixtureDefinition, FixtureDefinition_Channel_AmountMapping, FixtureDefinition_Channel_AngleMapping, FixtureDefinition_Mode, PhysicalFixtureGroup, PhysicalFixtureGroup_FixtureList } from "@dmx-controller/proto/fixture_pb";
import { Scene_Component_EffectGroupComponent_EffectChannel, Scene_ComponentMap } from "@dmx-controller/proto/scene_pb";
import { isAmountChannel, isAngleChannel } from "../engine/fixture";
import { DEFAULT_COLOR_PALETTE } from "../engine/universe";

export default function upgradeProject(project: Project): void {
  upgradeIndices(project);
  upgradeLive(project);
  upgradeUniverse(project);
  upgradeLiveEffects(project);
  upgradeFixtures(project);
  updateFixtureDefinitionMapping(project);
  upgradeColorTypes(project);
  upgradeComponentMapping(project);
  upgradeFixtureDefinitions(project);
  upgradeEffectTiming(project);
}

function upgradeIndices(project: Project): void {
  // Audio files
  if (project.assets != null) {
    if (project.assets?.deprecatedAudioFiles.length > 0) {
      project.assets.deprecatedAudioFiles.forEach((a, i) => {
        if (project.assets != null) {
          project.assets.audioFiles[i + 1] = a;
        }
      }
      );

      project.shows.forEach(s => {
        if (s.audioTrack != null) {
          s.audioTrack.audioFileId += 1;
        }
      });

      project.assets.deprecatedAudioFiles = [];
    }
  }

  // Physical fixtures
  if (shiftMapping(project.physicalFixtures)) {
    for (const s of project.shows) {
      for (const t of s.lightTracks) {
        if (t.output.case === 'physicalFixtureId') {
          t.output.value += 1;
        }
      }
    }

    for (const d of project.defaultChannelValues) {
      if (d.output.case === 'physicalFixtureId') {
        d.output.value += 1;
      }
    }

    for (const groupId in project.physicalFixtureGroups) {
      const g = project.physicalFixtureGroups[groupId];
      for (const id in g.physicalFixtureIds) {
        g.physicalFixtureIds[id] += 1;
      }
    }
  }

  // Fixture groups
  if (shiftMapping(project.physicalFixtureGroups)) {
    for (const s of project.shows) {
      for (const t of s.lightTracks) {
        if (t.output.case === 'physicalFixtureGroupId') {
          t.output.value += 1;
        }
      }
    }

    for (const d of project.defaultChannelValues) {
      if (d.output.case === 'physicalFixtureGroupId') {
        d.output.value += 1;
      }
    }

    for (const groupId in project.physicalFixtureGroups) {
      const g = project.physicalFixtureGroups[groupId];
      for (const id in g.physicalFixtureGroupIds) {
        g.physicalFixtureGroupIds[id] += 1;
      }
    }
  }

  // Beat metadata
  for (const a of Object.values(project.assets?.audioFiles || {})) {
    if ((a.beatMetadata?.deprecatedOffsetMs || 0) != 0) {
      if (a.beatMetadata != null) {
        a.beatMetadata.offsetMs = BigInt(a.beatMetadata.deprecatedOffsetMs);
        a.beatMetadata.deprecatedOffsetMs = 0;
      }
    }
  }
  if ((project.liveBeat?.deprecatedOffsetMs || 0) != 0) {
    if (project.liveBeat) {
      project.liveBeat.offsetMs = BigInt(project.liveBeat.deprecatedOffsetMs);
      project.liveBeat.deprecatedOffsetMs = 0;
    }
  }
}

function shiftMapping(map: { [id: number]: any }): boolean {
  if (map[0] != null) {
    idMapToArray(map)
      .forEach(([id, d]) => map[id + 1] = d);
    delete map[0];
    return true;
  } else {
    return false;
  }
}

function upgradeLive(project: Project) {
  // Scene components
  for (const scene of project.scenes) {
    if (scene.rows == null) {
      scene.rows = [];
    }
    // delete scene.components;
  }
}

function upgradeUniverse(project: Project) {
  // Check to see if this has been applied already.
  if (project?.universes == null || Object.keys(project.universes).length !== 0) {
    return;
  }

  const universeId = randomUint64();

  // Create new universe.
  const universe = new Universe({
    name: 'Default',
  });

  const fixtureMapping: { [id: number]: bigint } = {};
  const groupMapping: { [id: number]: bigint } = {};

  // Update fixtures.
  for (const oldFixtureId in project.physicalFixtures) {
    const newFixtureId = randomUint64();
    fixtureMapping[oldFixtureId] = newFixtureId;

    const fixture = project.physicalFixtures[oldFixtureId];
    universe.fixtures[newFixtureId.toString()] = fixture;
  }

  // Update groups.
  for (const oldGroupId in project.physicalFixtureGroups) {
    const newGroupId = randomUint64();
    groupMapping[oldGroupId] = newGroupId;
    const oldGroup = project.physicalFixtureGroups[oldGroupId];

    const fixtures: { [universe: string]: PhysicalFixtureGroup_FixtureList } = {};
    fixtures[universeId.toString()] = new PhysicalFixtureGroup_FixtureList({
      fixtures: oldGroup.physicalFixtureIds.map(id => fixtureMapping[id]),
    });
    const newGroup = new PhysicalFixtureGroup({
      name: oldGroup.name,
      fixtures: fixtures,
      groups: oldGroup.physicalFixtureGroupIds.map(id => groupMapping[id]),
    });

    project.groups[newGroupId.toString()] = newGroup;
  }

  project.activeUniverse = universeId;
  project.universes[universeId.toString()] = universe;

  const updateLightTrack = (track: LightTrack) => {
    if (track.output.case === 'physicalFixtureGroupId') {
      track.outputId = new OutputId({
        output: {
          case: 'group',
          value: groupMapping[track.output.value],
        },
      });
    } else if (track.output.case === 'physicalFixtureId') {
      const fixtureMap = new OutputId_FixtureMapping();
      fixtureMap.fixtures[universeId.toString()] = fixtureMapping[track.output.value];

      track.outputId = new OutputId({
        output: {
          case: 'fixtures',
          value: fixtureMap,
        },
      });
    } else {
      track.outputId = new OutputId();
    }

    track.output = {
      case: undefined,
      value: undefined,
    };
  };

  // Update shows.
  project.shows
    .flatMap(s => s.lightTracks)
    .forEach(updateLightTrack);

  // Update scenes.
  project.scenes
    .flatMap(s => s.rows)
    .flatMap(r => r.components)
    .forEach(c => {
      if (c.description.case === 'effectGroup') {
        const description = c.description.value;

        if (description.output.case === 'physicalFixtureGroupId') {
          description.outputId = new OutputId({
            output: {
              case: 'group',
              value: groupMapping[description.output.value],
            },
          });
        } else if (description.output.case === 'physicalFixtureId') {
          const fixtureMap = new OutputId_FixtureMapping();
          fixtureMap.fixtures[universeId.toString()] = fixtureMapping[description.output.value];

          description.outputId = new OutputId({
            output: {
              case: 'fixtures',
              value: fixtureMap,
            },
          });
        }
        description.output = {
          case: undefined,
          value: undefined,
        };
      } else if (c.description.case === 'sequence') {
        c.description.value.lightTracks.forEach(updateLightTrack);
      }
    });

  project.physicalFixtures = {};
  project.physicalFixtureGroups = {};
}

function upgradeLiveEffects(project: Project) {
  project.scenes
    .flatMap(s => s.rows)
    .flatMap(r => r.components)
    .forEach(c => {
      if (c.description.case === 'effectGroup') {
        const effect = c.description.value;
        if (effect.outputId != null) {
          effect.channels = [new Scene_Component_EffectGroupComponent_EffectChannel({
            outputId: effect.outputId,
            effect: effect.effect,
          })];
        }
        effect.channels.forEach(c => {
          if (!c.outputId?.output) {
            c.outputId = new OutputId({
              output: {
                case: undefined,
                value: undefined,
              }
            });
          }
          if (!c.effect) {
            c.effect = new Effect();
          }
        })
      }
    });
}

function upgradeFixtures(project: Project) {
  for (const entry of Object.entries(project.deprecatedUint32FixtureDefinitions)) {
    const definitionId = randomUint64();

    const oldId = parseInt(entry[0]);
    const definition = entry[1];
    for (const channel of Object.values(definition.channels)) {
      channel.deprecatedMinValue = 0;
      channel.deprecatedMaxValue = 255;
    }
    project.fixtureDefinitions[definitionId.toString()] = definition;

    for (const universe of Object.values(project.universes)) {
      for (const fixture of Object.values(universe.fixtures)) {
        if (fixture.deprecatedUint32FixtureDefinitionId === oldId) {
          fixture.deprecatedUint64FixtureDefinitionId = definitionId;
        }
      }
    }
  }

  project.deprecatedUint32FixtureDefinitions = {};
}

function updateFixtureDefinitionMapping(project: Project) {
  Object.values(project.fixtureDefinitions)
    .flatMap(d => Object.values(d.channels))
    .filter(c => c.mapping?.case == null)
    .forEach(c => {
      if (isAngleChannel(c.type)) {
        c.mapping = {
          case: 'angleMapping',
          value: new FixtureDefinition_Channel_AngleMapping({
            minDegrees: c.deprecatedMinDegrees,
            maxDegrees: c.deprecatedMaxDegrees,
          }),
        };
      } else if (isAmountChannel(c.type)) {
        c.mapping = {
          case: 'amountMapping',
          value: new FixtureDefinition_Channel_AmountMapping({
            minValue: c.deprecatedMinValue,
            maxValue: c.deprecatedMaxValue,
          }),
        };
      }
    });
}

function upgradeColorTypes(project: Project) {
  const upgradeState = (state: FixtureState) => {
    if (state?.lightColor.case === 'rgb' || state?.lightColor.case === 'rgbw') {
      state.lightColor = {
        case: 'color',
        value: state.lightColor.value,
      };
    }
  };

  const upgradeEffect = (effect: Effect) => {
    switch (effect.effect.case) {
      case "staticEffect":
        if (effect.effect.value.state != null) {
          upgradeState(effect.effect.value.state);
        }
        break;
      case "rampEffect":
        if (effect.effect.value.stateStart != null) {
          upgradeState(effect.effect.value.stateStart);
        }
        if (effect.effect.value.stateEnd != null) {
          upgradeState(effect.effect.value.stateEnd);
        }
        break;
      case "strobeEffect":
        if (effect.effect.value.stateA != null) {
          upgradeState(effect.effect.value.stateA);
        }
        if (effect.effect.value.stateB != null) {
          upgradeState(effect.effect.value.stateB);
        }
        break;
    }
  };

  project.scenes
    .flatMap(s => s.rows)
    .flatMap(r => r.components)
    .flatMap(c => {
      if (c.description.case === 'sequence') {
        return c.description.value.lightTracks.flatMap(t => t.layers).flatMap(l => l.effects);
      } else if (c.description.case === 'effectGroup') {
        return c.description.value.channels.map(c => c.effect);
      }
      throw new Error('Tried to upgrade effects in unknown component effect description: ' + c.description.case);
    })
    .forEach((e) => {
      if (e != null) {
        upgradeEffect(e);
      }
    });

  project.shows
    .flatMap(s => s.lightTracks)
    .flatMap(t => t.layers)
    .flatMap(l => l.effects)
    .forEach(upgradeEffect);

  project.scenes.forEach(s => {
    if (!s.colorPalettes || s.colorPalettes.length < 1) {
      s.colorPalettes = [DEFAULT_COLOR_PALETTE.clone()];
    }
    if (!s.colorPaletteTransitionDurationMs) {
      s.colorPaletteTransitionDurationMs = 2_000;
    }
  });
}

function upgradeComponentMapping(project: Project) {
  for (const scene of project.scenes) {
    if (scene.rows.length > 0) {
      for (let y = 0; y < scene.rows.length; y++) {
        const row = scene.rows[y];
        for (let x = 0; x < row.components.length; x++) {
          const component = row.components[x];

          scene.componentMap.push(new Scene_ComponentMap({
            component: component,
            x: x,
            y: y,
          }));
        }
      }
    }

    scene.rows = [];
  }
}

function upgradeFixtureDefinitions(project: Project) {
  const idMapping = new Map<bigint, { id: string, mode: string }>();

  if (Object.keys(project.deprecatedUint64FixtureDefinitions).length === 0) {
    return;
  }

  // Upgrade definitions
  for (const oldId in project.deprecatedUint64FixtureDefinitions) {
    const oldDefinition = project.deprecatedUint64FixtureDefinitions[oldId];

    const newId = crypto.randomUUID();
    const mode = crypto.randomUUID();

    project.fixtureDefinitions[newId] = new FixtureDefinition({
      globalId: newId,
      name: oldDefinition.name,
      manufacturer: oldDefinition.manufacturer,
    });
    project.fixtureDefinitions[newId].modes[mode] = new FixtureDefinition_Mode({
      name: 'Default',
      numChannels: oldDefinition.numChannels,
      channels: oldDefinition.channels,
    });
    idMapping.set(BigInt(oldId), { id: newId, mode: mode });
  }

  // Fix mappings
  for (const universeId in project.universes) {
    const universe = project.universes[universeId];
    for (const fixtureId in universe.fixtures) {
      const fixture = universe.fixtures[fixtureId];
      const newId = idMapping.get(fixture.deprecatedUint64FixtureDefinitionId);
      if (!newId) {
        throw new Error(`Could not find ID mapping for ${fixture.deprecatedUint64FixtureDefinitionId}!`)
      }
      fixture.fixtureDefinitionId = newId.id;
      fixture.fixtureMode = newId.mode;
    }
  }

  project.deprecatedUint64FixtureDefinitions = {};
}

function upgradeEffectTiming(project: Project) {
  const upgradeEffect = (effect: Effect) => {
    if (effect.effect.case === 'rampEffect') {
      const ramp = effect.effect.value;
      if (ramp.timingMode == 0 && ramp.timingMultiplier == 0 && !ramp.mirrored) {
        ramp.timingMode = effect.timingMode;
        ramp.timingMultiplier = effect.timingMultiplier;
        ramp.mirrored = effect.mirrored;
      }
    }
  }

  project.scenes
    .flatMap(s => s.componentMap)
    .flatMap(c => c.component!)
    .flatMap(c => {
      if (c.description.case === 'sequence') {
        return c.description.value.lightTracks.flatMap(t => t.layers).flatMap(l => l.effects);
      } else if (c.description.case === 'effectGroup') {
        return c.description.value.channels.map(c => c.effect);
      }
      throw new Error('Tried to upgrade effects in unknown component effect description: ' + c.description.case);
    })
    .forEach((e) => {
      if (e != null) {
        upgradeEffect(e);
      }
    });

  project.shows
    .flatMap(s => s.lightTracks)
    .flatMap(t => t.layers)
    .flatMap(l => l.effects)
    .forEach(upgradeEffect);

  project.scenes.forEach(s => {
    if (!s.colorPalettes || s.colorPalettes.length < 1) {
      s.colorPalettes = [DEFAULT_COLOR_PALETTE.clone()];
    }
    if (!s.colorPaletteTransitionDurationMs) {
      s.colorPaletteTransitionDurationMs = 2_000;
    }
  });
}
