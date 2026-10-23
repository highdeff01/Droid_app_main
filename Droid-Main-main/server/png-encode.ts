import { deflateSync } from "node:zlib";

/** Raw screen pixels as delivered by a native capture (row stride may exceed width * channels). */
export interface RawPixels {
  width: number;
  height: number;
  data: Buffer;
  channels: number;
  byteWidth: number;
  /** True when the pixel order is BGR(A) instead of RGB(A). */
  bgr: boolean;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, tail]);
}

/** Rows of RGB pixels, each prefixed with PNG filter byte 0. */
function rgbScanlines(pixels: RawPixels): Buffer {
  const { width, height, data, channels, byteWidth, bgr } = pixels;
  const out = Buffer.alloc(height * (width * 3 + 1));
  let o = 0;
  for (let y = 0; y < height; y++) {
    out[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * byteWidth + x * channels;
      out[o++] = data[bgr ? i + 2 : i];
      out[o++] = data[i + 1];
      out[o++] = data[bgr ? i : i + 2];
    }
  }
  return out;
}

/** Encodes raw 3/4-channel pixels as an RGB PNG. */
export function encodePng(pixels: RawPixels): Buffer {
  if (pixels.width < 1 || pixels.height < 1 || pixels.channels < 3) {
    throw new Error("Cannot encode an empty or non-RGB screen image");
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(pixels.width, 0);
  header.writeUInt32BE(pixels.height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type RGB
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rgbScanlines(pixels))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
