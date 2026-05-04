/**
 * YLMA Physics Engine - Core Module
 * Gestiona la aritmética vectorial y la integración de movimiento.
 */

export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class PhysicsWorld {
  constructor({ gravity = { x: 0, y: 0 }, airDensity = 0.02 } = {}) {
    this.gravity = gravity;
    this.airDensity = airDensity;
    this.bodies = [];
  }

  addBody(body) {
    this.bodies.push(body);
  }

  update(dt) {
    for (const body of this.bodies) {
      if (body.static) continue;

      // Aplicar Gravedad
      body.vx += this.gravity.x * dt;
      body.vy += this.gravity.y * dt;

      // Aplicar Fuerzas (como DragForce)
      for (const force of body.forces) {
        force.apply(body, this.airDensity, dt);
      }

      // Integración de posición (Euler Semieimplícito)
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.angle += (body.angularVelocity || 0) * dt;
    }
  }
}

export function createBody(props) {
  return {
    id: props.id || Math.random(),
    x: props.x || 0,
    y: props.y || 0,
    vx: props.vx || 0,
    vy: props.vy || 0,
    mass: props.mass || 1,
    angle: props.angle || 0,
    angularVelocity: 0,
    area: props.area || 1,
    static: props.static || false,
    forces: [],
    ...props
  };
}

export class DragForce {
  constructor(coeff = 0.47) {
    this.coeff = coeff;
  }

  apply(body, airDensity, dt) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < 0.01) return;

    // Fd = 1/2 * rho * v^2 * Cd * A
    const dragMag = 0.5 * airDensity * (speed * speed) * this.coeff * body.area;
    const nx = body.vx / speed;
    const ny = body.vy / speed;

    body.vx -= (dragMag * nx / body.mass) * dt;
    body.vy -= (dragMag * ny / body.mass) * dt;
  }
}
