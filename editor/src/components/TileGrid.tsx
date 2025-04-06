import styles from './Tile.module.scss';
import { ProjectContext } from '../contexts/ProjectContext';
import { Scene_TileMap } from '@dmx-controller/proto/scene_pb';
import { Tile } from './Tile';
import { JSX, useContext, useMemo, useState } from 'react';

interface TileGridProps {
  className?: string;
  sceneId: number;
  onSelect: (tile: Scene_TileMap) => void;
  setAddTileIndex: (index: { x: number; y: number }) => void;
  maxX: number;
  maxY: number;
}

export function TileGrid({
  className,
  sceneId,
  onSelect,
  setAddTileIndex: setAddTileIndex,
  maxX,
  maxY,
}: TileGridProps): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const [draggingTile, setDraggingTile] = useState<Scene_TileMap | null>(null);

  const scene = useMemo(() => project?.scenes[sceneId], [project, sceneId]);

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
    <div className={classes.join(' ')}>
      {map.map((r, y) =>
        r.map((mapping, x) => {
          if (mapping != null) {
            return (
              <Tile
                key={x + ' ' + y}
                id={mapping.id}
                tile={mapping.tile!}
                onDragTile={() => setDraggingTile(mapping)}
                onDropTile={() => {
                  if (draggingTile) {
                    save(`Rearrange tiles in scene ${scene.name}.`);
                  }
                  setDraggingTile(null);
                }}
                onSelect={() => onSelect(mapping)}
                x={x}
                y={y}
                priority={mapping.priority}
              />
            );
          } else {
            return (
              <div
                key={x + ' ' + y}
                className={styles.tilePlaceholder}
                style={{
                  gridColumnStart: x + 1,
                  gridColumnEnd: x + 2,
                  gridRowStart: y + 1,
                  gridRowEnd: y + 2,
                }}
                onClick={() => setAddTileIndex({ x, y })}
                onDragOver={(e) => {
                  if (draggingTile) {
                    draggingTile.x = x;
                    draggingTile.y = y;
                    update();
                  }
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <div className={styles.contents}></div>
              </div>
            );
          }
        }),
      )}
    </div>
  );
}
