import React, { JSX, useCallback, useEffect, useState } from 'react';

import styles from "./index.module.scss";
import { FixtureDefinition, PhysicalFixture, getPhysicalWritableDevice } from './engine/fixture';

const miniLedMovingHead: FixtureDefinition = {
  name: 'Mini LED Moving Head',
  manufacturer: 'Wash',
  channels:{
    1: {type: 'pan', minDeg: -180, maxDeg: 360},
    2: {type: 'pan-fine', minDeg: -180, maxDeg: 360},
    3: {type: 'tilt', minDeg: -90, maxDeg: 90},
    4: {type: 'tilt-fine', minDeg: -90, maxDeg: 90},
    7: {type: 'red'},
    8: {type: 'green'},
    9: {type: 'blue'},
    10: {type: 'white'},
  },
}

const fixture: PhysicalFixture = {
  name: 'Moving Head 1',
  definition: miniLedMovingHead,
  channelOffset: 0,
}

const universe = new Uint8Array(512).fill(0);

const writableFixture = getPhysicalWritableDevice(fixture, universe)

export default function Index(): JSX.Element {
  const [port, setPort] = useState<SerialPort>(null);
  const [channel, setChannel] = useState<number>(100);

  if (!("serial" in navigator)) {
    return (
      <div className={styles.wrapper}>
        <h1>Serial output not supported.</h1>
      </div>
    );
  }

  const connect = useCallback(async (forceReconnect: boolean) => {
    try {
      let port: SerialPort;
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0 || forceReconnect) {
        port = await navigator.serial.requestPort();
      } else {
        port = ports[0];
      }
      console.log(port.getInfo());
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
  }, []);

  useEffect(() => {
    if (!port) {
      return;
    }

    const writer = port.writable.getWriter();

    writableFixture.setRGBW(0.8, 0, 1, 0.8);
    writableFixture.setTilt(-45);
    writableFixture.setChannel(5, 0);
    writableFixture.setChannel(6, 255);

    const interval = setInterval(async () => {
      const ms = new Date().getTime();
      const pan = Math.sin(ms / 1000) * 180;
      writableFixture.setPan(pan);
      const tilt = Math.sin(ms / 1200) * 45;
      writableFixture.setTilt(tilt);
      const flash = 1 - (ms % 500) / 500;
      // writableFixture.setChannel(6, flash * 134);

      try {
        await writer.write(universe);
      } catch (e) {
        console.error(e);
        port.close();
        setPort(null);
      }
    }, 0);

    return () => {
      clearInterval(interval);
      writer.releaseLock();
    };
  }, [port, channel]);

  return (
    <div className={styles.wrapper}>
      <h1>This is a DMX controller running in a webpage.</h1>
      <button onClick={() => connect(port !== null)}>Connect</button>
      {
        port == null ?
          <p>
            Not connected yet.
          </p> :
          <p>
            Connected!
            <input type="number"
              onChange={(e) => setChannel(Number(e.target.value))}
              value={channel} />
          </p>
      }
    </div>
  );
}