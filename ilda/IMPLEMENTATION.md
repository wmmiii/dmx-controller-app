# SVG to ILDA Converter - Implementation Guide

> **For AI Agents**:
>
> - Update the checkboxes in this file as you complete tasks. Mark `[ ]` → `[x]` when done.
> - Add notes about any deviations or issues encountered.
> - **This is a highly collaborative process.** Frequently check your work with the user before moving on to the next phase. Don't implement multiple phases without user review. Ask for feedback on UI decisions, API design, and implementation choices.

## Overview

A standalone web application that converts SVG files to ILDA (.ild) laser format. Built with the same stack as the DMX Controller frontend. Deployed to GitHub Pages at `/ilda/`.

## Architecture

| Decision            | Choice                        | Rationale                           |
| ------------------- | ----------------------------- | ----------------------------------- |
| Build system        | Vite 8 (separate config)      | Same as main app                    |
| Language            | TypeScript 5.9 (strict)       | Same as main app                    |
| UI Framework        | React 19                      | Same as main app                    |
| Components          | Base UI (@base-ui/react)      | Same as main app                    |
| Styling             | CSS modules + shared vars.css | Consistent theming                  |
| SVG path flattening | `svg-path-properties` (npm)   | Provides `getPointAtLength()`       |
| ILDA format         | Format 5 (2D true color)      | Most flexible, direct RGB per point |

## UI Flow

**Two-step process with left/right layout:**

| Step         | Left Panel              | Right Panel                               |
| ------------ | ----------------------- | ----------------------------------------- |
| 1. Upload    | Drop zone / file picker | SVG preview (fills disabled, stroke-only) |
| 2. Configure | Control parameters      | Canvas preview (ILDA points)              |

**Control Parameters:**

- **Color mode**: RGB (true color) vs Plain (single color/indexed)
- **Gradient resolution**: How many color samples along gradients
- **Curve resolution**: Point density for bezier/arc flattening

## File Structure

```
ilda/
├── index.html              # Entry HTML
├── app.tsx                 # App entry point
├── App.module.css          # App styles (two-column layout)
├── IMPLEMENTATION.md       # This file
├── components/
│   ├── UploadPanel.tsx     # Left panel: drop zone → controls
│   ├── UploadPanel.module.css
│   ├── SvgPreview.tsx      # SVG render with fills disabled
│   ├── SvgPreview.module.css
│   ├── CanvasPreview.tsx   # ILDA points visualization
│   ├── CanvasPreview.module.css
│   ├── ControlPanel.tsx    # Parameter controls (step 2)
│   └── ControlPanel.module.css
├── lib/
│   ├── svgParser.ts        # SVG DOM parsing, shape→path
│   ├── pathFlatten.ts      # Bezier/arc → discrete points
│   ├── coordinateTransform.ts  # SVG coords → ILDA signed 16-bit
│   ├── ildaWriter.ts       # Binary ILDA file generation
│   └── types.ts            # Shared TypeScript types
└── vite.config.ts          # Separate Vite config for ILDA app

# Root-level changes needed:
tsconfig.json               # Add ilda/ to include paths
package.json                # Add ilda:dev and ilda:build scripts
```

---

## Implementation Checklist

### Phase 0: Project Setup

- [ ] **Create `ilda/vite.config.ts`**

  ```typescript
  import react from '@vitejs/plugin-react';
  import path from 'path';
  import { defineConfig } from 'vite';

  export default defineConfig({
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', {}]],
        },
      }),
    ],
    root: path.resolve(__dirname),
    publicDir: '../public',
    base: '/ilda/',
    build: {
      outDir: '../dist-ilda',
      emptyOutDir: true,
      sourcemap: true,
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
    },
    server: {
      port: 8081,
    },
  });
  ```

- [ ] **Create `ilda/index.html`**

  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SVG to ILDA Converter</title>
      <link rel="icon" href="/icon.svg" />
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="./app.tsx"></script>
    </body>
  </html>
  ```

- [ ] **Update root `tsconfig.json`**
  - Add `"ilda/**/*.ts"` and `"ilda/**/*.tsx"` to `include` array

- [ ] **Update root `package.json`**
  - Add scripts:
    ```json
    "ilda:dev": "vite --config ilda/vite.config.ts",
    "ilda:build": "vite build --config ilda/vite.config.ts"
    ```

- [ ] **Install svg-path-properties**

  ```bash
  pnpm add svg-path-properties
  pnpm add -D @types/svg-path-properties
  ```

  Note: Check if types exist, may need to create `ilda/lib/svg-path-properties.d.ts`

- [ ] **Test setup**
  - Run `pnpm run ilda:dev`
  - Verify dev server starts on port 8081

### Phase 1: Core Types and Conversion Pipeline

- [ ] **Create `ilda/lib/types.ts`**

  ```typescript
  export interface Point {
    x: number;
    y: number;
  }

  export interface IldaPoint extends Point {
    r: number;
    g: number;
    b: number;
    blanking: boolean;
  }

  export interface PathData {
    d: string;
    color: { r: number; g: number; b: number };
  }

  export interface ViewBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface ParsedSvg {
    viewBox: ViewBox;
    paths: PathData[];
  }

  export interface IldaFrame {
    name: string;
    points: IldaPoint[];
  }
  ```

- [ ] **Create `ilda/lib/svgParser.ts`**
  - Export `parseSvg(svgString: string): ParsedSvg`
  - Parse SVG string using DOMParser
  - Extract viewBox (or derive from width/height)
  - Find all `<path>` elements
  - Extract `d` attribute and stroke/fill color

- [ ] **Create `ilda/lib/pathFlatten.ts`**
  - Export `flattenPath(d: string, tolerance: number): Point[]`
  - Use `svg-path-properties` to sample points along path
  - Sample at regular intervals based on tolerance

- [ ] **Create `ilda/lib/coordinateTransform.ts`**
  - Export `createTransform(viewBox: ViewBox): (p: Point) => Point`
  - Map SVG coords to ILDA range (-32768 to 32767)
  - Flip Y axis (SVG Y down, ILDA Y up)
  - Clamp to valid range

- [ ] **Create `ilda/lib/ildaWriter.ts`**
  - Export `createIldaFile(frames: IldaFrame[]): Blob`
  - Write ILDA Format 5 binary (header + points)
  - Handle multi-frame files
  - Add end-of-file header (point count = 0)

### Phase 2: React Components

- [ ] **Create `ilda/app.tsx`**

  ```typescript
  import { useState } from 'react';
  import styles from './App.module.css';
  import { UploadPanel } from './components/UploadPanel';
  import { ControlPanel } from './components/ControlPanel';
  import { SvgPreview } from './components/SvgPreview';
  import { CanvasPreview } from './components/CanvasPreview';

  // State:
  // - step: 'upload' | 'configure'
  // - svgContent: string | null
  // - settings: { colorMode, gradientRes, curveRes }
  // - ildaPoints: IldaPoint[]
  ```

- [ ] **Create `ilda/App.module.css`**
  - Import shared vars: `@import url('../src/vars.css');`
  - Two-column layout (left panel, right preview)
  - Dark theme matching main app
  - Responsive: stack on mobile

- [ ] **Create `ilda/components/UploadPanel.tsx`** (Step 1 left)
  - Drag-and-drop file upload zone
  - Accept single `.svg` file
  - Visual feedback on dragover
  - "Continue" button to proceed to step 2
  - Props: `onFileSelected: (content: string) => void`

- [ ] **Create `ilda/components/SvgPreview.tsx`** (Step 1 right)
  - Render SVG with fills disabled (stroke-only)
  - Apply CSS: `fill: none; stroke: currentColor;`
  - Show what the laser output will look like
  - Props: `svgContent: string`

- [ ] **Create `ilda/components/ControlPanel.tsx`** (Step 2 left)
  - **Color mode**: Toggle RGB vs Plain (single color)
  - **Gradient resolution**: Slider (number of color samples)
  - **Curve resolution**: Slider (point density, 0.5-10)
  - "Download ILDA" button
  - "Back" button to return to step 1
  - Props: `settings`, `onSettingsChange`, `onDownload`, `onBack`

- [ ] **Create `ilda/components/CanvasPreview.tsx`** (Step 2 right)
  - Canvas-based point visualization
  - Render ILDA points with actual colors
  - Show blanking moves as gaps (or dim lines)
  - Re-render when settings change
  - Props: `points: IldaPoint[]`

### Phase 3: Shape Support & Polish

- [ ] **Extend `svgParser.ts` with shape conversions**
  - `rectToPath(element: SVGRectElement): string`
  - `circleToPath(element: SVGCircleElement): string`
  - `ellipseToPath(element: SVGEllipseElement): string`
  - `lineToPath(element: SVGLineElement): string`
  - `polylineToPath(element: SVGPolylineElement): string`
  - `polygonToPath(element: SVGPolygonElement): string`

- [ ] **Add blanking insertion**

  ```typescript
  function insertBlankingMoves(paths: IldaPoint[][]): IldaPoint[] {
    // Between disconnected paths:
    // 1. Last point → blanking=true
    // 2. First point of next path → blanking=true
    // 3. Continue with blanking=false
  }
  ```

- [ ] **Gradient sampling**
  - Detect gradient fills/strokes (linearGradient, radialGradient)
  - Sample colors along path based on gradient resolution setting
  - Apply sampled colors to points

- [ ] **Improve color extraction**
  - Parse stroke color (prefer for laser)
  - Fall back to fill edge color
  - Handle rgb(), hex, named colors
  - Default to white
  - Support "plain" mode (single color output)

### Phase 4: Deployment

- [ ] **Update `.github/workflows/deploy.yaml`**

  ```yaml
  - name: Build ILDA converter
    run: pnpm run ilda:build

  - name: Prepare deployment
    run: |
      mkdir -p _site
      cp -r web/* _site/
      cp -r dist-ilda _site/ilda
  ```

- [ ] **Update knip config (if needed)**
  - Ensure ilda/ files aren't flagged as dead code

- [ ] **Add link from landing page**
  - Update `web/index.html` to include link to `/ilda/`

- [ ] **Final testing**
  - Run `pnpm run ilda:build`
  - Test production build locally
  - Deploy to GitHub Pages
  - Verify ILDA output in laser software/simulator

---

## Technical Reference

### ILDA Format 5 Specification

**Header (32 bytes)**
| Offset | Size | Description |
|--------|------|-------------|
| 0 | 4 | Signature: "ILDA" (0x494C4441) |
| 4 | 3 | Reserved (zeros) |
| 7 | 1 | Format code: 5 |
| 8 | 8 | Frame name (padded with zeros) |
| 16 | 8 | Company name (padded with zeros) |
| 24 | 2 | Point count (big-endian uint16) |
| 26 | 2 | Frame number (big-endian uint16, 0-indexed) |
| 28 | 2 | Total frames (big-endian uint16) |
| 30 | 1 | Scanner head (0) |
| 31 | 1 | Reserved (0) |

**Point (8 bytes each)**
| Offset | Size | Description |
|--------|------|-------------|
| 0 | 2 | X coordinate (big-endian int16, -32768 to 32767) |
| 2 | 2 | Y coordinate (big-endian int16, -32768 to 32767) |
| 4 | 1 | Status: bit 6 = blanking, bit 7 = last point |
| 5 | 1 | Blue (0-255) |
| 6 | 1 | Green (0-255) |
| 7 | 1 | Red (0-255) |

**End of file**: Header with point count = 0

### Coordinate Transform

```typescript
function createTransform(viewBox: ViewBox) {
  return (point: Point): Point => {
    // Normalize to 0..1
    const nx = (point.x - viewBox.x) / viewBox.width;
    const ny = (point.y - viewBox.y) / viewBox.height;

    // Map to ILDA range, flip Y
    const ildaX = Math.round((nx * 2 - 1) * 32767);
    const ildaY = Math.round((1 - ny * 2) * 32767); // Flipped!

    return {
      x: Math.max(-32768, Math.min(32767, ildaX)),
      y: Math.max(-32768, Math.min(32767, ildaY)),
    };
  };
}
```

### Shape to Path Conversions

```typescript
// Rectangle
const rectToPath = (x, y, w, h) => `M${x},${y} h${w} v${h} h${-w} Z`;

// Circle (two arcs)
const circleToPath = (cx, cy, r) =>
  `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0`;

// Ellipse
const ellipseToPath = (cx, cy, rx, ry) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${2 * rx},0 a${rx},${ry} 0 1 0 ${-2 * rx},0`;

// Line
const lineToPath = (x1, y1, x2, y2) => `M${x1},${y1} L${x2},${y2}`;

// Polyline (points = "x1,y1 x2,y2 ...")
const polylineToPath = (points: string) => {
  const pts = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  let d = `M${pts[0]},${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) {
    d += ` L${pts[i]},${pts[i + 1]}`;
  }
  return d;
};

// Polygon (same as polyline + Z)
const polygonToPath = (points: string) => polylineToPath(points) + ' Z';
```

---

## Known Limitations (V1)

- No `<text>` support (requires font outlining)
- No pattern fills (patterns ignored, uses stroke color)
- No clipPath/mask support
- No transform attribute handling (nested transforms)
- Maximum 65535 points per frame (ILDA spec)
- Single frame output only (no animation sequences)

---

## Resources

- [ILDA IDTF Specification (PDF)](https://www.ilda.com/resources/StandardsDocs/ILDA_IDTF14_rev011.pdf)
- [ILDA Format Overview - Paul Bourke](https://paulbourke.net/dataformats/ilda/)
- [svg-path-properties (npm)](https://www.npmjs.com/package/svg-path-properties)
- [SVG Path Spec (MDN)](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths)
