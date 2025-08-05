import { create } from '@bufbuild/protobuf';
import {
  ControllerMappingSchema,
  ControllerMapping_ActionSchema,
} from '@dmx-controller/proto/controller_pb';
import { ControllerChannel } from '../contexts/ControllerContext';
import { randomUint64 } from '../util/numberUtils';
import { createNewProject } from '../util/projectUtils';
import { getActiveScene } from '../util/sceneUtils';
import {
  assignAction,
  deleteAction,
  hasAction,
  performAction,
} from './externalController';

const CONTROLLER_NAME = 'default_controller';
const CHANNEL_NAME = '123';

describe('externalController', () => {
  jest.useFakeTimers().setSystemTime(new Date('2000-01-01'));

  describe('performAction', () => {
    it('should ignore unknown controller', () => {
      const project = createNewProject();
      let beatSample: number | null = null;
      const addBeatSample = (t: number) => (beatSample = t);
      let output: { channel: ControllerChannel; value: number } | null = null;
      performAction(
        project,
        'unknown',
        CHANNEL_NAME,
        1,
        null,
        addBeatSample,
        (c, v) => {
          output = { channel: c, value: v };
        },
      );

      expect(beatSample).toBeNull();
      expect(output).toEqual({ channel: CHANNEL_NAME, value: 1 });
    });

    it('should add beat match', () => {
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'beatMatch',
                  value: {},
                },
              },
            },
          },
        },
      });
      let beatSample: number | null = null;
      const addBeatSample = (t: number) => (beatSample = t);
      let output: { channel: ControllerChannel; value: number } | null = null;
      performAction(
        project,
        CONTROLLER_NAME,
        CHANNEL_NAME,
        1,
        null,
        addBeatSample,
        (c, v) => {
          output = { channel: c, value: v };
        },
      );

      expect(beatSample).toEqual(946684800000);
      expect(output).toBeNull();
    });

    it('should set color palette', () => {
      const newPaletteId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [project.activeScene.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: newPaletteId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      performAction(
        project,
        CONTROLLER_NAME,
        CHANNEL_NAME,
        1,
        null,
        () => fail('should not set beat match'),
        () => fail('should not set output'),
      );

      expect(getActiveScene(project).activeColorPalette).toEqual(newPaletteId);
    });

    // TODO: Test tile action.
  });

  describe('assignAction', () => {
    it('should add beat action.', () => {
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {},
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      assignAction(project, CONTROLLER_NAME, CHANNEL_NAME, action);

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {
                [CHANNEL_NAME]: {
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                },
              },
            },
          },
        }),
      );
    });

    it('should replace beat action.', () => {
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {},
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      assignAction(project, CONTROLLER_NAME, CHANNEL_NAME, action);

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {
                [CHANNEL_NAME]: {
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                },
              },
            },
          },
        }),
      );
    });

    it('should delete existing beat action.', () => {
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              ['456']: {
                action: {
                  case: 'beatMatch',
                  value: {},
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      assignAction(project, CONTROLLER_NAME, CHANNEL_NAME, action);

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {
                [CHANNEL_NAME]: {
                  action: {
                    case: 'beatMatch',
                    value: {},
                  },
                },
              },
            },
          },
        }),
      );
    });

    it('should add scene mapping action.', () => {
      const otherScene = randomUint64();
      const paletteId = randomUint64();
      const tileId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [otherScene.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: paletteId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [project.activeScene.toString()]: {
                action: {
                  case: 'tileStrengthId',
                  value: tileId,
                },
              },
            },
          },
        },
      });

      assignAction(project, CONTROLLER_NAME, CHANNEL_NAME, action);

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {
                [CHANNEL_NAME]: {
                  action: {
                    case: 'sceneMapping',
                    value: {
                      actions: {
                        [otherScene.toString()]: {
                          action: {
                            case: 'colorPaletteId',
                            value: paletteId,
                          },
                        },
                        [project.activeScene.toString()]: {
                          action: {
                            case: 'tileStrengthId',
                            value: tileId,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
    });
  });

  describe('hasAction', () => {
    it('should have beat action.', () => {
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'beatMatch',
                  value: {},
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'beatMatch',
          value: {},
        },
      });

      expect(hasAction(project, CONTROLLER_NAME, action)).toBeTruthy();
    });

    it('should have palette action.', () => {
      const newPaletteId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [project.activeScene.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: newPaletteId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [project.activeScene.toString()]: {
                action: {
                  case: 'colorPaletteId',
                  value: newPaletteId,
                },
              },
            },
          },
        },
      });

      expect(hasAction(project, CONTROLLER_NAME, action)).toBeTruthy();
    });

    it('should have tile action.', () => {
      const tileId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [project.activeScene.toString()]: {
                        action: {
                          case: 'tileStrengthId',
                          value: tileId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const action = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [project.activeScene.toString()]: {
                action: {
                  case: 'tileStrengthId',
                  value: tileId,
                },
              },
            },
          },
        },
      });

      expect(hasAction(project, CONTROLLER_NAME, action)).toBeTruthy();
    });

    it('should check different scene mappings for different scenes.', () => {
      const sceneA = randomUint64();
      const sceneB = randomUint64();
      const paletteId = randomUint64();
      const tileId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [sceneA.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: paletteId,
                        },
                      },
                      [sceneB.toString()]: {
                        action: {
                          case: 'tileStrengthId',
                          value: tileId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      project.activeScene = sceneA;
      expect(
        hasAction(
          project,
          CONTROLLER_NAME,
          create(ControllerMapping_ActionSchema, {
            action: {
              case: 'sceneMapping',
              value: {
                actions: {
                  [sceneA.toString()]: {
                    action: {
                      case: 'colorPaletteId',
                      value: paletteId,
                    },
                  },
                },
              },
            },
          }),
        ),
      ).toBeTruthy();
      expect(
        hasAction(
          project,
          CONTROLLER_NAME,
          create(ControllerMapping_ActionSchema, {
            action: {
              case: 'sceneMapping',
              value: {
                actions: {
                  [sceneA.toString()]: {
                    action: {
                      case: 'tileStrengthId',
                      value: tileId,
                    },
                  },
                },
              },
            },
          }),
        ),
      ).toBeFalsy();

      project.activeScene = sceneB;
      expect(
        hasAction(
          project,
          CONTROLLER_NAME,
          create(ControllerMapping_ActionSchema, {
            action: {
              case: 'sceneMapping',
              value: {
                actions: {
                  [sceneB.toString()]: {
                    action: {
                      case: 'colorPaletteId',
                      value: paletteId,
                    },
                  },
                },
              },
            },
          }),
        ),
      ).toBeFalsy();
      expect(
        hasAction(
          project,
          CONTROLLER_NAME,
          create(ControllerMapping_ActionSchema, {
            action: {
              case: 'sceneMapping',
              value: {
                actions: {
                  [sceneB.toString()]: {
                    action: {
                      case: 'tileStrengthId',
                      value: tileId,
                    },
                  },
                },
              },
            },
          }),
        ),
      ).toBeTruthy();
    });

    it('should gracefully handle if no action is set for scene.', () => {
      const sceneA = randomUint64();
      const sceneB = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [sceneA.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: randomUint64(),
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const paletteAction = create(ControllerMapping_ActionSchema, {
        action: {
          case: 'sceneMapping',
          value: {
            actions: {
              [sceneB.toString()]: {
                action: {
                  case: 'colorPaletteId',
                  value: randomUint64(),
                },
              },
            },
          },
        },
      });

      project.activeScene = sceneB;
      expect(hasAction(project, CONTROLLER_NAME, paletteAction)).toBeFalsy();
    });
  });

  describe('deleteAction', () => {
    it('should delete from scene mapping.', () => {
      const sceneA = randomUint64();
      const sceneB = randomUint64();
      const paletteId = randomUint64();
      const tileId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [sceneA.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: paletteId,
                        },
                      },
                      [sceneB.toString()]: {
                        action: {
                          case: 'tileStrengthId',
                          value: tileId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      project.activeScene = sceneB;
      deleteAction(
        project,
        CONTROLLER_NAME,
        create(ControllerMapping_ActionSchema, {
          action: {
            case: 'sceneMapping',
            value: {
              actions: {
                [sceneB.toString()]: {
                  action: {
                    case: 'tileStrengthId',
                    value: tileId,
                  },
                },
              },
            },
          },
        }),
      );

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {
                [CHANNEL_NAME]: {
                  action: {
                    case: 'sceneMapping',
                    value: {
                      actions: {
                        [sceneA.toString()]: {
                          action: {
                            case: 'colorPaletteId',
                            value: paletteId,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
    });

    it('should remove action if no children.', () => {
      const paletteId = randomUint64();
      const project = createNewProject();
      project.controllerMapping = create(ControllerMappingSchema, {
        controllers: {
          [CONTROLLER_NAME]: {
            actions: {
              [CHANNEL_NAME]: {
                action: {
                  case: 'sceneMapping',
                  value: {
                    actions: {
                      [project.activeScene.toString()]: {
                        action: {
                          case: 'colorPaletteId',
                          value: paletteId,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      deleteAction(
        project,
        CONTROLLER_NAME,
        create(ControllerMapping_ActionSchema, {
          action: {
            case: 'sceneMapping',
            value: {
              actions: {
                [project.activeScene.toString()]: {
                  action: {
                    case: 'colorPaletteId',
                    value: paletteId,
                  },
                },
              },
            },
          },
        }),
      );

      expect(project.controllerMapping).toEqual(
        create(ControllerMappingSchema, {
          controllers: {
            [CONTROLLER_NAME]: {
              actions: {},
            },
          },
        }),
      );
    });
  });
});
