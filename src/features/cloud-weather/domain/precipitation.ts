import { type Random, randomBetween } from "./random";

export type DropKind = "rain" | "snow" | "splash";

export interface Drop {
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  radius: number;
  phase: number;
  life: number;
}

export interface Streak {
  x: number;
  y: number;
  length: number;
}

export const MAX_RAIN_DROPS = 900;
export const MAX_SNOW_DROPS = 600;
export const MAX_SPLASH_DROPS = 200;

export function spawnRain(
  random: Random,
  x: number,
  y: number,
  wind: number,
): Drop {
  return {
    kind: "rain",
    x,
    y,
    vx: wind * 0.35 + randomBetween(random, -20, 20),
    vy: randomBetween(random, 900, 1300),
    length: randomBetween(random, 12, 22),
    radius: 0,
    phase: 0,
    life: 1,
  };
}

export function spawnSnow(random: Random, x: number, y: number): Drop {
  return {
    kind: "snow",
    x,
    y,
    vx: 0,
    vy: randomBetween(random, 40, 90),
    length: 0,
    radius: randomBetween(random, 1.5, 3.5),
    phase: random() * Math.PI * 2,
    life: 1.5,
  };
}

export function spawnSplashes(random: Random, x: number, y: number): Drop[] {
  return [
    {
      kind: "splash",
      x,
      y,
      vx: randomBetween(random, -80, 80),
      vy: randomBetween(random, -160, -80),
      length: 0,
      radius: 0,
      phase: 0,
      life: 0.3,
    },
    {
      kind: "splash",
      x,
      y,
      vx: randomBetween(random, -80, 80),
      vy: randomBetween(random, -160, -80),
      length: 0,
      radius: 0,
      phase: 0,
      life: 0.3,
    },
  ];
}

export function moveDrop(
  drop: Drop,
  wind: number,
  time: number,
  dt: number,
): void {
  if (drop.kind === "rain") {
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
  } else if (drop.kind === "snow") {
    if (drop.vy > 0) {
      drop.x += (wind * 0.15 + Math.sin(time * 1.5 + drop.phase) * 25) * dt;
      drop.y += drop.vy * dt;
    }
  } else {
    drop.vy += 900 * dt;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.life -= dt;
  }
}
