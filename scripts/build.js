/**
 * Build script: copies vendored assets into public/vendor
 * Run with: npm run build
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const VENDOR  = path.join(ROOT, 'public', 'vendor');

// Ensure vendor directory exists
fs.mkdirSync(VENDOR, { recursive: true });

// 1. Copy WebGazer.js from node_modules
const webgazerSrc = path.join(ROOT, 'node_modules', 'webgazer', 'dist', 'webgazer.js');
const webgazerDst = path.join(VENDOR, 'webgazer.js');
fs.copyFileSync(webgazerSrc, webgazerDst);
console.log('✅ Copied webgazer.js');

// 2. Generate Tailwind CSS
const twInput = path.join(ROOT, 'tw-input.css');
const twOutput = path.join(VENDOR, 'tailwind.css');
fs.writeFileSync(twInput, '@import "tailwindcss";\n');
try {
  execSync(
    `node_modules/.bin/tailwindcss --input tw-input.css --content "./public/**/*.html" --content "./public/**/*.js" --output public/vendor/tailwind.css`,
    { cwd: ROOT, stdio: 'inherit' }
  );
  console.log('✅ Generated tailwind.css');
} finally {
  fs.unlinkSync(twInput);
}

console.log('\n🚀 Build complete — run `npm start` to serve the app.');
