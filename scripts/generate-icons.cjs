const sharp = require('sharp');
const path = require('path');

// Create a simple OSCE icon with a medical cross/clipboard design
const createIconSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  <!-- Clipboard shape -->
  <rect x="${size * 0.2}" y="${size * 0.25}" width="${size * 0.6}" height="${size * 0.65}" rx="${size * 0.05}" fill="white" opacity="0.95"/>
  <!-- Clipboard top clip -->
  <rect x="${size * 0.35}" y="${size * 0.15}" width="${size * 0.3}" height="${size * 0.15}" rx="${size * 0.03}" fill="white"/>
  <rect x="${size * 0.38}" y="${size * 0.18}" width="${size * 0.24}" height="${size * 0.08}" rx="${size * 0.02}" fill="#3b82f6"/>
  <!-- Checkmark lines -->
  <rect x="${size * 0.28}" y="${size * 0.4}" width="${size * 0.44}" height="${size * 0.04}" rx="${size * 0.02}" fill="#3b82f6" opacity="0.3"/>
  <rect x="${size * 0.28}" y="${size * 0.52}" width="${size * 0.35}" height="${size * 0.04}" rx="${size * 0.02}" fill="#3b82f6" opacity="0.3"/>
  <rect x="${size * 0.28}" y="${size * 0.64}" width="${size * 0.4}" height="${size * 0.04}" rx="${size * 0.02}" fill="#3b82f6" opacity="0.3"/>
  <rect x="${size * 0.28}" y="${size * 0.76}" width="${size * 0.3}" height="${size * 0.04}" rx="${size * 0.02}" fill="#3b82f6" opacity="0.3"/>
  <!-- Checkmarks -->
  <path d="M${size * 0.25} ${size * 0.42} l${size * 0.03} ${size * 0.03} l${size * 0.05} -${size * 0.05}" stroke="#22c55e" stroke-width="${size * 0.025}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M${size * 0.25} ${size * 0.54} l${size * 0.03} ${size * 0.03} l${size * 0.05} -${size * 0.05}" stroke="#22c55e" stroke-width="${size * 0.025}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M${size * 0.25} ${size * 0.66} l${size * 0.03} ${size * 0.03} l${size * 0.05} -${size * 0.05}" stroke="#22c55e" stroke-width="${size * 0.025}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');

  const sizes = [192, 512];

  for (const size of sizes) {
    const svg = createIconSvg(size);
    const outputPath = path.join(publicDir, `pwa-${size}x${size}.png`);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`Created: pwa-${size}x${size}.png`);
  }

  // Also create apple-touch-icon (180x180)
  const appleSvg = createIconSvg(180);
  await sharp(Buffer.from(appleSvg))
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created: apple-touch-icon.png');

  // Create favicon.ico (32x32)
  const faviconSvg = createIconSvg(32);
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Created: favicon.ico');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
