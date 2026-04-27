export class PhysicsWorld {
  constructor({ gravity = { x: 0, y: 0 }, airDensity = 1.225, dtClamp = 0.05 } = {}) {
    this.gravity = gravity;
    this.airDensity = airDensity;
    this.dtClamp = dtClamp;
    this.bodies = [];
    this.time = 0;
  }

  addBody(body) { this.bodies.push(body); return body; }

  update(dt) {
    const step = Math.max(0, Math.min(this.dtClamp, Number(dt) || 0));
    if (!step) return;

    for (const b of this.bodies) {
      b.fx = 0; b.fy = 0; b.torque = 0;
      if (b.static) continue;
      b.fx += this.gravity.x * b.mass;
      b.fy += this.gravity.y * b.mass;
      for (const force of b.forces) force.apply?.(b, this, step);
    }

    for (const b of this.bodies) {
      if (b.static) continue;
      b.vx += (b.fx / b.mass) * step;
      b.vy += (b.fy / b.mass) * step;
      b.x += b.vx * step;
      b.y += b.vy * step;
      b.angularVelocity += (b.torque / b.inertia) * step;
      b.angle += b.angularVelocity * step;
    }

    this.time += step;
  }
}

export function createBody(c = {}) {
  return {
    id: c.id || null,
    x: c.x || 0,
    y: c.y || 0,
    vx: c.vx || 0,
    vy: c.vy || 0,
    angle: c.angle || 0,
    angularVelocity: c.angularVelocity || 0,
    mass: Math.max(1e-4, c.mass ?? 1),
    inertia: Math.max(1e-4, c.inertia ?? 1),
    area: Math.max(1e-4, c.area ?? 1),
    dragCoeff: Math.max(0, c.dragCoeff ?? 0.5),
    static: Boolean(c.static),
    fx: 0,
    fy: 0,
    torque: 0,
    forces: Array.isArray(c.forces) ? c.forces : [],
  };
}

export class GravityForce {
  constructor(G = 8, epsilon = 0.01) { this.G = G; this.epsilon = epsilon; }
  apply(body, world) {
    for (const other of world.bodies) {
      if (other === body) continue;
      const dx = other.x - body.x;
      const dy = other.y - body.y;
      const d2 = dx * dx + dy * dy + this.epsilon;
      const d = Math.sqrt(d2);
      const f = (this.G * body.mass * other.mass) / d2;
      body.fx += f * (dx / d);
      body.fy += f * (dy / d);
    }
  }
}

export class DragForce {
  constructor(mult = 1) { this.mult = mult; }
  apply(body, world) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < 1e-4) return;
    const drag = 0.5 * world.airDensity * speed * speed * body.dragCoeff * body.area * this.mult;
    body.fx -= drag * (body.vx / speed);
    body.fy -= drag * (body.vy / speed);
  }
}

export class ThrustForce {
  constructor(power = 10) { this.power = power; this.active = false; this.throttle = 1; }
  apply(body) {
    if (!this.active) return;
    const p = this.power * Math.max(0, Math.min(1, this.throttle));
    body.fx += Math.cos(body.angle) * p;
    body.fy += Math.sin(body.angle) * p;
  }
}

export class TorqueForce {
  constructor(power = 1) { this.power = power; this.direction = 0; }
  apply(body) { body.torque += this.power * this.direction; }
}

export const kineticEnergy = (b) => 0.5 * b.mass * (b.vx ** 2 + b.vy ** 2);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));


