import { type Random, randomBetween, randomInt } from "./random";

export interface PaperLine {
  text: string;
  size: number;
}

export const PAPER_LABELS: readonly PaperLine[][] = [
  [
    { text: "Letters", size: 16 },
    { text: "recall failure", size: 10 },
  ],
  [
    { text: "fragment /", size: 10 },
    { text: "fragmentary", size: 10 },
  ],
  [
    { text: "whisper /", size: 14 },
    { text: "murmur", size: 14 },
  ],
  [
    { text: "loose syntax", size: 12 },
    { text: "paper voice", size: 12 },
  ],
  [
    { text: "misalignment", size: 11 },
    { text: "fragile", size: 11 },
  ],
  [
    { text: "hanging text", size: 10 },
    { text: "afterimage", size: 10 },
  ],
  [
    { text: "gravity of words", size: 8 },
    { text: "tether", size: 15 },
  ],
];

export interface PaperSize {
  width: number;
  height: number;
}

export interface Paper {
  spriteIndex: number;
  slotIndex: number;
  particleIndex: number;
  width: number;
  height: number;
  spin: number;
  spinVelocity: number;
  restSpin: number;
  tilt: number;
  phase: number;
  wetness: number;
  snowLoad: number;
}

export function layoutPapersForRope(
  slotIndex: number,
  ropeLength: number,
  paperSizes: readonly PaperSize[],
  random: Random,
): Paper[] {
  if (paperSizes.length === 0) {
    return [];
  }

  const lastIndex = Math.max(1, Math.round(ropeLength / 14));
  const papers: Paper[] = [];
  let d = randomBetween(random, 50, 90);

  while (true) {
    const spriteIndex = randomInt(random, 0, paperSizes.length - 1);
    const size = paperSizes[spriteIndex];
    const h = size.height;
    if (d + h > ropeLength - 8) {
      break;
    }
    const c = d + h / 2;
    const particleIndex = Math.min(Math.round(c / 14), lastIndex);
    const restSpin = random() < 0.2 ? Math.PI : 0;
    papers.push({
      spriteIndex,
      slotIndex,
      particleIndex,
      width: size.width,
      height: h,
      spin: restSpin,
      spinVelocity: 0,
      restSpin,
      tilt: randomBetween(random, -0.08, 0.08),
      phase: random() * Math.PI * 2,
      wetness: 0,
      snowLoad: 0,
    });
    d += h + randomBetween(random, 24, 64);
  }

  return papers;
}
