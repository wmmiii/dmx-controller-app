import {
  FixtureDefinition,
  FixtureDefinition_Channel,
  FixtureDefinition_Channel_AmountMapping,
  FixtureDefinition_Channel_AngleMapping,
  FixtureDefinition_Channel_ColorWheelMapping,
  FixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor,
  FixtureDefinition_Mode,
} from "@dmx-controller/proto/fixture_pb";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import getUuidByString from "uuid-by-string";
import {
  AMOUNT_CHANNELS,
  ANGLE_CHANNELS,
  COLOR_CHANNELS,
} from "../engine/channel";
import { Color } from "@dmx-controller/proto/color_pb";
import { cieToColor } from "./colorUtil";

export async function extractGdtf(arrayBuffer: Blob) {
  // Unzip archive and find XML.
  const zipReader = new ZipReader(new BlobReader(arrayBuffer));
  const entries = await zipReader.getEntries();

  const descriptionEntry = entries.find(
    (e) => e.filename === "description.xml",
  );
  if (descriptionEntry == null) {
    throw new Error("Could not read GDTF file!");
  }

  const descriptionXml = await descriptionEntry.getData!(new TextWriter());
  const description = new window.DOMParser().parseFromString(
    descriptionXml,
    "text/xml",
  );

  const type = description.querySelector("FixtureType");

  const definition = new FixtureDefinition({
    globalId: getAttributeNotEmpty(type, "FixtureTypeID"),
    name: getAttributeNotEmpty(type, "LongName"),
    manufacturer: getAttributeNotEmpty(type, "Manufacturer"),
  });

  const modes = description.querySelectorAll("DMXMode");

  for (const modeElement of Array.from(modes)) {
    const mode = new FixtureDefinition_Mode({
      name: getAttributeNotEmpty(modeElement, "Name"),
    });

    let maxChannel = 0;

    channel: for (const channelElement of Array.from(
      modeElement.querySelectorAll("DMXChannel"),
    )) {
      const initialFunction = getAttributeNotEmpty(
        channelElement,
        "InitialFunction",
      ).toLowerCase();
      const offset = getAttributeNotEmpty(channelElement, "Offset")
        .split(",")
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
            channelElement.querySelector("ChannelFunction");
          const fromDegrees = parseFloat(
            getAttributeNotEmpty(channelFunction, "PhysicalFrom"),
          );
          const toDegrees = parseFloat(
            getAttributeNotEmpty(channelFunction, "PhysicalTo"),
          );
          addChannels(mode, channelName, offset, {
            case: "angleMapping",
            value: new FixtureDefinition_Channel_AngleMapping({
              minDegrees: Math.round(Math.min(fromDegrees, toDegrees)),
              maxDegrees: Math.round(Math.max(fromDegrees, toDegrees)),
            }),
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
              case: "amountMapping",
              value: new FixtureDefinition_Channel_AmountMapping({
                minValue: 0,
                maxValue: 255,
              }),
            },
            channelName === "dimmer" ? 255 : 0,
          );
          continue channel;
        }
      }
      if (initialFunction.indexOf("shutter") >= 0) {
        mode.channels[offset[0]] = new FixtureDefinition_Channel({
          type: "other",
          defaultValue: 255,
          mapping: {
            case: undefined,
            value: undefined,
          },
        });
      }

      if (initialFunction.indexOf("color selection") >= 0) {
        const colorElement = channelElement.querySelector(
          '[Name="Color Selection"]',
        );
        const wheelName = getAttributeNotEmpty(colorElement, "Wheel");
        if (wheelName) {
          const wheel = description.querySelector(`Wheel[Name="${wheelName}"]`);
          if (wheel) {
            // Extract all the colors
            const colors: { [color: string]: Color } = {};
            for (const colorElement of Array.from(
              wheel.querySelectorAll("Slot"),
            )) {
              const color = getAttributeNotEmpty(colorElement, "Color")
                .split(",")
                .map(parseFloat);
              const name = getAttributeNotEmpty(colorElement, "Name");
              if (name) {
                colors[name.toLowerCase()] = cieToColor(
                  color[0],
                  color[1],
                  color[2],
                );
              }
            }

            const mapping = new FixtureDefinition_Channel_ColorWheelMapping();
            for (const set of Array.from(
              colorElement!.querySelectorAll("ChannelSet"),
            )) {
              const value = parseInt(
                getAttributeNotEmpty(set, "DMXFrom").split("/")[0],
              );
              const name = getAttributeNotEmpty(set, "Name");
              const color = colors[name.toLowerCase()];

              mapping.colors.push(
                new FixtureDefinition_Channel_ColorWheelMapping_ColorWheelColor(
                  {
                    name: name,
                    value: value,
                    color: color,
                  },
                ),
              );
            }

            mode.channels[offset[0]] = new FixtureDefinition_Channel({
              type: "color_wheel",
              defaultValue: 0,
              mapping: {
                case: "colorWheelMapping",
                value: mapping,
              },
            });
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
  mode: FixtureDefinition_Mode,
  name: string,
  offset: number[],
  mapping: FixtureDefinition_Channel["mapping"],
  defaultValue = 0,
) {
  if (offset.length > 2) {
    throw new Error(
      `Channel ${name} has an unexpected offset length of ${offset.length}!`,
    );
  }
  mode.channels[offset[0]] = new FixtureDefinition_Channel({
    type: name,
    defaultValue: defaultValue,
    mapping: mapping,
  });
  if (offset.length > 1) {
    mode.channels[offset[1]] = new FixtureDefinition_Channel({
      type: name + "-fine",
      defaultValue: defaultValue,
      mapping: mapping,
    });
  }
}
