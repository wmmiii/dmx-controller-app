import { create } from '@bufbuild/protobuf';
import {
  Output,
  OutputSchema,
  PatchSchema,
} from '@dmx-controller/proto/output_pb';
import { JSX, useContext, useState } from 'react';
import { BiPlus, BiTrash } from 'react-icons/bi';
import {
  Navigate,
  Outlet,
  Route,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';

import { Button } from '../../components/Button';
import { EditableText } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Tabs, TabsType } from '../../components/Tabs';
import { ProjectContext } from '../../contexts/ProjectContext';
import { deleteDdpOutput } from '../../engine/display';
import { randomUint64 } from '../../util/numberUtils';
import {
  deleteFromOutputTargets,
  getActivePatch,
} from '../../util/projectUtils';
import { sortedEntries } from '../../util/sortUtils';
import { ArtnetEditor } from './ArtnetEditor';
import { DdpEditor } from './DdpEditor';
import { displaysRoutes } from './DisplayEditor';
import { groupsRoutes } from './GroupEditor';
import styles from './PatchPage.module.css';
import { SacnEditor } from './SacnEditor';
import { SerialEditor } from './SerialEditor';
import { visualizersRoutes } from './VisualizerEditor';
import { WledEditor } from './WledEditor';

const NEW_OUTPUT_KEY = 'new';

export const patchRoutes = (
  <Route path="patch" element={<PatchLayout />}>
    <Route index element={<Navigate to="/patch/groups" replace />} />
    {groupsRoutes}
    {displaysRoutes}
    {visualizersRoutes}
    <Route path="output/:outputId" element={<OutputEditor />} />
  </Route>
);

function PatchLayout(): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const navigate = useNavigate();
  const { outputId } = useParams();
  const { pathname } = useLocation();
  const [showNewOutputDialog, setShowNewOutputDialog] = useState(false);

  const activePatch = getActivePatch(project);

  let selectedTab: string;
  if (outputId != null) {
    selectedTab = outputId;
  } else if (pathname.startsWith('/patch/displays')) {
    selectedTab = 'displays';
  } else if (pathname.startsWith('/patch/visualizers')) {
    selectedTab = 'visualizers';
  } else {
    selectedTab = 'groups';
  }

  // Redirect stale/foreign output ids up to the default tab.
  if (outputId != null && activePatch.outputs[outputId] == null) {
    return <Navigate to="/patch/groups" replace />;
  }

  // Displays/Visualizers chips are normally shown only when there's something
  // to map, but stay reachable via direct links/resume - so also show them
  // whenever one of those routes is active.
  const hasDisplays = Object.keys(project.displays).length > 0;
  const hasDdpOutputs = Object.values(activePatch.outputs).some(
    (o) => o.output.case === 'ddpOutput',
  );
  const showDisplaysTab =
    hasDisplays ||
    hasDdpOutputs ||
    selectedTab === 'displays' ||
    selectedTab === 'visualizers';

  const outlet = <Outlet />;

  const tabs: TabsType = {
    groups: {
      name: 'Groups',
      contents: outlet,
    },
    ...(showDisplaysTab && {
      displays: {
        name: 'Displays',
        contents: outlet,
      },
      visualizers: {
        name: 'Visualizers',
        contents: outlet,
      },
    }),
  };

  for (const [outputIdString, output] of sortedEntries(activePatch.outputs)) {
    tabs[outputIdString] = {
      name: (
        <OutputTabHeader
          output={output}
          outputId={BigInt(outputIdString)}
          selected={selectedTab === outputIdString}
          onDeleted={() => navigate('/patch/groups')}
        />
      ),
      contents: outlet,
    };
  }
  tabs[NEW_OUTPUT_KEY] = {
    name: <BiPlus />,
    contents: outlet,
  };

  const setTab = (key: string) => {
    switch (key) {
      case NEW_OUTPUT_KEY:
        setShowNewOutputDialog(true);
        break;
      case 'groups':
        navigate('/patch/groups');
        break;
      case 'displays':
        navigate('/patch/displays');
        break;
      case 'visualizers':
        navigate('/patch/visualizers');
        break;
      default:
        navigate(`/patch/output/${key}`);
    }
  };

  return (
    <div className={styles.wrapper}>
      <Tabs
        className={styles.tabWrapper}
        selectedTab={selectedTab}
        setSelectedTab={(tab) => setTab(tab)}
        tabs={tabs}
        before={
          <div className={styles.patch}>
            <Select
              value={project.activePatch.toString()}
              onChange={(value) => {
                if (value === 'new') {
                  const id = randomUint64();
                  project.patches[id.toString()] = create(PatchSchema, {
                    name: 'New Patch',
                    outputs: {},
                  });
                  project.activePatch = id;
                  save('Create a new patch.');
                } else {
                  project.activePatch = BigInt(value);
                  save(
                    `Change active patch to ${getActivePatch(project).name}.`,
                  );
                }
              }}
              options={[
                ...Object.entries(project.patches).map(([i, p]) => ({
                  value: i.toString(),
                  label: p.name,
                })),
                { value: 'new', label: '+ Add new patch' },
              ]}
            />
            <EditableText
              value={getActivePatch(project).name}
              onChange={(v) => {
                getActivePatch(project).name = v;
                save(`Set patch name to "${v}".`);
              }}
            />
          </div>
        }
      />
      {showNewOutputDialog && (
        <Modal
          title="Create new output"
          bodyClass={styles.createNew}
          onClose={() => setShowNewOutputDialog(false)}
          footer={
            <>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DMX Serial Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'serialDmxOutput',
                        value: {
                          fixtures: {},
                        },
                      },
                    },
                  );
                  save('Create Serial DMX output.');
                  navigate(`/patch/output/${id}`);
                  setShowNewOutputDialog(false);
                }}
              >
                Serial Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DMX SACN Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'sacnDmxOutput',
                        value: {
                          ipAddress: '0.0.0.0',
                          fixtures: {},
                        },
                      },
                    },
                  );
                  save('Create SACN DMX output.');
                  navigate(`/patch/output/${id}`);
                  setShowNewOutputDialog(false);
                }}
              >
                SACN Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DMX Art-Net Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'artnetDmxOutput',
                        value: {
                          ipAddress: '0.0.0.0',
                          fixtures: {},
                        },
                      },
                    },
                  );
                  save('Create Art-Net DMX output.');
                  navigate(`/patch/output/${id}`);
                  setShowNewOutputDialog(false);
                }}
              >
                Art-Net Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'WLED Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'wledOutput',
                        value: {
                          segments: {},
                        },
                      },
                    },
                  );
                  save('Create WLED output.');
                  navigate(`/patch/output/${id}`);
                  setShowNewOutputDialog(false);
                }}
              >
                WLED Output
              </Button>
              <Button
                onClick={() => {
                  const id = randomUint64();
                  getActivePatch(project).outputs[id.toString()] = create(
                    OutputSchema,
                    {
                      name: 'DDP Output',
                      latencyMs: 0,
                      enabled: true,
                      output: {
                        case: 'ddpOutput',
                        value: {
                          ipAddress: '',
                        },
                      },
                    },
                  );
                  save('Create DDP output.');
                  navigate(`/patch/output/${id}`);
                  setShowNewOutputDialog(false);
                }}
              >
                DDP Output
              </Button>
            </>
          }
        >
          <p>Which type of output would you like to create?</p>
        </Modal>
      )}
    </div>
  );
}

function OutputEditor(): JSX.Element {
  const { project } = useContext(ProjectContext);
  const { outputId } = useParams();

  const activePatch = getActivePatch(project);
  const output = outputId != null ? activePatch.outputs[outputId] : undefined;
  if (outputId == null || output == null) {
    return <Navigate to="/patch/groups" replace />;
  }

  const id = BigInt(outputId);
  switch (output.output.case) {
    case 'sacnDmxOutput':
      return <SacnEditor outputId={id} />;
    case 'artnetDmxOutput':
      return <ArtnetEditor outputId={id} />;
    case 'serialDmxOutput':
      return <SerialEditor outputId={id} />;
    case 'wledOutput':
      return <WledEditor outputId={id} />;
    case 'ddpOutput':
      return <DdpEditor outputId={id} />;
    case undefined:
      // Corrupted or legacy output with no type - show error so user can delete it.
      return (
        <p style={{ color: 'var(--red-9)', padding: '1rem' }}>
          This output has no type set (corrupted or legacy data). Please delete
          it using the trash icon in the tab header and recreate it.
        </p>
      );
    default: {
      const exhaustiveCheck: never = output.output;
      throw Error(
        `Unknown output type in PatchPage! ${(exhaustiveCheck as { case: unknown }).case}`,
      );
    }
  }
}

interface OutputTabHeaderProps {
  output: Output;
  outputId: bigint;
  selected: boolean;
  onDeleted: () => void;
}

function OutputTabHeader({
  output,
  outputId,
  selected,
  onDeleted,
}: OutputTabHeaderProps) {
  const { project, save } = useContext(ProjectContext);
  return (
    <>
      <EditableText
        value={output.name}
        onChange={(name) => {
          output.name = name;
          save(`Change name of output to ${name}.`);
        }}
      />
      {selected && (
        <>
          &nbsp;
          <BiTrash
            size="1em"
            onClick={(ev) => {
              deleteFromOutputTargets(project, (id) => id.output === outputId);
              deleteDdpOutput(project, outputId);

              delete getActivePatch(project).outputs[outputId.toString()];

              onDeleted();
              save(`Delete output ${output.name}.`);
              ev.stopPropagation();
            }}
          />
        </>
      )}
    </>
  );
}
