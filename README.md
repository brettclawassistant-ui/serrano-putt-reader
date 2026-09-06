# Serrano #1 Putt Reader

Mobile-friendly on-course helper for reading putts on **Serrano Golf Club – Hole #1** green.

Digitized from the attached professional yardage-book style chart (`public/serrano-1-green.png`).

## Run

```bash
cd /workspace/serrano-putt-reader
npm install
npm run dev
```

Then open the printed local URL on your phone (same Wi-Fi) or laptop.

Production build:

```bash
npm run build
npm run preview
```

## How to use

1. Tap **Ball** then tap the green to place (or drag the marker).
2. Tap **Cup** and place the hole.
3. Read the distance, uphill/downhill feel, break direction, and suggested aim tip.
4. Toggle **Heat** / **Arrows** for slope visualization. **Chart** opens the source image. **Reset** clears markers.

## Slope model

- Structured data: `public/green-data.json`
  - Green outline polygon (yards on chart grid)
  - Dense sample points with slope **magnitude (%)** and fall-line **direction** (degrees, CCW from +x)
  - Chart markers (front “P”, back center, 19.9 depth label) and front-left bunker outline
- On screen, samples are inverse-distance weighted to estimate local slope.
- Heat colors follow the chart legend (blue ≈ flat → red ≈ steep).
- Break / aim path is a **transparent approximate aid**: it blends local fall-line with a soft path toward the cup. It is **not** a Stimp-calibrated physics engine.

## Notes / limitations

- Digitized by eye from one chart page; sample values are approximate.
- Green speed, grain, and wind are not modeled.
- Aim offsets are guidance only — trust your eyes and feel on the course.
- Coordinate frame matches the printed chart (north toward top-right), not true geographic north alone.

## Stack

Vite + vanilla JS (single page, dark high-contrast UI for outdoor readability).
