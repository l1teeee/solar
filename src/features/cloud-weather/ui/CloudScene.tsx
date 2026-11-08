"use client";

import { useEffect, useRef, useState } from "react";
import { createRandom } from "../domain/random";
import {
  type PointerSample,
  type SceneState,
  carryWeatherOver,
  cloudWidthFor,
  createScene,
  cutRope,
  findCutTarget,
  stepScene,
} from "../domain/scene";
import {
  type CloudTinter,
  createCloudTinter,
  loadCloudMask,
} from "../render/cloud-sprite";
import { type SceneAssets, drawScene } from "../render/draw-scene";
import { buildPaperSprites } from "../render/paper-sprites";

interface TrackedPointer extends PointerSample {
  timeStamp: number;
  lastMovePerfNow: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function CloudScene() {
  const [loadError, setLoadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const assetsRef = useRef<SceneAssets | null>(null);
  const pointerRef = useRef<TrackedPointer | null>(null);
  const reducedMotionRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;
    let rafId = 0;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let cloudTinter: CloudTinter | null = null;
    let resolvedFontFamily = "monospace";

    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const build = () => {
      if (disposed || !cloudTinter) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const scale = clamp(cloudWidthFor({ width, height }) / 640, 0.55, 0.85);
      const sprites = buildPaperSprites(
        resolvedFontFamily,
        scale,
        dpr,
        createRandom(7),
      );
      const paperSizes = sprites.map((s) => ({
        width: s.width,
        height: s.height,
      }));

      const prevScene = sceneRef.current;
      const nextScene = createScene(
        { width, height },
        cloudTinter.aspect,
        paperSizes,
        1337,
      );

      if (prevScene !== null) {
        carryWeatherOver(prevScene, nextScene);
      }

      assetsRef.current = { cloud: cloudTinter, sprites };
      sceneRef.current = nextScene;
    };

    const pointerPosition = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const trackPointer = (e: PointerEvent, x: number, y: number) => {
      const prev = pointerRef.current;
      const nowPerf = performance.now();

      if (prev === null) {
        pointerRef.current = {
          x,
          y,
          vx: 0,
          vy: 0,
          timeStamp: e.timeStamp,
          lastMovePerfNow: nowPerf,
        };
        return;
      }

      const dtEvent = Math.max((e.timeStamp - prev.timeStamp) / 1000, 0.001);
      const rawVx = (x - prev.x) / dtEvent;
      const rawVy = (y - prev.y) / dtEvent;
      const vx = clamp(prev.vx * 0.65 + rawVx * 0.35, -3000, 3000);
      const vy = clamp(prev.vy * 0.65 + rawVy * 0.35, -3000, 3000);

      pointerRef.current = {
        x,
        y,
        vx,
        vy,
        timeStamp: e.timeStamp,
        lastMovePerfNow: nowPerf,
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const { x, y } = pointerPosition(e);
      trackPointer(e, x, y);
      const scene = sceneRef.current;
      canvas.style.cursor = scene && findCutTarget(scene, x, y) ? "pointer" : "default";
    };

    const handlePointerDown = (e: PointerEvent) => {
      const { x, y } = pointerPosition(e);
      trackPointer(e, x, y);
      const scene = sceneRef.current;
      if (e.button === 0 && scene) {
        const target = findCutTarget(scene, x, y);
        if (target) {
          cutRope(scene, target);
        }
      }
    };

    const handlePointerLeaveOrCancel = () => {
      pointerRef.current = null;
      canvas.style.cursor = "default";
    };

    const handleResize = () => {
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        build();
      }, 200);
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerleave", handlePointerLeaveOrCancel);
    canvas.addEventListener("pointercancel", handlePointerLeaveOrCancel);
    window.addEventListener("resize", handleResize);

    const setup = async () => {
      try {
        const cssFont = getComputedStyle(document.documentElement)
          .getPropertyValue("--font-special-elite")
          .trim();
        if (cssFont) {
          resolvedFontFamily = cssFont;
        }
        await document.fonts.load("16px " + resolvedFontFamily);
        const mask = await loadCloudMask("/images/cloud.png");
        if (disposed) {
          return;
        }
        cloudTinter = createCloudTinter(mask);
        build();

        let lastTime = performance.now();
        let accumulator = 0;

        const tick = (now: number) => {
          if (disposed) {
            return;
          }
          const frameDt = Math.min((now - lastTime) / 1000, 0.1);
          lastTime = now;
          accumulator += frameDt;

          const currentPointer = pointerRef.current;
          if (
            currentPointer !== null &&
            now - currentPointer.lastMovePerfNow > 100
          ) {
            currentPointer.vx *= 0.85;
            currentPointer.vy *= 0.85;
          }

          const currentScene = sceneRef.current;
          const currentAssets = assetsRef.current;
          const ctx = canvas.getContext("2d");

          if (currentScene && currentAssets && ctx) {
            const fixedDt = 1 / 60;
            let steps = 0;
            while (accumulator >= fixedDt && steps < 4) {
              stepScene(
                currentScene,
                {
                  pointer: pointerRef.current,
                  reducedMotion: reducedMotionRef.current,
                },
                fixedDt,
              );
              accumulator -= fixedDt;
              steps++;
            }
            if (steps === 4) {
              accumulator = 0;
            }

            drawScene(
              ctx,
              currentScene,
              currentAssets,
              reducedMotionRef.current,
            );

          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch {
        if (!disposed) {
          setLoadError("No se pudo cargar la escena.");
        }
      }
    };

    void setup();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerleave", handlePointerLeaveOrCancel);
      canvas.removeEventListener("pointercancel", handlePointerLeaveOrCancel);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        role="img"
        aria-label="Nube con papeles colgando de hilos rojos. El clima cambia entre calma, lluvia, viento, nieve y tormenta. Haz clic en un hilo para cortarlo."
      />
      {loadError !== null && (
        <p role="alert" className="absolute bottom-4 left-4 text-sm text-ink">
          {loadError}
        </p>
      )}
    </>
  );
}
