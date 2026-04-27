import { clamp } from "./physics-engine.js";

export const metadata = { name: "CODE ARENA", type: "logic", baseDifficulty: 1 };

export function setup({ difficulty = 1, upgrades = {}, specialization = "tecnico" } = {}) {
  return {
    elapsed: 0,
    difficulty,
    challenge: null,
    code: "return input + 1;",
    output: null,
    attempts: 0,
    ship: {
      stability: 100,
      heat: 0,
      controlLoss: false,
      safeLimit: 100,
    },
    camera: { x: 0, y: 0, zoom: 1, shake: 0 },
    effect: { fail: 0, success: 0 },
    history: [],
    event: null,
    eventTime: 0,
    fuelCost: 1 / (upgrades.fuelEfficiency || 1),
    logicBoost: specialization === "tecnico" ? 1.2 : 1,
  };
}

export function challengeGenerator({ difficulty = 1, seed = Math.random() } = {}) {
  const modes = ["math", "branch", "efficiency"];
  const mode = modes[Math.floor(seed * modes.length)];
  const input = Math.floor(seed * 8) + difficulty;
  const target = mode === "branch" ? (input % 2 ? input * 3 : input / 2) : input * (difficulty + 1);
  const timeLimit = clamp(24 - difficulty * 2, 12, 24);
  const maxLines = clamp(8 - difficulty, 4, 8);
  return {
    objective: "Resolver reto lógico",
    mode,
    parameters: { input, target, timeLimit, maxLines },
    success: `Modo ${mode}: output=${target} en <=${timeLimit}s y <=${maxLines} líneas`,
    fail: "Timeout, sobrecalentamiento mental o salida incorrecta",
  };
}

export function ui(state) {
  return {
    title: metadata.name,
    instructions: state.challenge.success,
    stats: {
      attempts: state.attempts,
      elapsed: state.elapsed,
      output: state.output ?? "-",
      stability: state.ship.stability,
      heat: state.ship.heat,
      controlLoss: state.ship.controlLoss ? 1 : 0,
      event: state.event || "none",
    },
  };
}

export function inputHandler(state, action) {
  if (action?.type === "SET_CODE") state.code = String(action.value || "");
  if (action?.type === "RUN") {
    state.attempts += 1;
    state.ship.heat = Math.min(100, state.ship.heat + 12 * state.fuelCost);
    const jitter = state.ship.controlLoss ? "\nreturn input;" : "";
    try {
      const fn = new Function("input", `${state.code}${jitter}`);
      state.output = fn(state.challenge.parameters.input);
    } catch {
      state.output = "error";
      state.ship.stability = Math.max(0, state.ship.stability - 8);
    }
  }
}

function triggerEvent(state) {
  const events = ["solar_noise", "compiler_glitch", "drift_logic"];
  state.event = events[Math.floor(Math.random() * events.length)];
  state.eventTime = 2;
}

export function update(state, dt) {
  state.elapsed += dt;
  state.ship.heat = Math.max(0, state.ship.heat - 5 * dt);
  if (state.ship.heat > 75) state.ship.stability = Math.max(0, state.ship.stability - 10 * dt);
  else state.ship.stability = Math.min(100, state.ship.stability + 2.5 * dt * state.logicBoost);
  state.ship.controlLoss = state.ship.stability < 30;

  if (Math.random() < 0.0015 && !state.event) triggerEvent(state);
  if (state.eventTime > 0) {
    state.eventTime -= dt;
    if (state.event === "solar_noise") state.ship.heat = Math.min(100, state.ship.heat + 6 * dt);
    if (state.event === "compiler_glitch" && Math.random() < 0.04) state.output = "error";
    if (state.event === "drift_logic" && Math.random() < 0.03) state.code += "\n";
  } else state.event = null;

  const lines = state.code.split("\n").filter((l) => l.trim()).length;
  const won = state.output === state.challenge.parameters.target && lines <= state.challenge.parameters.maxLines;
  const lost = state.elapsed >= state.challenge.parameters.timeLimit || state.attempts >= 8 || state.ship.stability <= 5;

  state.camera.zoom += ((1 + state.attempts * 0.02) - state.camera.zoom) * 0.08;
  if (lost) state.camera.shake = Math.min(8, state.camera.shake + 0.4);
  state.camera.shake *= 0.9;

  state.effect.fail = clamp(state.effect.fail + (lost ? 2.2 * dt : -2.2 * dt), 0, 1);
  state.effect.success = clamp(state.effect.success + (won ? 2.2 * dt : -2.2 * dt), 0, 1);

  state.history.push({ t: state.elapsed, output: state.output, stability: state.ship.stability, heat: state.ship.heat, lines, attempts: state.attempts });
  if (state.history.length > 450) state.history.shift();

  return { won, lost };
}

function draw(snapshot, state, ctx, viewport) {
  const { width, height } = viewport;
  const shakeX = (Math.random() - 0.5) * state.camera.shake;
  const shakeY = (Math.random() - 0.5) * state.camera.shake;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#04111d";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width * 0.5 + shakeX, height * 0.5 + shakeY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-width * 0.5, -height * 0.5);

  ctx.fillStyle = "#8fdcff";
  ctx.font = "16px monospace";
  ctx.fillText(`Input: ${state.challenge.parameters.input}`, 20, 34);
  ctx.fillText(`Target: ${state.challenge.parameters.target}`, 20, 62);
  ctx.fillText(`Output: ${String(snapshot.output ?? "-")}`, 20, 90);
  ctx.fillText(`Lines: ${snapshot.lines} / ${state.challenge.parameters.maxLines}`, 20, 118);
  ctx.fillText(`Time: ${state.elapsed.toFixed(1)} / ${state.challenge.parameters.timeLimit}s`, 20, 146);
  ctx.restore();

  if (state.ship.stability < 35) {
    ctx.fillStyle = `rgba(255,50,50,${(35 - state.ship.stability) / 90})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.effect.fail > 0) {
    ctx.fillStyle = `rgba(255,0,0,${state.effect.fail * 0.35})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (state.effect.success > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.effect.success * 0.55})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function render(state, ctx, viewport) {
  draw({ output: state.output, lines: state.code.split("\n").filter((l) => l.trim()).length }, state, ctx, viewport);
}

export function renderReplay(state, ctx, viewport, snapshot) {
  draw(snapshot, state, ctx, viewport);
}

export function evaluate(state, won) {
  const lines = state.code.split("\n").filter((l) => l.trim()).length;
  const lineBonus = clamp((state.challenge.parameters.maxLines - lines + 2) * 6, 0, 30);
  const efficiency = clamp((state.ship.stability + (100 - state.attempts * 10) + lineBonus) / 2.3, 5, 100);
  const xp = Math.round(12 + efficiency * 0.3 + (won ? 40 : 0));
  const nova = won ? Math.round(14 + efficiency * 0.22) : 0;
  return { won, efficiency, xp, nova, summary: won ? "Reto lógico brillante" : "Reto lógico fallido" };
}
