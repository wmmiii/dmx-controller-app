import { create } from '@bufbuild/protobuf';
import { type Color } from '@dmx-controller/proto/color_pb';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import getUuidByString from 'uuid-by-string';

import {
  AMOUNT_CHANNELS,
  ANGLE_CHANNELS,
  COLOR_CHANNELS,
} from '../engine/channel';

import {
  DmxFixtureDefinition,
  DmxFixtureDefinition_Channel,
  DmxFixtureDefinition_Channel_AmountMapping,
  DmxFixtureDefinition_Channel_AmountMappingSchema,
  DmxFixtureDefinition_Channel_AngleMapping,
  DmxFixtureDefinition_Channel_AngleMappingSchema,
  DmxFixtureDefinition_Channel_ColorWheelMapping,
  DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor,
  DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColorSchema,
  DmxFixtureDefinition_Channel_ColorWheelMappingSchema,
  DmxFixtureDefinition_ChannelSchema,
  DmxFixtureDefinition_Mode,
  DmxFixtureDefinition_ModeSchema,
  DmxFixtureDefinitionSchema,
} from '@dmx-controller/proto/dmx_pb';
import { cieToColor } from './colorUtil';

export async function extractGdtf(arrayBuffer: Blob) {
  // Unzip archive and find XML.
  const zipReader = new ZipReader(new BlobReader(arrayBuffer));
  const entries = await zipReader.getEntries();

  const descriptionEntry = entries.find(
    (e) => e.filename === 'description.xml',
  );
  if (descriptionEntry == null) {
    throw new Error('Could not read GDTF file!');
  }

  const descriptionXml = await descriptionEntry.getData!(new TextWriter());
  const description = new window.DOMParser().parseFromString(
    descriptionXml,
    'text/xml',
  );

  const type = description.querySelector('FixtureType');

  const definition = create(DmxFixtureDefinitionSchema, {
    globalId: getAttributeNotEmpty(type, 'FixtureTypeID'),
    name: getAttributeNotEmpty(type, 'LongName'),
    manufacturer: getAttributeNotEmpty(type, 'Manufacturer'),
  }) as DmxFixtureDefinition;

  const modes = description.querySelectorAll('DMXMode');

  for (const modeElement of Array.from(modes)) {
    const mode = create(DmxFixtureDefinition_ModeSchema, {
      name: getAttributeNotEmpty(modeElement, 'Name'),
    }) as DmxFixtureDefinition_Mode;

    let maxChannel = 0;

    channel: for (const channelElement of Array.from(
      modeElement.querySelectorAll('DMXChannel'),
    )) {
      const initialFunction = getAttributeNotEmpty(
        channelElement,
        'InitialFunction',
      ).toLowerCase();
      const offset = getAttributeNotEmpty(channelElement, 'Offset')
        .split(',')
        .map((i) => parseInt(i))
        .filter((o) => !isNaN(o));
      if (offset.length === 0) {
        continue channel;
      }
      maxChannel = Math.max(maxChannel, ...offset);

      for (const channelName of COLOR_CHANNELS) {
        if (initialFunction.indexOf(channelName) >= 0) {
          addChannels(mode, channelName, offset, {
            case: undefined,
            value: undefined,
          });
          continue channel;
        }
      }
      for (const channelName of ANGLE_CHANNELS) {
        if (initialFunction.indexOf(channelName) >= 0) {
          const channelFunction =
            channelElement.querySelector('ChannelFunction');
          const fromDegrees = parseFloat(
            getAttributeNotEmpty(channelFunction, 'PhysicalFrom'),
          );
          const toDegrees = parseFloat(
            getAttributeNotEmpty(channelFunction, 'PhysicalTo'),
          );
          addChannels(mode, channelName, offset, {
            case: 'angleMapping',
            value: create(DmxFixtureDefinition_Channel_AngleMappingSchema, {
              minDegrees: Math.round(Math.min(fromDegrees, toDegrees)),
              maxDegrees: Math.round(Math.max(fromDegrees, toDegrees)),
            }) as DmxFixtureDefinition_Channel_AngleMapping,
          });
          continue channel;
        }
      }
      for (const channelName of AMOUNT_CHANNELS) {
        if (initialFunction.indexOf(channelName) >= 0) {
          addChannels(
            mode,
            channelName,
            offset,
            {
              case: 'amountMapping',
              value: create(DmxFixtureDefinition_Channel_AmountMappingSchema, {
                minValue: 0,
                maxValue: 255,
              }) as DmxFixtureDefinition_Channel_AmountMapping,
            },
            channelName === 'dimmer' ? 255 : 0,
          );
          continue channel;
        }
      }
      if (initialFunction.indexOf('shutter') >= 0) {
        mode.channels[offset[0]] = create(DmxFixtureDefinition_ChannelSchema, {
          type: 'other',
          defaultValue: 255,
          mapping: {
            case: undefined,
            value: undefined,
          },
        }) as DmxFixtureDefinition_Channel;
      }

      if (initialFunction.indexOf('color selection') >= 0) {
        const colorElement = channelElement.querySelector(
          '[Name="Color Selection"]',
        );
        const wheelName = getAttributeNotEmpty(colorElement, 'Wheel');
        if (wheelName) {
          const wheel = description.querySelector(`Wheel[Name="${wheelName}"]`);
          if (wheel) {
            // Extract all the colors
            const colors: { [color: string]: Color } = {};
            for (const colorElement of Array.from(
              wheel.querySelectorAll('Slot'),
            )) {
              const color = getAttributeNotEmpty(colorElement, 'Color')
                .split(',')
                .map(parseFloat);
              const name = getAttributeNotEmpty(colorElement, 'Name');
              if (name) {
                colors[name.toLowerCase()] = cieToColor(
                  color[0],
                  color[1],
                  color[2],
                );
              }
            }

            const mapping = create(
              DmxFixtureDefinition_Channel_ColorWheelMappingSchema,
              {},
            ) as DmxFixtureDefinition_Channel_ColorWheelMapping;
            for (const set of Array.from(
              colorElement!.querySelectorAll('ChannelSet'),
            )) {
              const value = parseInt(
                getAttributeNotEmpty(set, 'DMXFrom').split('/')[0],
              );
              const name = getAttributeNotEmpty(set, 'Name');
              const color = colors[name.toLowerCase()];

              mapping.colors.push(
                create(
                  DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColorSchema,
                  {
                    name: name,
                    value: value,
                    color: color,
                  },
                ) as DmxFixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor,
              );
            }

            mode.channels[offset[0]] = create(
              DmxFixtureDefinition_ChannelSchema,
              {
                type: 'color_wheel',
                defaultValue: 0,
                mapping: {
                  case: 'colorWheelMapping',
                  value: mapping,
                },
              },
            ) as DmxFixtureDefinition_Channel;
          }
        }
      }
    }

    mode.numChannels = maxChannel;

    definition.modes[getUuidByString(mode.name)] = mode;
  }

  return definition;
}

function getAttributeNotEmpty(element: Element | null, attribute: string) {
  const value = element?.getAttribute(attribute);
  if (value == null) {
    throw new Error(`Attribute ${attribute} could not be found!`);
  }
  return value;
}

function addChannels(
  mode: DmxFixtureDefinition_Mode,
  name: string,
  offset: number[],
  mapping: DmxFixtureDefinition_Channel['mapping'],
  defaultValue = 0,
) {
  if (offset.length > 2) {
    throw new Error(
      `Channel ${name} has an unexpected offset length of ${offset.length}!`,
    );
  }
  mode.channels[offset[0]] = create(DmxFixtureDefinition_ChannelSchema, {
    type: name,
    defaultValue: defaultValue,
    mapping: mapping,
  }) as DmxFixtureDefinition_Channel;
  if (offset.length > 1) {
    mode.channels[offset[1]] = create(DmxFixtureDefinition_ChannelSchema, {
      type: name + '-fine',
      defaultValue: defaultValue,
      mapping: mapping,
    }) as DmxFixtureDefinition_Channel;
  }
}
