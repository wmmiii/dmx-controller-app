import { Project } from "@dmx-controller/proto/project_pb";
import { idMapToArray } from "./mapUtils";
import { Effect } from "@dmx-controller/proto/effect_pb";
import { randomUint64 } from "./numberUtils";
import { Universe } from "@dmx-controller/proto/universe_pb";
import { OutputId, OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { FixtureDefinition_Channel_AmountMapping, FixtureDefinition_Channel_AngleMapping, PhysicalFixtureGroup, PhysicalFixtureGroup_FixtureList } from "@dmx-controller/proto/fixture_pb";
import { Scene_Component_EffectGroupComponent_EffectChannel } from "@dmx-controller/proto/scene_pb";
import { isAmountChannel, isAngleChannel } from "../engine/fixture";

export default function upgradeProject(project: Project): void {
  upgradeIndices(project);
  upgradeLive(project);
  upgradeUniverse(project);
  upgradeLiveEffects(project);
  upgradeFixtures(project);
  updateFixtureDefinitionMapping(project);
}

function upgradeIndices(project: Project): void {
  // Audio files
  if (project.assets?.deprecatedAudioFiles.length > 0) {
    project.assets.deprecatedAudioFiles.forEach((a, i) =>
      project.assets.audioFiles[i + 1] = a);

    project.shows.forEach(s => {
      s.audioTrack.audioFileId += 1;
    });

    project.assets.deprecatedAudioFiles = [];
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
      a.beatMetadata.offsetMs = BigInt(a.beatMetadata.deprecatedOffsetMs);
      a.beatMetadata.deprecatedOffsetMs = 0;
    }
  }
  if ((project.liveBeat?.deprecatedOffsetMs || 0) != 0) {
    project.liveBeat.offsetMs = BigInt(project.liveBeat.deprecatedOffsetMs);
    project.liveBeat.deprecatedOffsetMs = 0;
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

  delete project.physicalFixtures;
  delete project.physicalFixtureGroups;
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
  for (const entry of Object.entries(project.deprecatedFixtureDefinitions)) {
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
        if (fixture.deprecatedFixtureDefinitionId === oldId) {
          fixture.fixtureDefinitionId = definitionId;
        }
      }
    }
  }

  project.deprecatedFixtureDefinitions = {};
}

function updateFixtureDefinitionMapping(project: Project) {
  Object.values(project.fixtureDefinitions)
    .flatMap(d => Object.values(d.channels))
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
