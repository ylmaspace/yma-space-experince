/**
 * YLMA Physics Engine - Core Module
 * Proporciona las herramientas básicas de cálculo vectorial y dinámica.
 */

// Utilidades matemáticas básicas
export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class PhysicsWorld {
  constructor({ gravity = { x: 0, y: 0 }, airDensity = 0 } = {}) {
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

      // 1. Aplicar Gravedad Global
      body.vx += this.gravity.x * dt;
      body.vy += this.gravity.y * dt;

      // 2. Aplicar Fuerzas externas (como DragForce)
      for (const force of body.forces) {
        force.apply(body, this.airDensity, dt);
      }

      // 3. Actualizar Posición
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      
      // 4. Actualizar Rotación (Inercia simplificada)
      body.angle += (body.angularVelocity || 0) * dt;
    }
  }
}

/**
 * Crea un objeto físico con propiedades base.
 */
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
    static: props.static || false,
    forces: [],
    ...props
  };
}

/**
 * Fuerza de resistencia (Air Drag / Rozamiento)
 */
export class DragForce {
  constructor(coefficient = 0.47) {
    this.coeff = coefficient;
  }

  apply(body, airDensity, dt) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed <= 0) return;

    // Fd = 1/2 * rho * v^2 * Cd * A
    const forceMag = 0.5 * airDensity * (speed * speed) * this.coeff * (body.area || 1);
    
    // Aplicar en dirección opuesta al movimiento
    const unitX = body.vx / speed;
    const unitY = body.vy / speed;

    body.vx -= (forceMag * unitX / body.mass) * dt;
    body.vy -= (forceMag * unitY / body.mass) * dt;
  }
}
