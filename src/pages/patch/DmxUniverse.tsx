import { create } from '@bufbuild/protobuf';
import { JSX, useContext, useMemo, useState } from 'react';

import {
  QualifiedFixtureIdSchema,
  SacnDmxOutput,
  SerialDmxOutput,
} from '@dmx-controller/proto/output_pb';
import { Button } from '../../components/Button';
import { NumberInput, TextInput } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Warning } from '../../components/Warning';
import { ProjectContext } from '../../contexts/ProjectContext';
import { ANGLE_CHANNELS } from '../../engine/channel';
import { deleteFixture } from '../../engine/fixtures/fixture';
import { getOutput } from '../../util/projectUtils';

import {
  DmxFixtureDefinition,
  PhysicalDmxFixture,
  PhysicalDmxFixtureSchema,
} from '@dmx-controller/proto/dmx_pb';
import { VersatileElement } from '../../components/VersatileElement';
import { DraggableDmxFixture } from './DmxEditor';
import styles from './PatchPage.module.scss';

type DmxOutput = SacnDmxOutput | SerialDmxOutput;

interface DmxUniverse {
  outputId: bigint;
}

export function DmxUniverse({ outputId }: DmxUniverse): JSX.Element | null {
  const { project, save, update } = useContext(ProjectContext);
  const [selectedFixtureId, setSelectedFixtureId] = useState<bigint | null>(
    null,
  );

  const output = useMemo(
    () => getOutput(project, outputId).output.value as DmxOutput,
    [project, outputId],
  );

  const selectedFixture = useMemo(() => {
    if (!selectedFixtureId) {
      return undefined;
    }
    return output.fixtures[selectedFixtureId?.toString()];
  }, [output, selectedFixtureId]);

  interface ChannelInfo {
    fixtureName: string;
    type: string;
    startChannel: DraggableDmxFixture | undefined;
  }

  const channels = useMemo(() => {
    const channels: Array<Array<ChannelInfo>> = [];
    for (let i = 0; i < 512; ++i) {
      channels[i] = [];
    }

    // Map all fixtures to their channels.
    const output = getOutput(project, outputId).output.value as DmxOutput;
    for (const [id, fixture] of Object.entries(output.fixtures)) {
      if (fixture.channelOffset === -1) {
        break;
      }

      const definition =
        project.fixtureDefinitions!.dmxFixtureDefinitions[
          fixture.fixtureDefinitionId.toString()
        ];

      const mode = definition?.modes[fixture.fixtureMode];

      for (let c = 0; c < mode.numChannels; ++c) {
        const channel = mode.channels[c + 1];

        channels[c + fixture.channelOffset].push({
          fixtureName: fixture.name,
          type: channel?.type,
          startChannel:
            c === 0
              ? {
                  id: BigInt(id),
                  definition: fixture.fixtureDefinitionId,
                  mode: fixture.fixtureMode,
                }
              : undefined,
        });
      }
    }

    // Remove channels that aren't doing anything.
    for (let c = 500; c > 10; c -= 10) {
      if (channels.slice(c - 10).every((ci) => ci.length === 0)) {
        channels.length = c;
      } else {
        break;
      }
    }

    return channels;
  }, [project]);

  return (
    <div className={styles.grow}>
      <div className={styles.universeGrid}>
        {channels.map((ciArray, i) => {
          const classes = [styles.channel];

          let channelDescriptions: JSX.Element;

          if (ciArray.length > 1) {
            classes.push(styles.warning);
            channelDescriptions = (
              <div className={styles.collisionWarning}>
                Collision:
                {ciArray.map((ci, i) => (
                  <div key={i}>{ci.fixtureName}</div>
                ))}
              </div>
            );
          } else {
            channelDescriptions = (
              <>
                {ciArray.map((ci, i) => (
                  <div
                    key={i}
                    className={styles.channelDescription}
                    title={`${ci.fixtureName}: ${ci.type || 'unset'}`}
                  >
                    <div className={styles.fixtureName}>{ci.fixtureName}:</div>
                    <div className={styles.channelType}>
                      {ci.type || 'unset'}
                    </div>
                  </div>
                ))}
              </>
            );
          }

          const fixtureStartCi = ciArray.find((ci) => ci.startChannel);
          if (fixtureStartCi) {
            classes.push(styles.startChannel);
          }

          return (
            <VersatileElement
              key={i}
              className={classes.join(' ')}
              id={fixtureStartCi?.startChannel?.id}
              element={fixtureStartCi?.startChannel}
              onClick={
                fixtureStartCi?.startChannel
                  ? () => {
                      setSelectedFixtureId(fixtureStartCi.startChannel!.id);
                    }
                  : undefined
              }
              onDragOver={
                fixtureStartCi == null
                  ? (f: DraggableDmxFixture) => {
                      const existingFixture = output.fixtures[String(f.id)];
                      if (existingFixture) {
                        existingFixture.channelOffset = i;
                      } else {
                        output.fixtures[String(f.id)] = create(
                          PhysicalDmxFixtureSchema,
                          {
                            name: 'New Fixture',
                            channelOffset: i,
                            fixtureDefinitionId: f.definition,
                            fixtureMode: f.mode,
                          },
                        );
                      }
                      update();
                    }
                  : undefined
              }
              onDragComplete={
                fixtureStartCi?.startChannel
                  ? () => {
                      const output = getOutput(project, outputId);
                      if (
                        output.output.case !== 'serialDmxOutput' &&
                        output.output.case !== 'sacnDmxOutput'
                      ) {
                        throw Error('Tried to edit non DMX output!');
                      }
                      const fixture =
                        output.output.value.fixtures[
                          String(fixtureStartCi.startChannel!.id)
                        ];
                      save(
                        `Move fixture ${fixture.name} to offset ${fixture.channelOffset + 1}.`,
                      );
                    }
                  : undefined
              }
            >
              <div className={styles.channelNumber}>{i + 1}</div>
              {channelDescriptions}
            </VersatileElement>
          );
        })}
      </div>
      {selectedFixture && (
        <EditFixtureDialog
          fixture={selectedFixture}
          close={() => setSelectedFixtureId(null)}
          onDelete={() => {
            if (selectedFixtureId == null) {
              throw new Error('SelectedFixture ID was not set!');
            }
            const output = getOutput(project, outputId).output
              .value as DmxOutput;
            const name = output.fixtures[selectedFixtureId.toString()].name;
            deleteFixture(
              project,
              create(QualifiedFixtureIdSchema, {
                patch: project.activePatch,
                output: outputId,
                fixture: selectedFixtureId,
              }),
            );
            save(`Delete fixture ${name}.`);
          }}
        />
      )}
    </div>
  );
}

interface EditFixtureDialogProps {
  fixture: PhysicalDmxFixture;
  close: () => void;
  onDelete: () => void;
}

function EditFixtureDialog({
  fixture,
  close,
  onDelete,
}: EditFixtureDialogProps): JSX.Element {
  const { project, save } = useContext(ProjectContext);

  const definition: DmxFixtureDefinition | undefined = useMemo(
    () =>
      project.fixtureDefinitions!.dmxFixtureDefinitions[
        fixture.fixtureDefinitionId.toString()
      ],
    [project, fixture],
  );

  return (
    <Modal
      title={'Edit ' + fixture.name}
      onClose={close}
      bodyClass={styles.editor}
      footer={
        <div className={styles.dialogFooter}>
          <Button onClick={close} variant="primary">
            Done
          </Button>
        </div>
      }
    >
      <div>
        <Button variant="warning" onClick={onDelete}>
          Delete Fixture
        </Button>
      </div>
      <label>
        <span>Name</span>
        <TextInput
          value={fixture.name}
          onChange={(v) => {
            fixture.name = v;
            save(`Change fixture name to ${v}.`);
          }}
        />
      </label>
      <label>
        <span>Profile</span>
        <select
          value={fixture.fixtureDefinitionId.toString()}
          onChange={(e) => {
            fixture.fixtureDefinitionId = BigInt(e.target.value);
            fixture.fixtureMode = Object.keys(
              project.fixtureDefinitions!.dmxFixtureDefinitions[
                fixture.fixtureDefinitionId.toString()
              ].modes,
            )[0];
            let definitionName = '<unset>';
            if (fixture.fixtureDefinitionId.toString() !== '') {
              definitionName =
                project.fixtureDefinitions!.dmxFixtureDefinitions[
                  fixture.fixtureDefinitionId.toString()
                ].name;
            }
            save(
              `Change fixture profile for ${fixture.name} to ${definitionName}`,
            );
          }}
        >
          <option key="unset" value={''}>
            &lt;unset&gt;
          </option>
          {Object.entries(project.fixtureDefinitions!.dmxFixtureDefinitions)
            .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
            .map(([id, definition]) => (
              <option key={id} value={id}>
                {definition.name}
              </option>
            ))}
        </select>
        <select
          value={fixture.fixtureMode}
          onChange={(e) => {
            fixture.fixtureMode = e.target.value;
            let modeName = '<unset>';
            if (fixture.fixtureMode !== '') {
              modeName =
                project.fixtureDefinitions!.dmxFixtureDefinitions[
                  fixture.fixtureDefinitionId.toString()
                ].modes[fixture.fixtureMode].name;
            }
            save(`Change fixture profile for ${fixture.name} to ${modeName}`);
          }}
        >
          <option disabled={true} key="unset" value={''}>
            &lt;unset&gt;
          </option>
          {Object.entries(
            project.fixtureDefinitions!.dmxFixtureDefinitions[
              fixture.fixtureDefinitionId.toString()
            ]?.modes || {},
          )
            .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
            .map(([id, mode]) => (
              <option key={id} value={id}>
                {mode.name}
              </option>
            ))}
        </select>
        {(fixture.fixtureDefinitionId.toString() == '' ||
          fixture.fixtureMode == '') && (
          <Warning title="Fixture does not have profile set!" />
        )}
      </label>
      <label>
        <span>Channel</span>
        <NumberInput
          min={1}
          max={512}
          value={fixture.channelOffset + 1}
          onChange={(v) => {
            fixture.channelOffset = v - 1;
            save(`Change channel offset of ${fixture.name} to ${v}.`);
          }}
        />
      </label>
      {definition != null &&
        ANGLE_CHANNELS.filter((t) =>
          Object.values(definition.channels).some((c) => c.type === t),
        ).map((t, i) => (
          <label key={i}>
            <span>{t.charAt(0).toUpperCase() + t.slice(1)} Offset</span>
            <NumberInput
              min={-360}
              max={360}
              value={fixture.channelOffsets[t] || 0}
              onChange={(v) => {
                fixture.channelOffsets[t] = v;
                save(`Change ${t} offset of ${fixture.name} to ${v}.`);
              }}
            />
          </label>
        ))}
    </Modal>
  );
}
