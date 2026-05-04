/**
 * YLMA Arena: RENDEZVOUS
 * Objetivo: Igualar vector de posición y velocidad con un objetivo móvil.
 */
import { PhysicsWorld, createBody, DragForce, clamp, distance } from "./physics-engine.js";

export const metadata = { name: "ORBITAL RENDEZVOUS", type: "rendezvous", baseDifficulty: 4 };

export function setup({ difficulty = 1, upgrades = {}, specialization = "tecnico" } = {}) {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0.1 }, airDensity: 0.01 });
  
  const target = createBody({ id: "target", x: 200, y: -100, vx: 15, vy: 0, mass: 10, static: false });
  const ship = createBody({ id: "ship", x: -200, y: 100, vx: 5, vy: 0, mass: 4, area: 1.2 });
  
  ship.forces.push(new DragForce(0.3));
  ship.stability = 100;
  ship.heat = 0;
  ship.controlBonus = specialization === "agresivo" ? 1.3 : 1.0;

  world.addBody(target);
  world.addBody(ship);

  return {
    world, target, ship,
    elapsed: 0,
    fuel: 120 + (upgrades.fuelEfficiency * 20),
    camera: { x: 0, y: 0, zoom: 0.8, shake: 0 },
    history: [],
    effect: { fail: 0, success: 0 }
  };
}

export function challengeGenerator({ difficulty = 1 }) {
  const speedTol = clamp(5 - difficulty, 1, 5);
  const distTol = clamp(25 - difficulty * 2, 10, 25);
  return {
    objective: "Sincronización de Vectores",
    parameters: { distTol, speedTol, timeLimit: 60 },
    success: `Distancia < ${distTol}m y Vel Relativa < ${speedTol}m/s`,
    fail: "Timeout o pérdida de estabilidad"
  };
}

export function update(state, dt) {
  state.elapsed += dt;
  state.world.update(dt);

  // Lógica del Objetivo (Movimiento oscilatorio)
  state.target.vx += Math.sin(state.elapsed) * 0.2;
  state.target.vy += Math.cos(state.elapsed) * 0.1;

  const d = distance(state.ship, state.target);
  const relVel = Math.hypot(state.ship.vx - state.target.vx, state.ship.vy - state.target.vy);
  
  const won = d < state.challenge.parameters.distTol && relVel < state.challenge.parameters.speedTol;
  const lost = state.elapsed > state.challenge.parameters.timeLimit || state.ship.stability <= 0;

  // Actualizar Cámara
  state.camera.x = (state.ship.x + state.target.x) / 2;
  state.camera.y = (state.ship.y + state.target.y) / 2;

  state.history.push({ sx: state.ship.x, sy: state.ship.y, tx: state.target.x, ty: state.target.y });
  return { won, lost };
}

export function ui(state) {
  const relVel = Math.hypot(state.ship.vx - state.target.vx, state.ship.vy - state.target.vy);
  return {
    title: metadata.name,
    instructions: state.challenge.success,
    stats: {
      dist: distance(state.ship, state.target),
      relVel: relVel,
      fuel: state.fuel,
      stability: state.ship.stability
    }
  };
}

export function render(state, ctx, viewport) {
  const { width, height } = viewport;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width/2, height/2);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  // Dibujar Objetivo
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(state.target.x, state.target.y, 15, 0, Math.PI*2);
  ctx.fill();

  // Dibujar Nave
  ctx.fillStyle = "#00ffff";
  ctx.fillRect(state.ship.x - 10, state.ship.y - 10, 20, 20);
  ctx.restore();
}

export function evaluate(state, won) {
  const xp = won ? 100 : 20;
  const nova = won ? 50 : 0;
  return { won, xp, nova, summary: won ? "Encuentro Exitoso" : "Misión Fallida" };
}
