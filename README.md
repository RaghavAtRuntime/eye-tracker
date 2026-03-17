# eye-tracker

A clean, elegant web application that lets users track their eye movements over an uploaded image with a real-time heatmap visualization, built with Node.js, WebGazer.js, and Tailwind CSS.

## Features

- **9-point Calibration Grid** — click green dots to calibrate the gaze model
- **Drag-and-drop Image Upload** — JPG and PNG, scaled to fit the viewport
- **Real-time Gaze Blip** — a radial-gradient circle that follows your gaze on a Canvas overlay
- **Persistent Heatmap** — accumulated gaze stamps show where you've been looking
- **Gaze Smoothing** — 10-frame moving-average filter to eliminate jitter
- **Keyboard Shortcuts** — `R` to recalibrate, `C` to clear the heatmap
- **Camera Toggle** — show/hide the WebGazer video preview at any time
- **Dark Mode UI** — minimalist slate/emerald theme

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express.js |
| Frontend | Vanilla JavaScript, HTML5 Canvas |
| CSS | Tailwind CSS v4 |
| Eye Tracking | WebGazer.js v3 |

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A webcam (required for eye tracking)

### Install & Run

```bash
# Install dependencies
npm install

# (Optional) Rebuild vendor assets
npm run build

# Start the server
npm start
```

Open <http://localhost:3000> in your browser.

### Build

`npm run build` copies `webgazer.js` from `node_modules` and regenerates `public/vendor/tailwind.css` from the HTML/JS sources. Run this after making changes to the HTML or CSS classes.

## Usage

1. **Calibration** — Click *Start Calibration*, then click each of the 9 green dots 5 times while looking directly at them.
2. **Upload** — Drag-and-drop (or browse for) a JPG/PNG image.
3. **Track** — Look around the image. A green blip follows your gaze and an accumulating heatmap builds up over time.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Recalibrate (returns to calibration screen) |
| `C` | Clear heatmap (keeps the current image) |
