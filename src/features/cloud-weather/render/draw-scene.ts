import { localAngle } from "../domain/rope-physics";
import { type SceneState, getFlashEnvelope, paperReveal } from "../domain/scene";
import { type RgbColor, mixColor } from "../domain/weather";
import type { CloudTinter } from "./cloud-sprite";
import type { PaperSprite } from "./paper-sprites";

export interface SceneAssets {
  cloud: CloudTinter;
  sprites: PaperSprite[];
}

const FLASH_TINT_COLOR: RgbColor = { r: 0xdf, g: 0xe9, b: 0xf5 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneState,
  assets: SceneAssets,
  reducedMotion: boolean,
): void {
  const { width: viewW, height: viewH } = scene.viewport;

  // 1. Clear and scene tint
  ctx.clearRect(0, 0, viewW, viewH);
  if (scene.sceneTint.a > 0.005) {
    const { r, g, b, a } = scene.sceneTint;
    ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // 2. Wind streaks
  if (scene.streaks.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(30,30,30,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < scene.streaks.length; i++) {
      const streak = scene.streaks[i];
      ctx.moveTo(streak.x, streak.y);
      ctx.lineTo(streak.x + streak.length, streak.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 3. Strings per slot
  ctx.save();
  ctx.lineWidth = 1.1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let s = 0; s < scene.slots.length; s++) {
    const slot = scene.slots[s];
    if (slot.opacity <= 0) {
      continue;
    }
    const { particles, constraints } = slot.body;
    if (particles.length === 0) {
      continue;
    }
    ctx.strokeStyle = `rgba(200,68,60,${0.85 * slot.opacity})`;
    ctx.beginPath();
    ctx.moveTo(particles[0].x, particles[0].y);
    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[i];
      const pB = particles[c.b];
      if (c.broken) {
        ctx.moveTo(pB.x, pB.y);
      } else {
        ctx.lineTo(pB.x, pB.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();

  // 4. Drops
  if (scene.drops.length > 0) {
    const rainColor =
      scene.weather.kind === "storm"
        ? "rgba(50,70,90,0.6)"
        : "rgba(70,110,140,0.55)";

    ctx.save();
    ctx.strokeStyle = rainColor;
    ctx.fillStyle = rainColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < scene.drops.length; i++) {
      const drop = scene.drops[i];
      if (drop.kind === "rain") {
        const tailX = drop.x - (drop.vx / drop.vy) * drop.length;
        const tailY = drop.y - drop.length;
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(tailX, tailY);
      } else if (drop.kind === "splash") {
        ctx.fillRect(drop.x - 0.75, drop.y - 0.75, 1.5, 1.5);
      }
    }
    ctx.stroke();

    ctx.fillStyle = "#fbfbfb";
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < scene.drops.length; i++) {
      const drop = scene.drops[i];
      if (drop.kind !== "snow") {
        continue;
      }
      const landed = drop.vy === 0;
      ctx.globalAlpha = landed ? Math.max(0, drop.life / 1.5) : 1;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 5. Cloud
  const flashEnvelope = getFlashEnvelope(scene);
  const { cloudLeft, cloudTop, cloudWidth, cloudHeight } = scene.layout;
  const tintedCloudColor = mixColor(
    scene.cloudColor,
    FLASH_TINT_COLOR,
    flashEnvelope * 0.6,
  );
  ctx.save();
  ctx.shadowColor = "rgba(20,30,40,0.22)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  assets.cloud.draw(
    ctx,
    cloudLeft + scene.cloudOffsetX,
    cloudTop + scene.cloudOffsetY,
    cloudWidth,
    cloudHeight,
    tintedCloudColor,
  );
  ctx.restore();
  assets.cloud.drawInk(
    ctx,
    cloudLeft + scene.cloudOffsetX,
    cloudTop + scene.cloudOffsetY,
    cloudWidth,
    cloudHeight,
    0.28,
  );

  // 6. Papers
  for (let i = 0; i < scene.papers.length; i++) {
    const paper = scene.papers[i];
    const slot = scene.slots[paper.slotIndex];
    if (!slot) {
      continue;
    }
    const alpha = slot.opacity * paperReveal(slot, paper);
    if (alpha <= 0) {
      continue;
    }
    const sprite = assets.sprites[paper.spriteIndex];
    if (!sprite) {
      continue;
    }
    const particle = slot.body.particles[paper.particleIndex];
    const angle =
      localAngle(slot.body, paper.particleIndex) - Math.PI / 2 + paper.tilt;
    const cosSpin = Math.cos(paper.spin);
    const sx =
      Math.abs(cosSpin) < 0.06 ? (cosSpin < 0 ? -0.06 : 0.06) : cosSpin;

    const { width, height, margin } = sprite;
    const drawX = -width / 2 - margin;
    const drawY = -height / 2 - margin;
    const drawW = width + 2 * margin;
    const drawH = height + 2 * margin;

    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(angle);
    ctx.scale(sx, 1);

    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.dry, drawX, drawY, drawW, drawH);

    if (paper.wetness > 0.01) {
      ctx.globalAlpha = alpha * paper.wetness;
      ctx.drawImage(sprite.wet, drawX, drawY, drawW, drawH);
    }

    if (cosSpin < 0) {
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(sprite.blank, drawX, drawY, drawW, drawH);
    }

    if (paper.snowLoad > 0.01) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(253,253,253,0.95)";
      ctx.beginPath();
      for (let pt = 0; pt < 7; pt++) {
        const px = -width / 2 + (pt / 6) * width;
        const py =
          -height / 2 -
          (2 + 6 * paper.snowLoad) *
            (0.6 + 0.4 * Math.sin(pt * 1.7 + paper.phase));
        if (pt === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.lineTo(width / 2, -height / 2 + 1);
      ctx.lineTo(-width / 2, -height / 2 + 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // 7. Bolt
  const bolt = scene.lightning.bolt;
  if (bolt !== null && bolt.points.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(207,232,255,0.9)";
    ctx.beginPath();
    for (let i = 0; i < bolt.points.length; i++) {
      const pt = bolt.points[i];
      if (i === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.restore();
  }

  // 8. Flash
  if (!reducedMotion && flashEnvelope > 0) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.35 * flashEnvelope;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}
