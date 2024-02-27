import React, { JSX, useCallback, useEffect, useMemo, useState } from 'react';

import styles from "./index.module.scss";
import { FixtureDefinition, PhysicalFixture, getPhysicalWritableDevice } from './engine/fixture';

const miniLedMovingHead: FixtureDefinition = {
  name: 'Mini LED Moving Head',
  manufacturer: 'Wash',
  channels: {
    1: { type: 'pan', minDeg: -180, maxDeg: 360 },
    2: { type: 'pan-fine', minDeg: -180, maxDeg: 360 },
    3: { type: 'tilt', minDeg: -90, maxDeg: 90 },
    4: { type: 'tilt-fine', minDeg: -90, maxDeg: 90 },
    7: { type: 'red' },
    8: { type: 'green' },
    9: { type: 'blue' },
    10: { type: 'white' },
  },
}

const fixture: PhysicalFixture = {
  name: 'Moving Head 1',
  definition: miniLedMovingHead,
  channelOffset: 0,
}

const FRAME_LENGTH = 10;
const BLACKOUT_UNIVERSE = new Uint8Array(512).fill(0);
const universe = new Uint8Array(512).fill(0);
const colors = [
  {
    r: 1,
    g: 0,
    b: 1,
  },
  {
    r: 1,
    g: 0.8,
    b: 0,
  },
  {
    r: 0,
    g: 0.8,
    b: 1,
  },
  {
    r: 0,
    g: 1,
    b: 0,
  },
];

const writableFixture = getPhysicalWritableDevice(fixture, universe);

export default function Index(): JSX.Element {
  const [port, setPort] = useState<SerialPort>(null);
  const [beats, setBeats] = useState<number[]>([]);
  const [beatLead, setBeatLead] = useState<number>(50);
  const [blackout, setBlackout] = useState<boolean>(false);

  const beatStart = useMemo(() => {
    if (beats.length > 1) {
      return beats[beats.length - 1];
    } else {
      return 0;
    }
  }, [beats]);

  const beatLength = useMemo(() => {
    if (beats.length > 1) {
      return (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
    } else {
      return Number.MAX_VALUE;
    }
  }, [beats]);

  const addBeat = useCallback(() => {
    const now = new Date().getTime();
    if (beats.length > 0 && now > beats[beats.length - 1] + beatLength * 2) {
      setBeats([now]);
    } else {
      setBeats([...beats, now]);
    }
  }, [beats]);

  const connect = useCallback(async () => {
    const forceReconnect = port != null;
    try {
      let port: SerialPort;
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0 || forceReconnect) {
        port = await navigator.serial.requestPort();
      } else {
        port = ports[0];
      }
      await port.open({
        baudRate: 128000,
        dataBits: 8,
        flowControl: 'none',
        parity: 'none',
        stopBits: 2,
      });

      setPort(port);
    } catch (e) {
      console.error(e);
    }
  }, [port]);

  useEffect(() => {
    const func = (ev: KeyboardEvent) => {
      console.log(ev.code);
      switch (ev.code) {
        case 'Space':
          addBeat();
          break;
        case 'KeyC':
          connect();
          break;
        case 'KeyB':
          setBlackout(!blackout);
          break;
      }
    };

    document.addEventListener('keydown', func);

    return () => document.removeEventListener('keydown', func);
  }, [addBeat, connect, blackout, setBlackout]);

  useEffect(() => {
    const handle = setInterval(() => {
      const now = new Date().getTime();
      const flash = 1 - ((now - beatStart) % beatLength) / beatLength;
      document.getElementById('beat').style.opacity = String(flash);
    }, 0);

    return () => clearInterval(handle);
  }, [beatStart, beatLength]);

  if (!("serial" in navigator)) {
    return (
      <div className={styles.wrapper}>
        <h1>Serial output not supported.</h1>
      </div>
    );
  }

  useEffect(() => {
    if (!port) {
      return;
    }

    const writer = port.writable.getWriter();

    let handle: any;
    if (blackout) {
      handle = setInterval(async () => {
        try {
          await writer.write(BLACKOUT_UNIVERSE);
        } catch (e) {
          console.error(e);
          port.close();
          setPort(null);
        }
      }, FRAME_LENGTH);
    } else {
      writableFixture.setRGBW(0.8, 0, 1, 0);
      writableFixture.setTilt(-45);
      writableFixture.setChannel(5, 0);
      writableFixture.setChannel(6, 255);

      handle = setInterval(async () => {
        const ms = new Date().getTime();
        const pan = Math.sin(ms / 1000) * 180;
        writableFixture.setPan(pan);
        const tilt = Math.sin(ms / 1200) * 45;
        writableFixture.setTilt(tilt);
        const ts = ms - beatStart + beatLead;
        const beatNum = Math.floor(ts / beatLength);
        const color = colors[beatNum % colors.length];
        const flash = 1 - (ts % beatLength) / beatLength;
        writableFixture.setRGB(color.r * flash, color.g * flash, color.b * flash);

        try {
          await writer.write(universe);
        } catch (e) {
          console.error(e);
          port.close();
          setPort(null);
        }
      }, FRAME_LENGTH);
    }

    return () => {
      clearInterval(handle);
      writer.releaseLock();
    };
  }, [port, blackout, beatStart, beatLength, beatLead]);

  return (
    <div className={styles.wrapper}>
      <h1>This is a DMX controller running in a webpage.</h1>
      <p>Blackout: {String(blackout)}</p>
      <button onClick={() => connect()}>Connect</button>
      {
        port == null ?
          <p>
            Not connected yet.
          </p> :
          <p>
            Connected!
          </p>
      }
      <button onMouseDown={addBeat}>
        Beat
      </button>
      <input type="number"
        onChange={(e) => setBeatLead(Number(e.target.value))}
        value={beatLead} />
      <div id="beat" className={styles.beat}></div>
    </div>
  );
}