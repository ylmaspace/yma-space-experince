import { PhysicsWorld, createBody, GravityForce, DragForce, ThrustForce, clamp } from "./physics-engine.js";

export const metadata = { name: "ORBIT CORRECTOR", type: "orbit", baseDifficulty: 2 };

export function setup({ difficulty = 1, upgrades = {}, specialization = "tecnico" } = {}) {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, airDensity: 0.0012 });
  const planet = createBody({ id: "planet", mass: 18000, static: true, x: 0, y: 0 });
  const ship = createBody({ id: "ship", mass: 5, area: 1.8, dragCoeff: 0.12, x: 220, y: -10, vx: -0.2, vy: 1.7 + difficulty * 0.08, inertia: 2 });
  ship.stability = 100; ship.heat = 0; ship.controlLoss = false;
  ship.safeLimit = 2.4 + (upgrades.control || 1) * 0.35;
  ship.controlBias = specialization === "tecnico" ? 0.8 : specialization === "agresivo" ? 1.25 : 1;

  ship.forces.push(new GravityForce(42), new DragForce(1));
  const thrust = new ThrustForce(28 * (upgrades.thrustPower || 1));
  ship.forces.push(thrust);
  world.addBody(planet); world.addBody(ship);

  return {
    world, ship, planet, thrust,
    fuel: 100,
    fuelUsage: 8 / (upgrades.fuelEfficiency || 1),
    elapsed: 0,
    successTime: 0,
    challenge: null,
    particles: [],
    history: [],
    camera: { x: ship.x, y: ship.y, zoom: 1, shake: 0 },
    effect: { fail: 0, success: 0 },
    event: null,
    eventTime: 0,
  };
}

export function challengeGenerator({ difficulty = 1, seed = Math.random() } = {}) {
  const variants = ["elliptic_hold", "periapsis_window", "transfer_injection"];
  const variant = variants[Math.floor(seed * variants.length)];
  const targetRadius = 170 + Math.floor(seed * 70);
  const tolerance = clamp(18 - difficulty * 1.7, 7, 18);
  const holdSeconds = 6 + Math.floor(difficulty * 2);
  return {
    objective: "Dominar mecánica orbital",
    variant,
    parameters: { targetRadius, tolerance, holdSeconds },
    success: `${variant}: mantener radio objetivo con control térmico`,
    fail: "Pérdida de control o combustible crítico",
  };
}

export function ui(state) {
  return {
    title: metadata.name,
    instructions: state.challenge?.success || "Estabiliza órbita",
    stats: {
      fuel: state.fuel,
      elapsed: state.elapsed,
      radius: Math.hypot(state.ship.x, state.ship.y),
      speed: Math.hypot(state.ship.vx, state.ship.vy),
      stability: state.ship.stability,
      heat: state.ship.heat,
      event: state.event || "none",
    },
  };
}

export function inputHandler(state, action) {
  if (state.fuel <= 0) return;
  const noise = state.ship.controlLoss ? (Math.random() - 0.5) * 0.22 : 0;
  if (action === "THRUST_ON") state.thrust.active = true;
  if (action === "THRUST_OFF") state.thrust.active = false;
  if (action === "LEFT") state.ship.angle -= 0.08 * state.ship.controlBias + noise;
  if (action === "RIGHT") state.ship.angle += 0.08 * state.ship.controlBias + noise;
}

function triggerEvent(state) {
  const roll = Math.random();
  state.event = roll < 0.34 ? "solar_wind" : roll < 0.67 ? "partial_engine" : "drift_spin";
  state.eventTime = 2.6;
}

export function update(state, dt) {
  state.elapsed += dt;
  const speed = Math.hypot(state.ship.vx, state.ship.vy);

  if (speed > state.ship.safeLimit) state.ship.stability = Math.max(0, state.ship.stability - (speed - state.ship.safeLimit) * 6 * dt);
  else state.ship.stability = Math.min(100, state.ship.stability + 3 * dt);

  if (state.thrust.active) {
    state.fuel = Math.max(0, state.fuel - state.fuelUsage * dt);
    state.ship.heat = Math.min(100, state.ship.heat + 18 * dt);
  } else {
    state.ship.heat = Math.max(0, state.ship.heat - 9 * dt);
  }

  if (state.ship.heat > 82) state.ship.stability = Math.max(0, state.ship.stability - 9 * dt);
  state.ship.controlLoss = state.ship.stability < 30;

  if (Math.random() < 0.0018 && !state.event) triggerEvent(state);
  if (state.eventTime > 0) {
    state.eventTime -= dt;
    if (state.event === "solar_wind") state.ship.vx += (Math.random() - 0.5) * 0.3;
    if (state.event === "partial_engine") state.thrust.throttle = 0.45;
    if (state.event === "drift_spin") state.ship.angle += 0.9 * dt;
  } else {
    state.event = null;
    state.thrust.throttle = 1;
  }

  state.world.update(dt);

  const radius = Math.hypot(state.ship.x, state.ship.y);
  const { targetRadius, tolerance, holdSeconds } = state.challenge.parameters;
  const stable = Math.abs(radius - targetRadius) <= tolerance && state.ship.stability > 35;
  state.successTime = stable ? state.successTime + dt : 0;
  const won = state.successTime >= holdSeconds;
  const lost = (state.fuel <= 0 && !won) || state.ship.stability <= 5;

  state.camera.x += (state.ship.x - state.camera.x) * 0.08;
  state.camera.y += (state.ship.y - state.camera.y) * 0.08;
  state.camera.zoom += ((1 + speed * 0.08) - state.camera.zoom) * 0.08;
  if (lost) state.camera.shake = Math.min(10, state.camera.shake + 0.45);
  state.camera.shake *= 0.9;

  if (state.thrust.active) {
    for (let i = 0; i < 3; i++) state.particles.push({ x: state.ship.x, y: state.ship.y, vx: -Math.cos(state.ship.angle) * (18 + i * 4), vy: -Math.sin(state.ship.angle) * (18 + i * 4), life: 0.45 });
  }
  state.particles = state.particles.map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt })).filter((p) => p.life > 0);

  state.effect.fail = clamp(state.effect.fail + (lost ? 2.4 * dt : -2.8 * dt), 0, 1);
  state.effect.success = clamp(state.effect.success + (won ? 2.4 * dt : -2.4 * dt), 0, 1);

  state.history.push({ x: state.ship.x, y: state.ship.y, angle: state.ship.angle, stability: state.ship.stability, heat: state.ship.heat, t: state.elapsed });
  if (state.history.length > 450) state.history.shift();

  return { won, lost };
}

function drawScene(shipLike, state, ctx, viewport) {
  const { width, height } = viewport;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const shakeX = (Math.random() - 0.5) * state.camera.shake;
  const shakeY = (Math.random() - 0.5) * state.camera.shake;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#031022";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(cx + shakeX, cy + shakeY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  ctx.strokeStyle = "rgba(130,220,255,0.45)";
  ctx.beginPath();
  ctx.arc(0, 0, state.challenge.parameters.targetRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#2b78cf";
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();

  for (const p of state.particles) {
    ctx.fillStyle = `rgba(124,220,255,${p.life})`;
    ctx.fillRect(p.x, p.y, 2, 2);
  }

  if (state.thrust.active) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#4dd8ff";
  }
  ctx.fillStyle = "#e8f8ff";
  ctx.beginPath();
  ctx.arc(shipLike.x, shipLike.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  if (state.ship.stability < 35) {
    ctx.fillStyle = `rgba(255,40,40,${(35 - state.ship.stability) / 90})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.effect.fail > 0) {
    ctx.fillStyle = `rgba(255,20,20,${state.effect.fail * 0.35})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.effect.success > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.effect.success * 0.6})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function render(state, ctx, viewport) { drawScene(state.ship, state, ctx, viewport); }
export function renderReplay(state, ctx, viewport, snapshot) { drawScene(snapshot, state, ctx, viewport); }

export function evaluate(state, won) {
  const radius = Math.hypot(state.ship.x, state.ship.y);
  const err = Math.abs(radius - state.challenge.parameters.targetRadius);
  const stability = clamp((state.ship.stability + clamp(100 - err * 2.2, 0, 100)) * 0.5, 0, 100);
  const xp = Math.round(22 + stability * 0.32 + (won ? 44 : 0));
  const nova = won ? Math.round(38 + stability * 0.26) : 0;
  return { won, stability, xp, nova, summary: won ? "Órbita dominada" : "Órbita fuera de control" };
}

