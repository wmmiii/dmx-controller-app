import { create } from '@bufbuild/protobuf';
import {
  ControllerBindingsMapSchema,
  ControllerBindingsMap_ControllerBindingsSchema,
  InputBindingSchema,
  InputType,
} from '@dmx-controller/proto/controller_pb';
import { SceneSchema } from '@dmx-controller/proto/scene_pb';
import { randomUint64 } from '../util/numberUtils';
import { createNewProject } from '../util/projectUtils';
import { getActiveScene } from '../util/sceneUtils';
import {
  assignAction,
  contextName,
  debounceInput,
  deleteAction,
  deleteBindings,
  findBinding,
  getActionDescription,
  getAllBindingsForAction,
  hasAction,
  performAction,
  type BindingContext,
} from './externalController';

const BINDING_ID = 1n;
const CHANNEL_NAME = '176, 1';
const CHANNEL_NAME_2 = '176, 2';

describe('externalController', () => {
  jest.useFakeTimers().setSystemTime(new Date('2000-01-01'));

  describe('performAction', () => {
    it('should ignore unknown binding', () => {
      const project = createNewProject();
      let beatSample: number | null = null;
      const addBeatSample = (t: number) => (beatSample = t);
      let firstBeat: number | null = null;
      const setFirstBeat = (t: number) => (firstBeat = t);
      let beat: number | null = null;
      const setBeat = (durationMs: number) => (beat = durationMs);

      const result = performAction(
        project,
        999n, // Unknown binding ID
        CHANNEL_NAME,
        1,
        null,
        addBeatSample,
        setFirstBeat,
        setBeat,
      );

      expect(result).toBe(false);
      expect(beatSample).toBeNull();
      expect(firstBeat).toBeNull();
      expect(beat).toBeNull();
    });

    it('should add beat match', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      let beatSample: number | null = null;
      const addBeatSample = (t: number) => (beatSample = t);
      let firstBeat: number | null = null;
      const setFirstBeat = (t: number) => (firstBeat = t);
      let beat: number | null = null;
      const setBeat = (durationMs: number) => (beat = durationMs);

      const result = performAction(
        project,
        BINDING_ID,
        CHANNEL_NAME,
        1,
        null,
        addBeatSample,
        setFirstBeat,
        setBeat,
      );

      expect(result).toBe(false);
      expect(beatSample).toEqual(946684800000);
      expect(firstBeat).toBeNull();
      expect(beat).toBeNull();
    });

    it('should set color palette', () => {
      const newPaletteId = randomUint64();
      const project = createNewProject();
      const scene = getActiveScene(project);
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'colorPalette',
                    value: { paletteId: newPaletteId },
                  },
                }),
              },
            },
          ),
        },
      });

      performAction(
        project,
        BINDING_ID,
        CHANNEL_NAME,
        1,
        null,
        () => fail('should not set beat match'),
        () => fail('should not set first beat'),
        () => fail('should not set beat'),
      );

      expect(getActiveScene(project).activeColorPalette).toEqual(newPaletteId);
    });
  });

  describe('assignAction', () => {
    it('should add beat action', () => {
      const project = createNewProject();

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      assignAction(project, BINDING_ID, CHANNEL_NAME, action);

      expect(
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings[CHANNEL_NAME],
      ).toEqual(action);
    });

    it('should replace beat action on same channel', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'firstBeat',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      assignAction(project, BINDING_ID, CHANNEL_NAME, action);

      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toEqual(action);
    });

    it('should allow multiple channels to have the same action', () => {
      const project = createNewProject();

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      // Assign to first channel
      assignAction(project, BINDING_ID, CHANNEL_NAME, action);

      // Assign same action to second channel
      assignAction(project, BINDING_ID, CHANNEL_NAME_2, action);

      // Both channels should have the action
      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toEqual(action);
      expect(bindings?.[CHANNEL_NAME_2]).toEqual(action);
    });

    it('should add scene-specific action', () => {
      const tileId = randomUint64();
      const project = createNewProject();

      const action = create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'tileStrength',
          value: { tileId },
        },
      });

      assignAction(project, BINDING_ID, CHANNEL_NAME, action);

      const scene = getActiveScene(project);
      expect(
        scene.controllerBindings?.bindings[BINDING_ID.toString()]?.bindings[
          CHANNEL_NAME
        ],
      ).toEqual(action);
    });
  });

  describe('hasAction', () => {
    it('should have beat action', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      expect(hasAction(project, BINDING_ID, action)).toBeTruthy();
    });

    it('should have palette action', () => {
      const paletteId = randomUint64();
      const project = createNewProject();
      const scene = getActiveScene(project);
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'colorPalette',
                    value: { paletteId },
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'colorPalette',
          value: { paletteId },
        },
      });

      expect(hasAction(project, BINDING_ID, action)).toBeTruthy();
    });

    it('should have tile action', () => {
      const tileId = randomUint64();
      const project = createNewProject();
      const scene = getActiveScene(project);
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'tileStrength',
          value: { tileId },
        },
      });

      expect(hasAction(project, BINDING_ID, action)).toBeTruthy();
    });

    it('should return true when action exists on any channel', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      expect(hasAction(project, BINDING_ID, action)).toBeTruthy();
    });
  });

  describe('deleteAction', () => {
    it('should delete only the specified channel binding', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      // Delete from first channel only
      deleteAction(project, BINDING_ID, CHANNEL_NAME);

      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings?.[CHANNEL_NAME_2]).toBeDefined();
    });

    it('should delete from scene bindings', () => {
      const tileId = randomUint64();
      const project = createNewProject();
      const scene = getActiveScene(project);
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      deleteAction(project, BINDING_ID, CHANNEL_NAME);

      const bindings =
        scene.controllerBindings?.bindings[BINDING_ID.toString()]?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
    });
  });

  describe('getAllBindingsForAction', () => {
    it('should return all channels with the action', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      const result = getAllBindingsForAction(project, action);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        bindingId: BINDING_ID,
        channel: CHANNEL_NAME,
        context: { type: 'live_page' },
      });
      expect(result).toContainEqual({
        bindingId: BINDING_ID,
        channel: CHANNEL_NAME_2,
        context: { type: 'live_page' },
      });
    });

    it('should include bindings from both global and scene contexts', () => {
      const tileId = randomUint64();
      const project = createNewProject();

      // Add global binding
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      // Add scene binding
      const scene = getActiveScene(project);
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.CONTINUOUS,
        action: {
          case: 'tileStrength',
          value: { tileId },
        },
      });

      const result = getAllBindingsForAction(project, action);

      expect(result).toHaveLength(2);
      const sceneId = project.activeScene;
      expect(result).toContainEqual({
        bindingId: BINDING_ID,
        channel: CHANNEL_NAME,
        context: { type: 'live_page' },
      });
      expect(result).toContainEqual({
        bindingId: BINDING_ID,
        channel: CHANNEL_NAME_2,
        context: { type: 'scene', sceneId },
      });
    });

    it('should not include bindings with different actions', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'firstBeat',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const action = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      const result = getAllBindingsForAction(project, action);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bindingId: BINDING_ID,
        channel: CHANNEL_NAME,
        context: { type: 'live_page' },
      });
    });
  });

  describe('deleteBindings', () => {
    it('should delete tile bindings from global context', () => {
      const tileId = randomUint64();
      const project = createNewProject();

      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      deleteBindings(
        project,
        (action) =>
          action.case === 'tileStrength' && action.value.tileId === tileId,
      );

      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings?.[CHANNEL_NAME_2]).toBeDefined(); // Beat match should remain
    });

    it('should delete tile bindings from scene context', () => {
      const tileId = randomUint64();
      const project = createNewProject();
      const scene = getActiveScene(project);

      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      deleteBindings(
        project,
        (action) =>
          action.case === 'tileStrength' && action.value.tileId === tileId,
      );

      const bindings =
        scene.controllerBindings?.bindings[BINDING_ID.toString()]?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
    });

    it('should delete tile bindings from multiple controllers', () => {
      const tileId = randomUint64();
      const BINDING_ID_2 = 2n;
      const project = createNewProject();

      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
          [BINDING_ID_2.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      deleteBindings(
        project,
        (action) =>
          action.case === 'tileStrength' && action.value.tileId === tileId,
      );

      const bindings1 =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      const bindings2 =
        project.livePageControllerBindings?.bindings[BINDING_ID_2.toString()]
          ?.bindings;
      expect(bindings1?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings2?.[CHANNEL_NAME]).toBeUndefined();
    });

    it('should not delete bindings for different tiles', () => {
      const tileId1 = randomUint64();
      const tileId2 = randomUint64();
      const project = createNewProject();

      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId: tileId1 },
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId: tileId2 },
                  },
                }),
              },
            },
          ),
        },
      });

      deleteBindings(
        project,
        (action) =>
          action.case === 'tileStrength' && action.value.tileId === tileId1,
      );

      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings?.[CHANNEL_NAME_2]).toBeDefined(); // tileId2 should remain
    });

    it('should delete tile bindings from all scenes', () => {
      const tileId = randomUint64();
      const sceneId2 = randomUint64();
      const project = createNewProject();
      const scene1 = getActiveScene(project);

      // Add binding in scene 1
      scene1.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'tileStrength',
                    value: { tileId },
                  },
                }),
              },
            },
          ),
        },
      });

      // Create scene 2 with binding
      project.scenes[sceneId2.toString()] = create(SceneSchema, {
        name: 'Scene 2',
        controllerBindings: create(ControllerBindingsMapSchema, {
          bindings: {
            [BINDING_ID.toString()]: create(
              ControllerBindingsMap_ControllerBindingsSchema,
              {
                bindings: {
                  [CHANNEL_NAME_2]: create(InputBindingSchema, {
                    inputType: InputType.CONTINUOUS,
                    action: {
                      case: 'tileStrength',
                      value: { tileId },
                    },
                  }),
                },
              },
            ),
          },
        }),
      });

      deleteBindings(
        project,
        (action) =>
          action.case === 'tileStrength' && action.value.tileId === tileId,
      );

      const bindings1 =
        scene1.controllerBindings?.bindings[BINDING_ID.toString()]?.bindings;
      const scene2 = project.scenes[sceneId2.toString()];
      const bindings2 =
        scene2?.controllerBindings?.bindings[BINDING_ID.toString()]?.bindings;

      expect(bindings1?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings2?.[CHANNEL_NAME_2]).toBeUndefined();
    });

    it('should delete all bindings matching predicate', () => {
      const project = createNewProject();

      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
                [CHANNEL_NAME_2]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'firstBeat',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      // Delete all beat-related actions
      deleteBindings(
        project,
        (action) => action.case === 'beatMatch' || action.case === 'firstBeat',
      );

      const bindings =
        project.livePageControllerBindings?.bindings[BINDING_ID.toString()]
          ?.bindings;
      expect(bindings?.[CHANNEL_NAME]).toBeUndefined();
      expect(bindings?.[CHANNEL_NAME_2]).toBeUndefined();
    });
  });

  describe('contextName', () => {
    it('should return name for live page context', () => {
      const project = createNewProject();
      const context: BindingContext = { type: 'live_page' };

      expect(contextName(project, context)).toBe('Live page');
    });

    it('should return name for scene context', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);
      scene.name = 'Test Scene';

      const context: BindingContext = {
        type: 'scene',
        sceneId: project.activeScene,
      };

      expect(contextName(project, context)).toBe('Scene "Test Scene"');
    });
  });

  describe('findBinding', () => {
    it('should find binding in current context', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);

      const binding = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: binding,
              },
            },
          ),
        },
      });

      const context: BindingContext = {
        type: 'scene',
        sceneId: project.activeScene,
      };

      const result = findBinding(project, BINDING_ID, CHANNEL_NAME, context);

      expect(result).toEqual(binding);
    });

    it('should find binding in parent context (inheritance)', () => {
      const project = createNewProject();

      const binding = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      // Add binding to live page (parent of scene)
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: binding,
              },
            },
          ),
        },
      });

      // Search from scene context
      const context: BindingContext = {
        type: 'scene',
        sceneId: project.activeScene,
      };

      const result = findBinding(project, BINDING_ID, CHANNEL_NAME, context);

      expect(result).toEqual(binding);
    });

    it('should return scene binding over live page binding (override)', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);

      const livePageBinding = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      const sceneBinding = create(InputBindingSchema, {
        inputType: InputType.BINARY,
        action: {
          case: 'firstBeat',
          value: {},
        },
      });

      // Add binding to live page
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: livePageBinding,
              },
            },
          ),
        },
      });

      // Add different binding to scene (should override)
      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: sceneBinding,
              },
            },
          ),
        },
      });

      const context: BindingContext = {
        type: 'scene',
        sceneId: project.activeScene,
      };

      const result = findBinding(project, BINDING_ID, CHANNEL_NAME, context);

      expect(result).toEqual(sceneBinding);
    });

    it('should return null when binding not found', () => {
      const project = createNewProject();

      const context: BindingContext = {
        type: 'scene',
        sceneId: project.activeScene,
      };

      const result = findBinding(project, BINDING_ID, CHANNEL_NAME, context);

      expect(result).toBeNull();
    });
  });

  describe('getActionDescription', () => {
    it('should return description for beatMatch action', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);

      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const result = getActionDescription(
        project,
        project.activeScene,
        BINDING_ID,
        CHANNEL_NAME,
      );

      expect(result).toBe('Samples the beat during beat-matching.');
    });

    it('should return description for firstBeat action', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);

      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'firstBeat',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const result = getActionDescription(
        project,
        project.activeScene,
        BINDING_ID,
        CHANNEL_NAME,
      );

      expect(result).toBe('Sets the first beat in a bar.');
    });

    it('should return description for setTempo action', () => {
      const project = createNewProject();
      const scene = getActiveScene(project);

      scene.controllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'setTempo',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      const result = getActionDescription(
        project,
        project.activeScene,
        BINDING_ID,
        CHANNEL_NAME,
      );

      expect(result).toBe('Sets the absolute BPM.');
    });

    it('should return null when no binding found', () => {
      const project = createNewProject();

      const result = getActionDescription(
        project,
        project.activeScene,
        BINDING_ID,
        CHANNEL_NAME,
      );

      expect(result).toBeNull();
    });

    it('should return null when scene not found', () => {
      const project = createNewProject();

      const result = getActionDescription(
        project,
        999n,
        BINDING_ID,
        CHANNEL_NAME,
      );

      expect(result).toBeNull();
    });
  });

  describe('performAction - additional action types', () => {
    it('should set first beat', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'firstBeat',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      let firstBeat: number | null = null;
      const setFirstBeat = (t: number) => (firstBeat = t);

      const result = performAction(
        project,
        BINDING_ID,
        CHANNEL_NAME,
        1,
        null,
        () => fail('should not add beat sample'),
        setFirstBeat,
        () => fail('should not set beat'),
      );

      expect(result).toBe(false);
      expect(firstBeat).toEqual(946684800000);
    });

    it('should set tempo', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.CONTINUOUS,
                  action: {
                    case: 'setTempo',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      let beat: number | null = null;
      const setBeat = (durationMs: number) => (beat = durationMs);

      const result = performAction(
        project,
        BINDING_ID,
        CHANNEL_NAME,
        0.5, // Mid-range value
        null,
        () => fail('should not add beat sample'),
        () => fail('should not set first beat'),
        setBeat,
      );

      expect(result).toBe(true);
      // value 0.5 -> BPM = floor(0.5 * 127 + 80) = 143
      // beat duration = 60000 / 143 ≈ 419.58
      expect(beat).toBeCloseTo(60_000 / 143, 0);
    });

    it('should not add beat match when value below threshold', () => {
      const project = createNewProject();
      project.livePageControllerBindings = create(ControllerBindingsMapSchema, {
        bindings: {
          [BINDING_ID.toString()]: create(
            ControllerBindingsMap_ControllerBindingsSchema,
            {
              bindings: {
                [CHANNEL_NAME]: create(InputBindingSchema, {
                  inputType: InputType.BINARY,
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                }),
              },
            },
          ),
        },
      });

      let beatSample: number | null = null;
      const addBeatSample = (t: number) => (beatSample = t);

      performAction(
        project,
        BINDING_ID,
        CHANNEL_NAME,
        0.3, // Below 0.5 threshold
        null,
        addBeatSample,
        () => fail('should not set first beat'),
        () => fail('should not set beat'),
      );

      expect(beatSample).toBeNull();
    });
  });

  describe('debounceInput', () => {
    beforeEach(() => {
      jest.clearAllTimers();
    });

    it('should execute immediately for lsb', () => {
      let executed = false;
      const action = () => {
        executed = true;
      };

      debounceInput('lsb', action);

      expect(executed).toBe(true);
    });

    it('should execute immediately for null', () => {
      let executed = false;
      const action = () => {
        executed = true;
      };

      debounceInput(null, action);

      expect(executed).toBe(true);
    });

    it('should delay execution for msb', () => {
      let executed = false;
      const action = () => {
        executed = true;
      };

      debounceInput('msb', action);

      expect(executed).toBe(false);

      jest.advanceTimersByTime(100);

      expect(executed).toBe(true);
    });

    it('should clear previous timeout when new lsb arrives', () => {
      let executed = false;
      const action = () => {
        executed = true;
      };

      // First msb
      debounceInput('msb', () => {});

      // Then lsb should clear and execute immediately
      debounceInput('lsb', action);

      expect(executed).toBe(true);
    });
  });
});
