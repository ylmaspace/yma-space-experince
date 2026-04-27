import { PhysicsWorld, createBody, DragForce, clamp, distance } from "./physics-engine.js";

export const metadata = { name: "RENDEZVOUS", type: "rendezvous", baseDifficulty: 3 };

export function setup({ difficulty = 1, upgrades = {}, specialization = "tecnico" } = {}) {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, airDensity: 0.04 });
  const target = createBody({ id: "target", static: true, x: 180, y: 0, mass: 9999 });
  target.phase = 0;
  const ship = createBody({ id: "ship", x: -280, y: 50, vx: 12, vy: -0.5, mass: 4, area: 1.1, dragCoeff: 0.28, inertia: 1.3 });
  ship.forces.push(new DragForce(0.35));
  ship.stability = 100; ship.heat = 0; ship.controlLoss = false;
  ship.safeLimit = 3.8 + (upgrades.control || 1) * 0.2;
  ship.controlBonus = specialization === "tecnico" ? 1.15 : specialization === "agresivo" ? 0.9 : 1;
  world.addBody(target); world.addBody(ship);
  return { world, target, ship, elapsed: 0, challenge: null, fuel: 100, fuelUsage: 0.55 / (upgrades.fuelEfficiency || 1), thrustBoost: upgrades.thrustPower || 1, camera: { x: ship.x, y: ship.y, zoom: 1, shake: 0 }, particles: [], history: [], effect: { fail: 0, success: 0 }, event: null, eventTime: 0 };
}

export function challengeGenerator({ difficulty = 1, seed = Math.random() } = {}) {
  const maxRelSpeed = clamp(3.4 - difficulty * 0.35, 1.4, 3.4);
  const maxAngleErr = clamp(12 - difficulty * 1.5, 4, 12);
  const holdSeconds = 4 + Math.floor(seed * 3);
  return { objective: "Sincronizar vector y acoplar", parameters: { maxRelSpeed, maxAngleErr, lockDistance: 22, holdSeconds }, success: `Sincroniza velocidad < ${maxRelSpeed.toFixed(1)} y mantén lock ${holdSeconds}s`, fail: "Divergencia de trayectoria, calor o timeout" };
}

export function ui(state) {
  const relV = Math.hypot(state.ship.vx, state.ship.vy);
  const angErr = Math.abs(state.ship.angle * 180 / Math.PI);
  return { title: metadata.name, instructions: state.challenge.success, stats: { relV, dist: distance(state.ship, state.target), fuel: state.fuel, elapsed: state.elapsed, stability: state.ship.stability, heat: state.ship.heat, angErr, event: state.event || "none" } };
}

export function inputHandler(state, action) {
  if (state.fuel <= 0) return;
  const p = 7.4 * state.thrustBoost * state.ship.controlBonus;
  const n = state.ship.controlLoss ? (Math.random() - 0.5) * 0.18 : 0;
  if (action === "UP") state.ship.vy -= p * 0.05 + n;
  if (action === "DOWN") state.ship.vy += p * 0.05 + n;
  if (action === "LEFT") state.ship.vx -= p * 0.05 + n;
  if (action === "RIGHT") state.ship.vx += p * 0.05 + n;
  if (["UP","DOWN","LEFT","RIGHT"].includes(action)) { state.fuel = Math.max(0, state.fuel - state.fuelUsage); state.ship.heat = Math.min(100, state.ship.heat + 2.2); }
}

function triggerEvent(state) {
  const r = Math.random();
  state.event = r < 0.33 ? "solar_wind" : r < 0.66 ? "gyro_drift" : "thruster_dropout";
  state.eventTime = 2.2;
}

export function update(state, dt) {
  state.elapsed += dt;
  state.target.phase += dt * 0.75;
  state.target.x = 160 + Math.cos(state.target.phase) * 85;
  state.target.y = Math.sin(state.target.phase) * 60;

  const speed = Math.hypot(state.ship.vx, state.ship.vy);
  if (speed > state.ship.safeLimit) state.ship.stability = Math.max(0, state.ship.stability - (speed - state.ship.safeLimit) * 7 * dt);
  else state.ship.stability = Math.min(100, state.ship.stability + 2.8 * dt);
  state.ship.heat = Math.max(0, state.ship.heat - 5.5 * dt);
  if (state.ship.heat > 82) state.ship.stability = Math.max(0, state.ship.stability - 8 * dt);
  state.ship.controlLoss = state.ship.stability < 30;

  if (Math.random() < 0.0019 && !state.event) triggerEvent(state);
  if (state.eventTime > 0) {
    state.eventTime -= dt;
    if (state.event === "solar_wind") state.ship.vx += (Math.random() - 0.5) * 0.2;
    if (state.event === "gyro_drift") state.ship.angle += 0.7 * dt;
    if (state.event === "thruster_dropout") { state.ship.vx *= 0.996; state.ship.vy *= 0.996; }
  } else state.event = null;

  state.world.update(dt);
  const d = distance(state.ship, state.target);
  const relSpeed = Math.hypot(state.ship.vx, state.ship.vy);
  const angErr = Math.abs(state.ship.angle * 180 / Math.PI);
  const locked = d <= state.challenge.parameters.lockDistance && relSpeed <= state.challenge.parameters.maxRelSpeed && angErr <= state.challenge.parameters.maxAngleErr;
  state.lock = locked ? (state.lock || 0) + dt : 0;
  const won = (state.lock || 0) >= state.challenge.parameters.holdSeconds;
  const lost = state.elapsed > 95 || state.ship.stability <= 5;

  state.camera.x += (state.ship.x - state.camera.x) * 0.09;
  state.camera.y += (state.ship.y - state.camera.y) * 0.09;
  state.camera.zoom += ((1 + relSpeed * 0.05) - state.camera.zoom) * 0.08;
  if (lost) state.camera.shake = Math.min(10, state.camera.shake + 0.6);
  state.camera.shake *= 0.9;

  state.effect.fail = clamp(state.effect.fail + (lost ? 2.8 * dt : -2.3 * dt), 0, 1);
  state.effect.success = clamp(state.effect.success + (won ? 2.5 * dt : -2.3 * dt), 0, 1);
  state.history.push({ sx: state.ship.x, sy: state.ship.y, tx: state.target.x, ty: state.target.y, angle: state.ship.angle, stability: state.ship.stability, heat: state.ship.heat, t: state.elapsed });
  if (state.history.length > 420) state.history.shift();
  return { won, lost };
}

function draw(snapshot, target, state, ctx, viewport) {
  const { width, height } = viewport;
  const cx = width * 0.5, cy = height * 0.5;
  const shakeX = (Math.random() - 0.5) * state.camera.shake;
  const shakeY = (Math.random() - 0.5) * state.camera.shake;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#081122";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(cx + shakeX, cy + shakeY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);
  ctx.fillStyle = "#7db0ff";
  ctx.beginPath(); ctx.arc(target.x, target.y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(180,230,255,0.5)";
  ctx.beginPath(); ctx.arc(target.x, target.y, state.challenge.parameters.lockDistance, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(snapshot.x, snapshot.y); ctx.rotate(snapshot.angle); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-8,6); ctx.lineTo(-8,-6); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.restore();
  if (state.effect.fail > 0) { ctx.fillStyle = `rgba(255,20,20,${state.effect.fail * 0.35})`; ctx.fillRect(0,0,width,height); }
  if (state.effect.success > 0) { ctx.fillStyle = `rgba(255,255,255,${state.effect.success * 0.55})`; ctx.fillRect(0,0,width,height); }
}

export function render(state, ctx, viewport) { draw({ x: state.ship.x, y: state.ship.y, angle: state.ship.angle }, { x: state.target.x, y: state.target.y }, state, ctx, viewport); }
export function renderReplay(state, ctx, viewport, snap) { draw({ x: snap.sx, y: snap.sy, angle: snap.angle }, { x: snap.tx, y: snap.ty }, state, ctx, viewport); }

export function evaluate(state, won) {
  const d = distance(state.ship, state.target);
  const relSpeed = Math.hypot(state.ship.vx, state.ship.vy);
  const precision = clamp((state.ship.stability + clamp(100 - d * 2.1 - relSpeed * 9, 0, 100)) * 0.5, 0, 100);
  const xp = Math.round(20 + precision * 0.35 + (won ? 52 : 0));
  const nova = won ? Math.round(28 + precision * 0.32) : 0;
  return { won, precision, xp, nova, summary: won ? "Rendezvous perfecto" : "Rendezvous incompleto" };
}
