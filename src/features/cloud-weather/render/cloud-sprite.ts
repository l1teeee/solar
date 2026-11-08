import type { RgbColor } from "../domain/weather";

export interface CloudTinter {
  aspect: number;
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: RgbColor,
  ): void;
  drawInk(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, alpha: number): void;
}

export async function loadCloudMask(src: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    throw new Error("Cloud image failed to load: " + src);
  }

  const scale = img.naturalWidth > 1600 ? 1600 / img.naturalWidth : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cloud image failed to load: " + src);
  }

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const alpha = lum >= 240 ? 0 : Math.round(255 * (1 - lum / 240));
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = alpha;

      if (alpha > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const cropX = Math.max(0, minX - 2);
  const cropY = Math.max(0, minY - 2);
  const cropRight = Math.min(width - 1, maxX + 2);
  const cropBottom = Math.min(height - 1, maxY + 2);
  const cropWidth = cropRight - cropX + 1;
  const cropHeight = cropBottom - cropY + 1;

  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const cropCtx = cropped.getContext("2d");
  if (!cropCtx) {
    return canvas;
  }

  cropCtx.drawImage(
    canvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
  return cropped;
}

export function createCloudTinter(mask: HTMLCanvasElement): CloudTinter {
  const aspect = mask.height / mask.width;
  const offscreen = document.createElement("canvas");
  offscreen.width = mask.width;
  offscreen.height = mask.height;
  const offCtx = offscreen.getContext("2d");

  let lastR = -1;
  let lastG = -1;
  let lastB = -1;

  return {
    aspect,
    draw(ctx, x, y, width, height, color) {
      if (!offCtx) {
        return;
      }
      const r = Math.round(color.r);
      const g = Math.round(color.g);
      const b = Math.round(color.b);

      if (r !== lastR || g !== lastG || b !== lastB) {
        lastR = r;
        lastG = g;
        lastB = b;

        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.drawImage(mask, 0, 0);
        offCtx.globalCompositeOperation = "source-in";
        offCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
        offCtx.globalCompositeOperation = "source-over";
      }

      ctx.drawImage(offscreen, x, y, width, height);
    },
    drawInk(ctx, x, y, width, height, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(mask, x, y, width, height);
      ctx.restore();
    },
  };
}
