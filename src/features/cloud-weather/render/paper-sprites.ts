import { PAPER_LABELS, type PaperLine } from "../domain/papers";
import { type Random, randomBetween } from "../domain/random";

export interface PaperSprite {
  dry: HTMLCanvasElement;
  wet: HTMLCanvasElement;
  blank: HTMLCanvasElement;
  width: number;
  height: number;
  margin: number;
}

interface Point {
  x: number;
  y: number;
}

const MARGIN = 6;

function createScaledCanvas(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D context for paper sprite");
  }
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function buildTornPolygon(
  width: number,
  height: number,
  margin: number,
  random: Random,
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    points.push({
      x: margin + t * width,
      y: margin + randomBetween(random, -1, 1),
    });
  }

  for (let i = 0; i < 8; i++) {
    const t = (i + 1) / 8;
    points.push({
      x: margin + width + randomBetween(random, -2.5, 2.5),
      y: margin + t * height,
    });
  }

  for (let i = 0; i < 6; i++) {
    const t = 1 - i / 5;
    points.push({
      x: margin + t * width,
      y: margin + height + randomBetween(random, -1, 1),
    });
  }

  for (let i = 0; i < 8; i++) {
    const t = 1 - (i + 1) / 8;
    points.push({
      x: margin + randomBetween(random, -2.5, 2.5),
      y: margin + t * height,
    });
  }

  return points;
}

function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (i === 0) {
      ctx.moveTo(pt.x, pt.y);
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.closePath();
}

function measureLabel(
  measureCtx: CanvasRenderingContext2D,
  lines: readonly PaperLine[],
  fontFamily: string,
  scale: number,
): { width: number; height: number; padX: number; padY: number } {
  const padX = 7 * scale;
  const padY = 5 * scale;
  let maxTextWidth = 0;
  let totalLineHeight = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fontSize = line.size * scale;
    measureCtx.font = `${fontSize}px ${fontFamily}`;
    const measured = measureCtx.measureText(line.text).width;
    if (measured > maxTextWidth) {
      maxTextWidth = measured;
    }
    totalLineHeight += fontSize * 1.08;
  }

  return {
    width: maxTextWidth + 2 * padX,
    height: totalLineHeight + 2 * padY,
    padX,
    padY,
  };
}

export function buildPaperSprites(
  fontFamily: string,
  scale: number,
  dpr: number,
  random: Random,
): PaperSprite[] {
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    throw new Error("Could not create measure context");
  }

  const sprites: PaperSprite[] = [];

  for (let l = 0; l < PAPER_LABELS.length; l++) {
    const lines = PAPER_LABELS[l];
    const { width, height, padX, padY } = measureLabel(
      measureCtx,
      lines,
      fontFamily,
      scale,
    );
    const totalW = width + 2 * MARGIN;
    const totalH = height + 2 * MARGIN;

    for (let variant = 0; variant < 2; variant++) {
      const isVariantB = variant === 1;
      const polygon = buildTornPolygon(width, height, MARGIN, random);

      // 1. Dry sprite
      const { canvas: dry, ctx: dryCtx } = createScaledCanvas(
        totalW,
        totalH,
        dpr,
      );
      dryCtx.save();
      dryCtx.shadowColor = "rgba(0,0,0,0.14)";
      dryCtx.shadowBlur = 4;
      dryCtx.shadowOffsetX = 0;
      dryCtx.shadowOffsetY = 1.5;
      dryCtx.fillStyle = "#f7f5ef";
      tracePolygon(dryCtx, polygon);
      dryCtx.fill();
      dryCtx.restore();

      dryCtx.save();
      tracePolygon(dryCtx, polygon);
      dryCtx.clip();

      for (let d = 0; d < 140; d++) {
        const dx = MARGIN + random() * width;
        const dy = MARGIN + random() * height;
        const alpha = randomBetween(random, 0.03, 0.09);
        dryCtx.fillStyle = `rgba(0,0,0,${alpha})`;
        dryCtx.fillRect(dx, dy, 1, 1);
      }

      if (isVariantB) {
        dryCtx.fillStyle = "rgba(0,0,0,0.05)";
        for (let s = 0; s < 3; s++) {
          const sy = MARGIN + random() * height;
          const sh = randomBetween(random, 1, 2);
          dryCtx.fillRect(MARGIN - 4, sy, width + 8, sh);
        }
      }

      dryCtx.fillStyle = "#1b1b1b";
      dryCtx.textBaseline = "top";
      let cursorY = MARGIN + padY;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fontSize = line.size * scale;
        const lineHeight = fontSize * 1.08;
        dryCtx.font = `${fontSize}px ${fontFamily}`;
        if (isVariantB) {
          dryCtx.globalAlpha = 0.3;
          dryCtx.fillText(line.text, MARGIN + padX + 1.2, cursorY);
          dryCtx.globalAlpha = 1;
        }
        dryCtx.fillText(line.text, MARGIN + padX, cursorY);
        cursorY += lineHeight;
      }
      dryCtx.restore();

      // 2. Wet sprite
      const { canvas: wet, ctx: wetCtx } = createScaledCanvas(
        totalW,
        totalH,
        dpr,
      );
      wetCtx.drawImage(dry, 0, 0, totalW, totalH);
      wetCtx.globalCompositeOperation = "source-atop";
      wetCtx.fillStyle = "rgba(70,95,115,0.28)";
      wetCtx.fillRect(0, 0, totalW, totalH);
      wetCtx.fillStyle = "rgba(60,80,100,0.12)";
      for (let c = 0; c < 5; c++) {
        const cx = MARGIN + random() * width;
        const cy = MARGIN + random() * height;
        const radius = randomBetween(random, 4, 10) * scale;
        wetCtx.beginPath();
        wetCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        wetCtx.fill();
      }
      wetCtx.globalCompositeOperation = "source-over";

      // 3. Blank sprite
      const { canvas: blank, ctx: blankCtx } = createScaledCanvas(
        totalW,
        totalH,
        dpr,
      );
      blankCtx.fillStyle = "#f7f5ef";
      tracePolygon(blankCtx, polygon);
      blankCtx.fill();

      sprites.push({
        dry,
        wet,
        blank,
        width,
        height,
        margin: MARGIN,
      });
    }
  }

  return sprites;
}
