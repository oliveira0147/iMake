const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

async function main() {
  const root = path.resolve(__dirname, "..");
  const svgPath = path.join(root, "public", "icon.svg");
  const outDir = path.join(root, "installer");
  const icoPath = path.join(outDir, "icon.ico");

  await fs.mkdir(outDir, { recursive: true });

  const pngBuffer = await sharp(svgPath, { density: 256 })
    .resize(256, 256, { fit: "cover" })
    .png()
    .toBuffer();

  const icoBuffer = await pngToIco(pngBuffer);
  await fs.writeFile(icoPath, icoBuffer);
  process.stdout.write(`${icoPath}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exit(1);
});
