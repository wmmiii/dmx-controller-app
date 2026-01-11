import { Scene_TileMap } from '@dmx-controller/proto/scene_pb';
import { JSX, useContext } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { VersatileContainer } from '../contexts/VersatileContianer';
import { Tile } from './Tile';
import styles from './Tile.module.scss';
import { VersatileElement } from './VersatileElement';

interface TileGridProps {
  className?: string;
  sceneId: bigint;
  onSelectId: (id: bigint) => void;
  setAddTileIndex: (index: { x: number; y: number }) => void;
  maxX: number;
  maxY: number;
}

export function TileGrid({
  className,
  sceneId,
  onSelectId,
  setAddTileIndex,
  maxX,
  maxY,
}: TileGridProps): JSX.Element {
  const { project, update } = useContext(ProjectContext);

  const touch = project.settings?.touchInterface ?? false;
  const scene = project?.scenes[sceneId.toString()];

  if (scene == null) {
    return <div className={className}></div>;
  }

  const map: Array<Array<Scene_TileMap | null>> = [];
  for (let y = 0; y < maxY; y++) {
    map[y] = [];
    for (let x = 0; x < maxX; x++) {
      const c = scene.tileMap.find((c) => c.x === x && c.y === y);
      map[y][x] = c || null;
    }
  }

  const classes = [styles.tileGrid];
  if (className) {
    classes.push(className);
  }

  return (
    <VersatileContainer className={classes.join(' ')}>
      {map.map((r, y) =>
        r.map((mapping, x) => {
          if (mapping != null) {
            return (
              <Tile
                key={x + ' ' + y}
                tileId={mapping.id}
                tile={mapping.tile!}
                onSelect={() => onSelectId(mapping.id)}
                x={x}
                y={y}
                priority={mapping.priority}
              />
            );
          } else {
            return (
              <VersatileElement
                key={x + ' ' + y}
                className={styles.tilePlaceholder}
                id={`${x} ${y}`}
                style={{
                  gridColumnStart: x + 1,
                  gridColumnEnd: x + 2,
                  gridRowStart: y + 1,
                  gridRowEnd: y + 2,
                }}
                onClick={touch ? undefined : () => setAddTileIndex({ x, y })}
                onPress={touch ? () => setAddTileIndex({ x, y }) : undefined}
                onDragOver={(id) => {
                  const tile = scene.tileMap.find((t) => t.id === id);
                  if (tile) {
                    tile.x = x;
                    tile.y = y;
                    update();
                  }
                }}
              >
                <div className={styles.contents}></div>
              </VersatileElement>
            );
          }
        }),
      )}
    </VersatileContainer>
  );
}
