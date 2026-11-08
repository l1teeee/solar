export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaColor extends RgbColor {
  a: number;
}

export function mixColor(a: RgbColor, b: RgbColor, t: number): RgbColor {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function mixRgba(a: RgbaColor, b: RgbaColor, t: number): RgbaColor {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

export type WeatherKind = "calm" | "rain" | "wind" | "snow" | "storm";

export const WEATHER_CYCLE: readonly WeatherKind[] = [
  "calm",
  "rain",
  "wind",
  "snow",
  "storm",
];

export function nextWeather(kind: WeatherKind): WeatherKind {
  const index = WEATHER_CYCLE.indexOf(kind);
  if (index === -1 || index === WEATHER_CYCLE.length - 1) {
    return "calm";
  }
  return WEATHER_CYCLE[index + 1];
}

export interface WeatherProfile {
  kind: WeatherKind;
  label: string;
  durationSeconds: number;
  cloudColor: RgbColor;
  sceneTint: RgbaColor;
  baseWind: number;
  gustAmplitude: number;
  rainPerSecond: number;
  snowPerSecond: number;
  stressPerSecond: number;
  lightning: boolean;
  dryingPerSecond: number;
  meltingPerSecond: number;
}

export const WEATHER_PROFILES: Record<WeatherKind, WeatherProfile> = {
  calm: {
    kind: "calm",
    label: "Calma",
    durationSeconds: 6,
    cloudColor: { r: 0x12, g: 0x12, b: 0x12 },
    sceneTint: { r: 0, g: 0, b: 0, a: 0 },
    baseWind: 0,
    gustAmplitude: 18,
    rainPerSecond: 0,
    snowPerSecond: 0,
    stressPerSecond: 0,
    lightning: false,
    dryingPerSecond: 0.25,
    meltingPerSecond: 0.25,
  },
  rain: {
    kind: "rain",
    label: "Lluvia",
    durationSeconds: 14,
    cloudColor: { r: 0x3f, g: 0x9f, b: 0xd6 },
    sceneTint: { r: 60, g: 90, b: 110, a: 0.06 },
    baseWind: 30,
    gustAmplitude: 60,
    rainPerSecond: 220,
    snowPerSecond: 0,
    stressPerSecond: 0.045,
    lightning: false,
    dryingPerSecond: 0,
    meltingPerSecond: 0.2,
  },
  wind: {
    kind: "wind",
    label: "Viento",
    durationSeconds: 12,
    cloudColor: { r: 0x6f, g: 0x93, b: 0xaa },
    sceneTint: { r: 90, g: 100, b: 110, a: 0.05 },
    baseWind: 260,
    gustAmplitude: 380,
    rainPerSecond: 0,
    snowPerSecond: 0,
    stressPerSecond: 0.05,
    lightning: false,
    dryingPerSecond: 0.12,
    meltingPerSecond: 0.1,
  },
  snow: {
    kind: "snow",
    label: "Nieve",
    durationSeconds: 14,
    cloudColor: { r: 0x7f, g: 0xb2, b: 0xd0 },
    sceneTint: { r: 220, g: 235, b: 245, a: 0.1 },
    baseWind: 20,
    gustAmplitude: 50,
    rainPerSecond: 0,
    snowPerSecond: 140,
    stressPerSecond: 0.045,
    lightning: false,
    dryingPerSecond: 0.05,
    meltingPerSecond: 0,
  },
  storm: {
    kind: "storm",
    label: "Tormenta",
    durationSeconds: 14,
    cloudColor: { r: 0x2b, g: 0x33, b: 0x40 },
    sceneTint: { r: 20, g: 28, b: 40, a: 0.2 },
    baseWind: 180,
    gustAmplitude: 420,
    rainPerSecond: 480,
    snowPerSecond: 0,
    stressPerSecond: 0.055,
    lightning: true,
    dryingPerSecond: 0,
    meltingPerSecond: 0.3,
  },
};

export function windAt(profile: WeatherProfile, time: number): number {
  const gustFactor =
    0.5 + 0.3 * Math.sin(0.9 * time) + 0.2 * Math.sin(2.3 * time + 1.7);
  return Math.max(0, profile.baseWind + profile.gustAmplitude * gustFactor);
}
