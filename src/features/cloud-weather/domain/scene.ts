import {
  type Paper,
  type PaperSize,
  layoutPapersForRope,
} from "./papers";
import {
  type Drop,
  MAX_RAIN_DROPS,
  MAX_SNOW_DROPS,
  MAX_SPLASH_DROPS,
  type Streak,
  moveDrop,
  spawnRain,
  spawnSnow,
  spawnSplashes,
} from "./precipitation";
import {
  type Random,
  createRandom,
  randomBetween,
  randomInt,
} from "./random";
import {
  type RopeBody,
  MIN_GROWTH_SCALE,
  applyFloor,
  breakConstraint,
  createGrowingRopeBody,
  distanceToSegment,
  integrate,
  scaleRestLengths,
  solveConstraints,
} from "./rope-physics";
import {
  type RgbColor,
  type RgbaColor,
  WEATHER_PROFILES,
  type WeatherKind,
  mixColor,
  mixRgba,
  nextWeather,
  windAt,
} from "./weather";

export interface Viewport {
  width: number;
  height: number;
}

export interface PointerSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SceneInput {
  pointer: PointerSample | null;
  reducedMotion: boolean;
}

export interface RopeSlot {
  slotIndex: number;
  anchorFraction: number;
  lengthFraction: number;
  body: RopeBody;
  strength: number;
  stress: number;
  broken: boolean;
  opacity: number;
  fade: "out" | "none";
  growth: number;
  brokenAt: number | null;
}

export const CUT_RADIUS = 28;

export interface CutTarget {
  slotIndex: number;
  constraintIndex: number;
}

export interface SceneLayout {
  cloudWidth: number;
  cloudHeight: number;
  cloudLeft: number;
  cloudTop: number;
  anchorY: number;
  floorY: number;
  ropeBottomY: number;
}

export interface LightningBolt {
  points: { x: number; y: number }[];
  life: number;
}

export interface SceneState {
  viewport: Viewport;
  layout: SceneLayout;
  time: number;
  weather: {
    kind: WeatherKind;
    elapsed: number;
  };
  cloudColor: RgbColor;
  sceneTint: RgbaColor;
  wind: number;
  cloudOffsetX: number;
  cloudOffsetY: number;
  slots: RopeSlot[];
  papers: Paper[];
  drops: Drop[];
  streaks: Streak[];
  rainAccumulator: number;
  snowAccumulator: number;
  lightning: {
    timer: number;
    flashAge: number | null;
    bolt: LightningBolt | null;
  };
  paperSizes: readonly PaperSize[];
  random: Random;
}

const ALL_SLOT_SPECS: readonly [number, number][] = [
  [0.18, 0.86],
  [0.32, 0.97],
  [0.44, 0.74],
  [0.56, 1.0],
  [0.68, 0.82],
  [0.82, 0.93],
];

const COMPACT_SLOT_INDEXES = [0, 1, 3, 5] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cloudWidthFor(viewport: Viewport): number {
  return Math.min(viewport.width * (viewport.width < 768 ? 0.62 : 0.32), 520);
}

export function createScene(
  viewport: Viewport,
  cloudAspect: number,
  paperSizes: readonly PaperSize[],
  seed: number,
): SceneState {
  const random = createRandom(seed);
  const compact = viewport.width < 768;
  const cloudWidth = cloudWidthFor(viewport);
  const cloudHeight = cloudWidth * cloudAspect;
  const cloudLeft = (viewport.width - cloudWidth) / 2;
  const cloudTop = viewport.height * 0.16;
  const anchorY = cloudTop + cloudHeight * 0.72;
  const floorY = viewport.height - 8;
  const ropeBottomY = viewport.height * 0.86;

  const selectedSpecs = compact
    ? COMPACT_SLOT_INDEXES.map((i) => ALL_SLOT_SPECS[i])
    : ALL_SLOT_SPECS;

  const slots: RopeSlot[] = [];
  const papers: Paper[] = [];
  const spanY = ropeBottomY - anchorY;

  for (let slotIndex = 0; slotIndex < selectedSpecs.length; slotIndex++) {
    const [anchorFraction, lengthFraction] = selectedSpecs[slotIndex];
    const anchorX = cloudLeft + anchorFraction * cloudWidth;
    const ropeLength = lengthFraction * spanY;
    const body = createGrowingRopeBody(anchorX, anchorY, ropeLength);
    const strength = randomBetween(random, 0.3, 2.1);
    slots.push({
      slotIndex,
      anchorFraction,
      lengthFraction,
      body,
      strength,
      stress: 0,
      broken: false,
      opacity: 1,
      fade: "none",
      growth: 0,
      brokenAt: null,
    });
    const slotPapers = layoutPapersForRope(
      slotIndex,
      ropeLength,
      paperSizes,
      random,
    );
    papers.push(...slotPapers);
  }

  const calmProfile = WEATHER_PROFILES.calm;

  return {
    viewport: { width: viewport.width, height: viewport.height },
    layout: {
      cloudWidth,
      cloudHeight,
      cloudLeft,
      cloudTop,
      anchorY,
      floorY,
      ropeBottomY,
    },
    time: 0,
    weather: {
      kind: "calm",
      elapsed: 0,
    },
    cloudColor: { ...calmProfile.cloudColor },
    sceneTint: { ...calmProfile.sceneTint },
    wind: 0,
    cloudOffsetX: 0,
    cloudOffsetY: 0,
    slots,
    papers,
    drops: [],
    streaks: [],
    rainAccumulator: 0,
    snowAccumulator: 0,
    lightning: {
      timer: randomBetween(random, 1.5, 3),
      flashAge: null,
      bolt: null,
    },
    paperSizes,
    random,
  };
}

function isRopeIntact(slot: RopeSlot): boolean {
  return !slot.broken && slot.fade === "none" && slot.growth >= 1;
}

function breakSlot(scene: SceneState, slot: RopeSlot, constraintIndex: number): void {
  breakConstraint(slot.body, constraintIndex);
  slot.broken = true;
  slot.brokenAt = scene.time;
}

export function findCutTarget(scene: SceneState, x: number, y: number): CutTarget | null {
  let target: CutTarget | null = null;
  let nearest = CUT_RADIUS;
  for (const slot of scene.slots) {
    if (!isRopeIntact(slot)) continue;
    for (let i = 1; i < slot.body.constraints.length; i++) {
      const constraint = slot.body.constraints[i];
      if (constraint.broken) continue;
      const distance = distanceToSegment(x, y, slot.body.particles[constraint.a], slot.body.particles[constraint.b]);
      if (distance <= nearest) {
        nearest = distance;
        target = { slotIndex: slot.slotIndex, constraintIndex: i };
      }
    }
  }
  return target;
}

export function cutRope(scene: SceneState, target: CutTarget): void {
  const slot = scene.slots[target.slotIndex];
  if (slot && isRopeIntact(slot)) {
    breakSlot(scene, slot, target.constraintIndex);
  }
}

export function paperReveal(slot: RopeSlot, paper: Paper): number {
  return slot.growth >= 1
    ? 1
    : clamp((slot.growth - paper.particleIndex / (slot.body.particles.length - 1)) / 0.08, 0, 1);
}

export function carryWeatherOver(from: SceneState, to: SceneState): void {
  to.weather.kind = from.weather.kind;
  to.weather.elapsed = from.weather.elapsed;
  to.cloudColor = { ...from.cloudColor };
  to.sceneTint = { ...from.sceneTint };
}

export function getFlashEnvelope(scene: SceneState): number {
  const age = scene.lightning.flashAge;
  if (age === null) {
    return 0;
  }
  if (age <= 0.08) {
    return 1;
  }
  if (age <= 0.14) {
    return 0.2;
  }
  if (age <= 0.22) {
    return 0.8;
  }
  if (age <= 0.45) {
    return (0.8 * (0.45 - age)) / 0.23;
  }
  return 0;
}

export function stepScene(
  scene: SceneState,
  input: SceneInput,
  dt: number,
): void {
  // 1. Time and weather cycle
  scene.time += dt;
  scene.weather.elapsed += dt;
  const initialProfile = WEATHER_PROFILES[scene.weather.kind];
  if (scene.weather.elapsed >= initialProfile.durationSeconds) {
    scene.weather.kind = nextWeather(scene.weather.kind);
    scene.weather.elapsed = 0;
  }
  const profile = WEATHER_PROFILES[scene.weather.kind];

  // 2. Color and tint interpolation
  const k = 1 - Math.exp(-dt / 0.8);
  scene.cloudColor = mixColor(scene.cloudColor, profile.cloudColor, k);
  scene.sceneTint = mixRgba(scene.sceneTint, profile.sceneTint, k);

  // 3. Wind and cloud offset
  scene.wind = windAt(profile, scene.time);
  scene.cloudOffsetX = Math.sin(scene.time * 0.4) * 10 + scene.wind * 0.02;
  scene.cloudOffsetY = Math.sin(scene.time * 0.6) * 4;

  const { cloudLeft, cloudWidth, anchorY, floorY, ropeBottomY } = scene.layout;
  const pointer = input.pointer;

  // 4. Ropes integration and constraints
  for (let s = 0; s < scene.slots.length; s++) {
    const slot = scene.slots[s];
    const anchorX =
      cloudLeft + scene.cloudOffsetX + slot.anchorFraction * cloudWidth;
    const anchorYPos = anchorY + scene.cloudOffsetY;
    const p0 = slot.body.particles[0];
    p0.x = anchorX;
    p0.y = anchorYPos;
    p0.prevX = anchorX;
    p0.prevY = anchorYPos;

    const paperParticles = new Set<number>();
    for (let p = 0; p < scene.papers.length; p++) {
      const paper = scene.papers[p];
      if (paper.slotIndex === slot.slotIndex) {
        paperParticles.add(paper.particleIndex);
      }
    }

    integrate(
      slot.body,
      (index, particle) => {
        const windFactor = paperParticles.has(index) ? 1.4 : 1;
        let ax = scene.wind * windFactor;
        let ay = 900;

        if (pointer !== null) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < 80) {
            const f = (1 - d / 80) * (1 - d / 80);
            if (d > 0) {
              ax += (dx / d) * 1400 * f;
              ay += (dy / d) * 1400 * f;
            }
            particle.prevX -= pointer.vx * dt * 0.35 * f;
            particle.prevY -= pointer.vy * dt * 0.35 * f;
          }
        }

        return { ax, ay };
      },
      dt,
    );

    solveConstraints(slot.body);
    applyFloor(slot.body, floorY);
  }

  // 5. Papers dynamics
  for (let i = 0; i < scene.papers.length; i++) {
    const paper = scene.papers[i];
    const slot = scene.slots[paper.slotIndex];
    const particle = slot.body.particles[paper.particleIndex];
    if (!particle.pinned) {
      particle.inverseMass =
        1 / (2.5 + paper.wetness * 2 + paper.snowLoad * 3);
    }

    paper.spinVelocity +=
      (-(paper.spin - paper.restSpin) * 4 -
        paper.spinVelocity * 1.2 +
        scene.wind * 0.004 * Math.sin(scene.time * 1.3 + paper.phase)) *
      dt;

    if (pointer !== null) {
      const d = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
      if (d < 110) {
        paper.spinVelocity += pointer.vx * 0.0008 * (1 - d / 110);
      }
    }

    paper.spin += paper.spinVelocity * dt;
    paper.wetness = clamp(
      paper.wetness - profile.dryingPerSecond * dt,
      0,
      1,
    );
    paper.snowLoad = clamp(
      paper.snowLoad - profile.meltingPerSecond * dt,
      0,
      1,
    );
  }

  // 6. Precipitation and streaks
  const rateScale = (input.reducedMotion ? 0.4 : 1) * (cloudWidth / 1000);
  scene.rainAccumulator += profile.rainPerSecond * rateScale * dt;
  scene.snowAccumulator += profile.snowPerSecond * rateScale * dt;

  let rainCount = 0;
  let snowCount = 0;
  let splashCount = 0;
  for (let i = 0; i < scene.drops.length; i++) {
    const kind = scene.drops[i].kind;
    if (kind === "rain") rainCount++;
    else if (kind === "snow") snowCount++;
    else splashCount++;
  }

  while (scene.rainAccumulator >= 1) {
    scene.rainAccumulator -= 1;
    if (rainCount < MAX_RAIN_DROPS) {
      const x =
        cloudLeft +
        scene.cloudOffsetX +
        cloudWidth * (0.05 + scene.random() * 0.9);
      const y = anchorY - 10;
      scene.drops.push(spawnRain(scene.random, x, y, scene.wind));
      rainCount++;
    }
  }

  while (scene.snowAccumulator >= 1) {
    scene.snowAccumulator -= 1;
    if (snowCount < MAX_SNOW_DROPS) {
      const x =
        cloudLeft +
        scene.cloudOffsetX +
        cloudWidth * (0.05 + scene.random() * 0.9);
      const y = anchorY - 10;
      scene.drops.push(spawnSnow(scene.random, x, y));
      snowCount++;
    }
  }

  const nextDrops: Drop[] = [];
  const pendingSplashes: Drop[] = [];

  for (let i = 0; i < scene.drops.length; i++) {
    const drop = scene.drops[i];
    moveDrop(drop, scene.wind, scene.time, dt);

    if (drop.x < -50 || drop.x > scene.viewport.width + 50) {
      continue;
    }

    if (drop.kind === "rain" || drop.kind === "snow") {
      let absorbed = false;
      for (let p = 0; p < scene.papers.length; p++) {
        const paper = scene.papers[p];
        const slot = scene.slots[paper.slotIndex];
        if (slot.opacity <= 0.5 || paperReveal(slot, paper) < 1) {
          continue;
        }
        const particle = slot.body.particles[paper.particleIndex];
        if (
          Math.abs(drop.x - particle.x) < paper.width / 2 &&
          Math.abs(drop.y - particle.y) < paper.height / 2
        ) {
          if (drop.kind === "rain") {
            paper.wetness = Math.min(1, paper.wetness + 0.035);
          } else {
            paper.snowLoad = Math.min(1, paper.snowLoad + 0.04);
          }
          absorbed = true;
          break;
        }
      }
      if (absorbed) {
        continue;
      }
    }

    if (drop.kind === "rain") {
      if (drop.y >= floorY) {
        if (splashCount < MAX_SPLASH_DROPS) {
          const splashes = spawnSplashes(scene.random, drop.x, floorY);
          for (let s = 0; s < splashes.length; s++) {
            if (splashCount < MAX_SPLASH_DROPS) {
              pendingSplashes.push(splashes[s]);
              splashCount++;
            }
          }
        }
        continue;
      }
      nextDrops.push(drop);
    } else if (drop.kind === "snow") {
      if (drop.y >= floorY) {
        drop.vx = 0;
        drop.vy = 0;
        drop.y = floorY;
        drop.life -= dt;
        if (drop.life <= 0) {
          continue;
        }
      }
      nextDrops.push(drop);
    } else {
      if (drop.life > 0) {
        nextDrops.push(drop);
      }
    }
  }

  for (let i = 0; i < pendingSplashes.length; i++) {
    nextDrops.push(pendingSplashes[i]);
  }
  scene.drops = nextDrops;

  if (scene.wind > 150) {
    while (scene.streaks.length < 16) {
      scene.streaks.push({
        x: randomBetween(scene.random, 0, scene.viewport.width),
        y: randomBetween(scene.random, anchorY, floorY),
        length: randomBetween(scene.random, 40, 120),
      });
    }
    for (let i = 0; i < scene.streaks.length; i++) {
      const streak = scene.streaks[i];
      streak.x += scene.wind * 1.6 * dt;
      if (streak.x > scene.viewport.width + streak.length) {
        streak.x = -streak.length;
      }
    }
  } else {
    scene.streaks.length = 0;
  }

  // 7. Stress on ropes
  const windLoad = scene.wind / 500;
  for (let s = 0; s < scene.slots.length; s++) {
    const slot = scene.slots[s];
    if (!isRopeIntact(slot)) {
      continue;
    }

    let n = 0;
    let wetSum = 0;
    let snowSum = 0;
    for (let p = 0; p < scene.papers.length; p++) {
      const paper = scene.papers[p];
      if (paper.slotIndex === slot.slotIndex) {
        n++;
        wetSum += paper.wetness;
        snowSum += paper.snowLoad;
      }
    }

    const wetAvg = n === 0 ? 0 : wetSum / n;
    const snowAvg = n === 0 ? 0 : snowSum / n;

    let load = 0;
    if (scene.weather.kind === "rain") {
      load = wetAvg;
    } else if (scene.weather.kind === "wind") {
      load = windLoad;
    } else if (scene.weather.kind === "snow") {
      load = snowAvg;
    } else if (scene.weather.kind === "storm") {
      load = Math.max(wetAvg, windLoad);
    }

    slot.stress +=
      profile.stressPerSecond *
      (0.5 + 0.5 * Math.min(load, 1.5)) *
      (1 + n * 0.08) *
      dt;

    if (slot.stress >= slot.strength) {
      const maxBreakIndex = Math.max(
        1,
        Math.floor(slot.body.constraints.length * 0.5),
      );
      const breakIndex = randomInt(scene.random, 1, maxBreakIndex);
      breakSlot(scene, slot, breakIndex);
    }
  }

  // 8. Lightning
  if (scene.lightning.flashAge !== null) {
    scene.lightning.flashAge += dt;
    if (scene.lightning.flashAge > 0.45) {
      scene.lightning.flashAge = null;
    }
  }
  if (scene.lightning.bolt !== null) {
    scene.lightning.bolt.life -= dt;
    if (scene.lightning.bolt.life <= 0) {
      scene.lightning.bolt = null;
    }
  }

  if (scene.weather.kind !== "storm") {
    scene.lightning.timer = randomBetween(scene.random, 1.5, 3);
  } else {
    scene.lightning.timer -= dt;
    if (scene.lightning.timer <= 0) {
      scene.lightning.timer = randomBetween(scene.random, 2.5, 6);
      scene.lightning.flashAge = 0;

      const intactSlots = scene.slots.filter(isRopeIntact);
      let target: { x: number; y: number };

      if (intactSlots.length > 0 && scene.random() < 0.4) {
        const chosen =
          intactSlots[randomInt(scene.random, 0, intactSlots.length - 1)];
        const maxConstraintIdx = Math.max(
          1,
          Math.floor(chosen.body.constraints.length / 2),
        );
        const i = randomInt(scene.random, 1, maxConstraintIdx);
        const targetParticle = chosen.body.particles[i];
        target = { x: targetParticle.x, y: targetParticle.y };
        breakSlot(scene, chosen, i);
      } else {
        target = {
          x:
            cloudLeft +
            scene.cloudOffsetX +
            scene.random() * cloudWidth,
          y: floorY,
        };
      }

      const startX = target.x + randomBetween(scene.random, -40, 40);
      const startY = anchorY;
      const points: { x: number; y: number }[] = [];
      for (let idx = 0; idx < 9; idx++) {
        const t = idx / 8;
        const baseX = startX + (target.x - startX) * t;
        const baseY = startY + (target.y - startY) * t;
        const jitterX =
          idx === 0 || idx === 8
            ? 0
            : randomBetween(scene.random, -18, 18);
        points.push({ x: baseX + jitterX, y: baseY });
      }

      scene.lightning.bolt = {
        points,
        life: 0.22,
      };
    }
  }

  // 9. Fades
  const spanY = ropeBottomY - anchorY;
  for (let s = 0; s < scene.slots.length; s++) {
    const slot = scene.slots[s];
    if (!slot.broken && slot.growth < 1) {
      slot.growth = Math.min(1, slot.growth + dt / 2.5);
      scaleRestLengths(slot.body, Math.max(MIN_GROWTH_SCALE, 1 - (1 - slot.growth) ** 3));
    }
    if (slot.broken && slot.fade === "none" && slot.brokenAt !== null && scene.time - slot.brokenAt >= 6) {
      slot.fade = "out";
    }
    if (slot.fade === "out") {
      slot.opacity -= dt / 0.8;
      if (slot.opacity <= 0) {
        const anchorX =
          cloudLeft +
          scene.cloudOffsetX +
          slot.anchorFraction * cloudWidth;
        const anchorYPos = anchorY + scene.cloudOffsetY;
        const ropeLength = slot.lengthFraction * spanY;
        slot.body = createGrowingRopeBody(anchorX, anchorYPos, ropeLength);
        slot.strength = randomBetween(scene.random, 0.3, 2.1);
        slot.stress = 0;
        slot.broken = false;
        slot.opacity = 1;
        slot.fade = "none";
        slot.growth = 0;
        slot.brokenAt = null;

        scene.papers = scene.papers.filter(
          (p) => p.slotIndex !== slot.slotIndex,
        );
        const newPapers = layoutPapersForRope(
          slot.slotIndex,
          ropeLength,
          scene.paperSizes,
          scene.random,
        );
        scene.papers.push(...newPapers);
      }
    }
  }
}
