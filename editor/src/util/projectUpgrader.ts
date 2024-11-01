import { Project } from "@dmx-controller/proto/project_pb";
import { idMapToArray } from "./mapUtils";
import { Effect } from "@dmx-controller/proto/effect_pb";

export default function upgradeProject(project: Project): void {
  upgradeIndices(project);
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

  // Fixture definitions
  if (shiftMapping(project.fixtureDefinitions)) {
    Object.values(project.physicalFixtures)
      .forEach(f => f.fixtureDefinitionId += 1);
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

  // Sequences
  if (shiftMapping(project.fixtureSequences)) {
    const upgradeEffect = (e: Effect) => {
      if (e.effect.case === 'staticEffect' &&
        e.effect.value.effect.case === 'fixtureSequence') {
        e.effect.value.effect.value.fixtureSequenceId += 1;
      } else if (e.effect.case === 'rampEffect') {
        if (e.effect.value.start.case === 'fixtureSequenceMappingStart') {
          e.effect.value.start.value.fixtureSequenceId += 1;
        }
        if (e.effect.value.end.case === 'fixtureSequenceMappingEnd') {
          e.effect.value.end.value.fixtureSequenceId += 1;
        }
      }
    }

    for (const s of project.shows) {
      for (const t of s.lightTracks) {
        for (const l of t.layers) {
          for (const e of l.effects) {
            upgradeEffect(e);
          }
        }
      }
    }

    for (const s of Object.values(project.fixtureSequences)) {
      for (const l of s.layers) {
        for (const e of l.effects) {
          upgradeEffect(e);
        }
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