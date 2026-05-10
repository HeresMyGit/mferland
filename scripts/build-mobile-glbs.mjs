import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const mobileTextureScale = 0.5;
const mobileTextureMaxSize = 512;
const minTextureSize = 64;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = resolve(root, "apps/web/public/models");
const outputDir = resolve(sourceDir, "mobile");
const modelFiles = [
  "banner-post.glb",
  "castle-gate.glb",
  "damaged-farmhouse.glb",
  "farm-scarecrow.glb",
  "fountain-basin.glb",
  "market-stall.glb",
  "sagging-barn.glb",
  "signal-relay-body.glb",
  "town-hanging-sign.glb",
  "town-shopfront.glb",
  "watch-tower.glb",
];

await mkdir(outputDir, { recursive: true });

for (const fileName of modelFiles) {
  const inputPath = resolve(sourceDir, fileName);
  const outputPath = resolve(outputDir, fileName);
  const result = buildMobileGlb(inputPath, outputPath);
  console.log(`${fileName}: ${result.replacedImages} image(s), ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`);
}

function buildMobileGlb(inputPath, outputPath) {
  const input = readFileSync(inputPath);
  const { json, bin } = parseGlb(input);
  const imageByBufferView = new Map();
  let replacedImages = 0;
  const tempDir = mkdtempSync(join(tmpdir(), "mferland-mobile-glb-"));

  try {
    for (let imageIndex = 0; imageIndex < (json.images ?? []).length; imageIndex += 1) {
      const image = json.images[imageIndex];
      if (typeof image.bufferView !== "number" || typeof image.mimeType !== "string") continue;
      if (!/^image\/(png|jpeg|webp)$/.test(image.mimeType)) continue;

      const bufferView = json.bufferViews[image.bufferView];
      if (!bufferView || typeof bufferView.byteLength !== "number") continue;

      const offset = bufferView.byteOffset ?? 0;
      const sourceImage = bin.subarray(offset, offset + bufferView.byteLength);
      const extension = mimeTypeToExtension(image.mimeType);
      const sourcePath = join(tempDir, `image-${imageIndex}${extension}`);
      const outputImagePath = join(tempDir, `image-${imageIndex}-mobile.png`);
      writeFileSync(sourcePath, sourceImage);

      const size = readImageSize(sourcePath);
      const targetSize = getTargetTextureSize(size);
      if (!targetSize) continue;

      execFileSync("sips", [
        "-s",
        "format",
        "png",
        "-z",
        String(targetSize.height),
        String(targetSize.width),
        sourcePath,
        "--out",
        outputImagePath,
      ], { stdio: "ignore" });

      const nextImage = readFileSync(outputImagePath);
      imageByBufferView.set(image.bufferView, nextImage);
      image.mimeType = "image/png";
      replacedImages += 1;

      for (const texture of json.textures ?? []) {
        const webpExtension = texture.extensions?.EXT_texture_webp;
        if (webpExtension?.source === imageIndex) {
          texture.source = imageIndex;
          delete texture.extensions.EXT_texture_webp;
          if (Object.keys(texture.extensions).length === 0) delete texture.extensions;
        }
      }
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }

  removeUnusedWebpExtension(json);
  const nextBin = rebuildBinaryChunk(json, bin, imageByBufferView);
  const output = writeGlb(json, nextBin);
  writeFileSync(outputPath, output);

  return {
    inputBytes: input.byteLength,
    outputBytes: output.byteLength,
    replacedImages,
  };
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("Not a GLB file.");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);

  let cursor = 12;
  let json = null;
  let bin = null;
  while (cursor < buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(cursor);
    const chunkType = buffer.readUInt32LE(cursor + 4);
    const chunkStart = cursor + 8;
    const chunk = buffer.subarray(chunkStart, chunkStart + chunkLength);
    if (chunkType === JSON_CHUNK_TYPE) json = JSON.parse(chunk.toString("utf8"));
    if (chunkType === BIN_CHUNK_TYPE) bin = chunk;
    cursor = chunkStart + align4(chunkLength);
  }

  if (!json || !bin) throw new Error("GLB must contain JSON and BIN chunks.");
  return { json, bin };
}

function rebuildBinaryChunk(json, sourceBin, replacements) {
  const chunks = [];
  let byteOffset = 0;

  for (let index = 0; index < json.bufferViews.length; index += 1) {
    const bufferView = json.bufferViews[index];
    const sourceOffset = bufferView.byteOffset ?? 0;
    const sourceLength = bufferView.byteLength;
    const nextData = replacements.get(index) ?? sourceBin.subarray(sourceOffset, sourceOffset + sourceLength);

    bufferView.byteOffset = byteOffset;
    bufferView.byteLength = nextData.byteLength;
    chunks.push(nextData);

    const paddingLength = align4(nextData.byteLength) - nextData.byteLength;
    if (paddingLength > 0) chunks.push(Buffer.alloc(paddingLength));
    byteOffset += align4(nextData.byteLength);
  }

  json.buffers[0].byteLength = byteOffset;
  return Buffer.concat(chunks, byteOffset);
}

function writeGlb(json, bin) {
  const jsonBuffer = Buffer.from(JSON.stringify(json));
  const paddedJsonLength = align4(jsonBuffer.byteLength);
  const paddedBinLength = align4(bin.byteLength);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;
  const output = Buffer.alloc(totalLength);

  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  output.fill(0x20, 20, 20 + paddedJsonLength);
  jsonBuffer.copy(output, 20);

  const binHeaderOffset = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinLength, binHeaderOffset);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binHeaderOffset + 4);
  bin.copy(output, binHeaderOffset + 8);

  return output;
}

function readImageSize(imagePath) {
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", imagePath], { encoding: "utf8" });
  const width = Number(output.match(/pixelWidth: (\d+)/)?.[1] ?? 0);
  const height = Number(output.match(/pixelHeight: (\d+)/)?.[1] ?? 0);
  if (!width || !height) throw new Error(`Unable to read image dimensions for ${basename(imagePath)}.`);
  return { width, height };
}

function getTargetTextureSize(size) {
  const largestDimension = Math.max(size.width, size.height);
  const scale = Math.min(mobileTextureScale, mobileTextureMaxSize / largestDimension);
  if (!Number.isFinite(scale) || scale >= 0.999) return null;

  const width = Math.min(size.width, Math.max(minTextureSize, Math.round(size.width * scale)));
  const height = Math.min(size.height, Math.max(minTextureSize, Math.round(size.height * scale)));
  if (width === size.width && height === size.height) return null;
  return { width, height };
}

function removeUnusedWebpExtension(json) {
  const usesWebp = (json.textures ?? []).some((texture) => texture.extensions?.EXT_texture_webp);
  if (usesWebp) return;

  json.extensionsUsed = json.extensionsUsed?.filter((extension) => extension !== "EXT_texture_webp");
  json.extensionsRequired = json.extensionsRequired?.filter((extension) => extension !== "EXT_texture_webp");
  if (json.extensionsUsed?.length === 0) delete json.extensionsUsed;
  if (json.extensionsRequired?.length === 0) delete json.extensionsRequired;
}

function mimeTypeToExtension(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return extname(mimeType) || ".img";
}

function align4(value) {
  return (value + 3) & ~3;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
