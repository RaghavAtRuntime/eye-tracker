const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Serve MediaPipe face_mesh assets required by WebGazer at runtime
app.use(
  '/mediapipe',
  express.static(path.join(__dirname, 'node_modules', 'webgazer', 'dist', 'mediapipe'))
);

// Serve WebGazer source map for development debugging
app.use(
  '/vendor',
  express.static(path.join(__dirname, 'node_modules', 'webgazer', 'dist'))
);

app.listen(PORT, () => {
  console.log(`Eye Tracker server running at http://localhost:${PORT}`);
});
