import { PhysicsWorld, createBody, DragForce, clamp, distance } from "./physics-engine.js";

export const metadata = { name: "DOCKING PRECISION", type: "docking", baseDifficulty: 3 };

export function setup({ difficulty = 1, upgrades = {}, specialization = "tecnico" } = {}) {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, airDensity: 0.05 });
  const station = createBody({ id: "station", static: true, x: 130, y: -20, mass: 9999 });
  station.orbitAngle = 0;
  const ship = createBody({ id: "ship", x: -240, y: 20, vx: 18, vy: 0, mass: 4, area: 1.2, dragCoeff: 0.3, inertia: 1.5 });
  ship.forces.push(new DragForce(0.45));
  ship.stability = 100; ship.heat = 0; ship.controlLoss = false;
  ship.safeLimit = 4.4 + (upgrades.control || 1) * 0.25;
  ship.controlBonus = specialization === "tecnico" ? 1.2 : specialization === "agresivo" ? 0.85 : 1;

  world.addBody(station); world.addBody(ship);
  return {
    world, station, ship,
    elapsed: 0,
    challenge: null,
    fuel: 100,
    fuelUsage: 0.6 / (upgrades.fuelEfficiency || 1),
    thrustBoost: upgrades.thrustPower || 1,
    camera: { x: ship.x, y: ship.y, zoom: 1, shake: 0 },
    particles: [],
    history: [],
    effect: { fail: 0, success: 0 },
    event: null,
    eventTime: 0,
  };
}

export function challengeGenerator({ difficulty = 1, seed = Math.random() } = {}) {
  const moving = seed > 0.4;
  const rotating = seed > 0.66;
  const maxSpeed = clamp(4.1 - difficulty * 0.42, 2.0, 4.1);
  const angleTolerance = clamp(18 - difficulty * 2, 6, 18);
  return {
    objective: "Acople milimétrico",
    parameters: { moving, rotating, maxSpeed, angleTolerance, dockDistance: 18, requiredAngle: Math.PI * 0.5 },
    success: `vel<=${maxSpeed.toFixed(1)} y error angular<=${angleTolerance}°`,
    fail: "Colisión, sobrecalentamiento o timeout",
  };
}

export function ui(state) {
  const relV = Math.hypot(state.ship.vx, state.ship.vy);
  const angErr = Math.abs((state.ship.angle - state.challenge.parameters.requiredAngle) * 180 / Math.PI);
  return {
    title: metadata.name,
    instructions: state.challenge.success,
    stats: { relV, fuel: state.fuel, dist: distance(state.ship, state.station), elapsed: state.elapsed, stability: state.ship.stability, heat: state.ship.heat, angErr, event: state.event || "none" },
  };
}

export function inputHandler(state, action) {
  if (state.fuel <= 0) return;
  const power = 8 * state.thrustBoost * state.ship.controlBonus;
  const jitter = state.ship.controlLoss ? (Math.random() - 0.5) * 0.18 : 0;
  if (action === "UP") state.ship.vy -= power * 0.05 + jitter;
  if (action === "DOWN") state.ship.vy += power * 0.05 + jitter;
  if (action === "LEFT") state.ship.vx -= power * 0.05 + jitter;
  if (action === "RIGHT") state.ship.vx += power * 0.05 + jitter;
  if (action === "THRUST_ON") state.ship.heat = Math.min(100, state.ship.heat + 2.5);
  if (["UP", "DOWN", "LEFT", "RIGHT", "THRUST_ON"].includes(action)) {
    state.fuel = Math.max(0, state.fuel - state.fuelUsage);
    for (let i = 0; i < 2; i++) state.particles.push({ x: state.ship.x, y: state.ship.y, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18, life: 0.35 });
  }
}

function triggerEvent(state) {
  const roll = Math.random();
  state.event = roll < 0.33 ? "solar_wind" : roll < 0.66 ? "partial_thruster" : "gyro_drift";
  state.eventTime = 2.4;
}

export function update(state, dt) {
  state.elapsed += dt;
  const p = state.challenge.parameters;
  if (p.moving) {
    state.station.orbitAngle += dt * 0.6;
    state.station.x = 120 + Math.cos(state.station.orbitAngle) * 45;
    state.station.y = Math.sin(state.station.orbitAngle) * 28;
  }
  if (p.rotating) state.ship.angle += 0.18 * dt;

  const speed = Math.hypot(state.ship.vx, state.ship.vy);
  if (speed > state.ship.safeLimit) state.ship.stability = Math.max(0, state.ship.stability - (speed - state.ship.safeLimit) * 7 * dt);
  else state.ship.stability = Math.min(100, state.ship.stability + 2.6 * dt);
  state.ship.heat = Math.max(0, state.ship.heat - 6 * dt);
  if (state.ship.heat > 80) state.ship.stability = Math.max(0, state.ship.stability - 8 * dt);
  state.ship.controlLoss = state.ship.stability < 32;

  if (Math.random() < 0.0018 && !state.event) triggerEvent(state);
  if (state.eventTime > 0) {
    state.eventTime -= dt;
    if (state.event === "solar_wind") state.ship.vx += (Math.random() - 0.5) * 0.25;
    if (state.event === "partial_thruster") { state.ship.vx *= 0.995; state.ship.vy *= 0.995; }
    if (state.event === "gyro_drift") state.ship.angle += 0.7 * dt;
  } else state.event = null;

  state.world.update(dt);
  const d = distance(state.ship, state.station);
  const relSpeed = Math.hypot(state.ship.vx, state.ship.vy);
  const angErr = Math.abs((state.ship.angle - p.requiredAngle) * 180 / Math.PI);
  const closeEnough = d <= p.dockDistance;
  const won = closeEnough && relSpeed <= p.maxSpeed && angErr <= p.angleTolerance;
  const lost = (closeEnough && relSpeed > p.maxSpeed * 1.8) || state.elapsed > 80 || state.ship.stability < 5;

  state.camera.x += (state.ship.x - state.camera.x) * 0.09;
  state.camera.y += (state.ship.y - state.camera.y) * 0.09;
  state.camera.zoom += ((1 + relSpeed * 0.04) - state.camera.zoom) * 0.08;
  if (lost) state.camera.shake = Math.min(9, state.camera.shake + 0.6);
  state.camera.shake *= 0.9;

  state.particles = state.particles.map((pt) => ({ ...pt, x: pt.x + pt.vx * dt, y: pt.y + pt.vy * dt, life: pt.life - dt })).filter((pt) => pt.life > 0);
  state.effect.fail = clamp(state.effect.fail + (lost ? 2.8 * dt : -2.5 * dt), 0, 1);
  state.effect.success = clamp(state.effect.success + (won ? 2.5 * dt : -2.4 * dt), 0, 1);

  state.history.push({ sx: state.ship.x, sy: state.ship.y, tx: state.station.x, ty: state.station.y, angle: state.ship.angle, stability: state.ship.stability, heat: state.ship.heat, t: state.elapsed });
  if (state.history.length > 450) state.history.shift();

  return { won, lost };
}

function drawScene(snapshot, stationSnapshot, state, ctx, viewport) {
  const { width, height } = viewport;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const shakeX = (Math.random() - 0.5) * state.camera.shake;
  const shakeY = (Math.random() - 0.5) * state.camera.shake;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#061229";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(cx + shakeX, cy + shakeY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  ctx.fillStyle = "#7db0ff";
  ctx.fillRect(stationSnapshot.x - 22, stationSnapshot.y - 22, 44, 44);
  ctx.strokeStyle = "rgba(190,230,255,0.5)";
  ctx.beginPath();
  ctx.arc(stationSnapshot.x, stationSnapshot.y, state.challenge.parameters.dockDistance, 0, Math.PI * 2);
  ctx.stroke();

  for (const p of state.particles) {
    ctx.fillStyle = `rgba(255,220,140,${p.life})`;
    ctx.fillRect(p.x, p.y, 2, 2);
  }

  ctx.save();
  ctx.translate(snapshot.x, snapshot.y);
  ctx.rotate(snapshot.angle);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-8, 6);
  ctx.lineTo(-8, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  if (state.effect.fail > 0) {
    ctx.fillStyle = `rgba(255,25,25,${state.effect.fail * 0.4})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.effect.success > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.effect.success * 0.5})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function render(state, ctx, viewport) { drawScene({ x: state.ship.x, y: state.ship.y, angle: state.ship.angle }, { x: state.station.x, y: state.station.y }, state, ctx, viewport); }
export function renderReplay(state, ctx, viewport, snapshot) { drawScene({ x: snapshot.sx, y: snapshot.sy, angle: snapshot.angle }, { x: snapshot.tx, y: snapshot.ty }, state, ctx, viewport); }

export function evaluate(state, won) {
  const relSpeed = Math.hypot(state.ship.vx, state.ship.vy);
  const d = distance(state.ship, state.station);
  const precision = clamp((state.ship.stability + clamp(100 - d * 2 - relSpeed * 8, 0, 100)) * 0.5, 0, 100);
  const xp = Math.round(18 + precision * 0.36 + (won ? 48 : 0));
  const nova = won ? Math.round(26 + precision * 0.32) : 0;
  return { won, precision, xp, nova, summary: won ? "Acople quirúrgico" : "Acople no logrado" };
}
