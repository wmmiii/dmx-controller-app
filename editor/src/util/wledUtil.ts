import { Project } from '@dmx-controller/proto/project_pb';
import { Scene_Tile_WledTile } from '@dmx-controller/proto/scene_pb';
import {
  WLEDConfig_Fixture,
  WLEDOutputId,
} from '@dmx-controller/proto/wled_pb';

export async function triggerWledTile(
  project: Project,
  tile: Scene_Tile_WledTile,
) {
  const fixture = project.wled!.fixtures[String(tile.outputId?.fixtureId)];
  const json = JSON.parse(tile.json);

  const segments = [];
  if (tile.outputId?.output.case === 'groupId') {
    const group = fixture.groups[String(tile.outputId.output.value)];
    group.segmentId.forEach((sid) => {
      segments.push(Object.assign({ id: sid }, json));
    });
  } else if (tile.outputId?.output.case === 'segmentId') {
    segments.push(Object.assign({ id: tile.outputId.output.value }, json));
  }

  await sendWledJson(fixture, JSON.stringify({ seg: segments }));
}

async function sendWledJson(wledFixture: WLEDConfig_Fixture, json: string) {
  const timerName = `Sent WLED command to ${wledFixture.name}.`;
  console.time(timerName);
  try {
    const response = await fetch(`http://${wledFixture.address}/json/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': wledFixture.address,
      },
      body: json,
    });
    if (!response.ok) {
      console.error(response.body);
    }
  } finally {
    console.timeEnd(timerName);
  }
}

export function outputIdToHumanReadable(
  project: Project,
  outputId: WLEDOutputId,
) {
  const fixture = project.wled!.fixtures[String(outputId.fixtureId)]!;

  let name = '';
  switch (outputId.output.case) {
    case 'groupId':
      name = fixture.groups[String(outputId.output.value)].name;
      break;
    case 'segmentId':
      name =
        fixture.segments[outputId.output.value].name ??
        `Segment ${outputId.output.value}`;
      break;
    default:
      throw Error(`Unexpected WLED output type: ${outputId.output.case}`);
  }
  return `${fixture.name}: ${name}`;
}
