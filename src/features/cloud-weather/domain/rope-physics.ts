export interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  inverseMass: number;
  pinned: boolean;
}

export interface Constraint {
  a: number;
  b: number;
  restLength: number;
  baseRestLength: number;
  broken: boolean;
}

export interface RopeBody {
  particles: Particle[];
  constraints: Constraint[];
}

export const MIN_GROWTH_SCALE = 0.02;

export function createRopeBody(
  anchorX: number,
  anchorY: number,
  length: number,
  segmentLength = 14,
): RopeBody {
  const count = Math.max(2, Math.round(length / segmentLength) + 1);
  const restLength = length / (count - 1);
  const particles: Particle[] = [];
  const constraints: Constraint[] = [];

  for (let i = 0; i < count; i++) {
    const x = anchorX;
    const y = anchorY + i * restLength;
    particles.push({
      x,
      y,
      prevX: x,
      prevY: y,
      inverseMass: i === 0 ? 0 : 1,
      pinned: i === 0,
    });
    if (i > 0) {
      constraints.push({
        a: i - 1,
        b: i,
        restLength,
        baseRestLength: restLength,
        broken: false,
      });
    }
  }

  return { particles, constraints };
}

export function scaleRestLengths(body: RopeBody, scale: number): void {
  for (const constraint of body.constraints) {
    constraint.restLength = constraint.baseRestLength * scale;
  }
}

export function createGrowingRopeBody(
  anchorX: number,
  anchorY: number,
  length: number,
): RopeBody {
  const body = createRopeBody(anchorX, anchorY, length);
  scaleRestLengths(body, MIN_GROWTH_SCALE);
  const scaledRestLength = body.constraints[0].restLength;
  for (let i = 0; i < body.particles.length; i++) {
    const particle = body.particles[i];
    particle.x = anchorX;
    particle.y = anchorY + i * scaledRestLength;
    particle.prevX = particle.x;
    particle.prevY = particle.y;
  }
  return body;
}

export function distanceToSegment(
  px: number,
  py: number,
  a: Particle,
  b: Particle,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function integrate(
  body: RopeBody,
  accelerationAt: (index: number, particle: Particle) => { ax: number; ay: number },
  dt: number,
  damping = 0.985,
): void {
  const dtSq = dt * dt;
  for (let i = 0; i < body.particles.length; i++) {
    const p = body.particles[i];
    if (p.pinned) {
      continue;
    }
    const { ax, ay } = accelerationAt(i, p);
    const vx = (p.x - p.prevX) * damping;
    const vy = (p.y - p.prevY) * damping;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x += vx + ax * dtSq;
    p.y += vy + ay * dtSq;
  }
}

export function solveConstraints(body: RopeBody, iterations = 12): void {
  const { particles, constraints } = body;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[i];
      if (c.broken) {
        continue;
      }
      const pA = particles[c.a];
      const pB = particles[c.b];
      const totalWeight = pA.inverseMass + pB.inverseMass;
      if (totalWeight === 0) {
        continue;
      }
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        continue;
      }
      const diff = (dist - c.restLength) / dist;
      const shareA = pA.inverseMass / totalWeight;
      const shareB = pB.inverseMass / totalWeight;
      pA.x += dx * diff * shareA;
      pA.y += dy * diff * shareA;
      pB.x -= dx * diff * shareB;
      pB.y -= dy * diff * shareB;
    }
  }
}

export function applyFloor(body: RopeBody, floorY: number): void {
  for (let i = 0; i < body.particles.length; i++) {
    const p = body.particles[i];
    if (p.y > floorY) {
      p.y = floorY;
      p.prevY = p.y;
      p.prevX = p.x - (p.x - p.prevX) * 0.8;
    }
  }
}

export function breakConstraint(body: RopeBody, index: number): void {
  if (index >= 0 && index < body.constraints.length) {
    body.constraints[index].broken = true;
  }
}

export function localAngle(body: RopeBody, index: number): number {
  const last = body.particles.length - 1;
  const prevIndex = Math.max(0, index - 1);
  const nextIndex = Math.min(last, index + 1);
  const prev = body.particles[prevIndex];
  const next = body.particles[nextIndex];
  return Math.atan2(next.y - prev.y, next.x - prev.x);
}
