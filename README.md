# GI Sheet Optimizer — New Version

This is a clean replacement for the original application. It keeps the same manufacturing formulas:

- Body strip width: `W + 2H + 20`
- Cover strip width: `W + 22`
- Kerf is included between adjacent cuts.
- The recommended plan prioritizes the fewest mother sheets, then the least area waste.

## Modes

- **Combined**: body and cover strips share one optimization pool.
- **Split by thickness**: body and cover are optimized independently and can use different thicknesses.
- An order can be **Body + Cover**, **Body only**, or **Cover only**.

## Run and build

```text
npm install
npm start
npm run dist
```

The Windows installer and portable executable are written to `dist`.

## Project files

The File menu supports `.gisheet` JSON project files, Save/Open, Save As, New, recent files, and PDF export. Blank order rows are preserved but ignored by calculations until completed.
