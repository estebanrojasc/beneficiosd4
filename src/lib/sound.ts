"use client";

// Sonidos de estado para el kiosko, generados con Web Audio API (sin archivos).
// Cada estado tiene un patrón de tonos claramente distinto.

type StatusSound = "green" | "already" | "red" | "unknown";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Debe llamarse desde un gesto del usuario (click) para "desbloquear" el audio.
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  gainValue = 0.18
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainValue, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    c.currentTime + start + duration
  );
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.02);
}

export function playStatusSound(status: StatusSound) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  switch (status) {
    // Puede ingresar: dos tonos ascendentes alegres.
    case "green":
      tone(c, 660, 0, 0.12, "triangle");
      tone(c, 990, 0.13, 0.18, "triangle");
      break;
    // Ya almorzó hoy: doble tono medio, neutro.
    case "already":
      tone(c, 520, 0, 0.1, "sine");
      tone(c, 520, 0.15, 0.1, "sine");
      break;
    // No pertenece al almuerzo: tono grave largo, tipo "error".
    case "red":
      tone(c, 200, 0, 0.4, "sawtooth", 0.22);
      break;
    // No reconocido: blip corto descendente.
    case "unknown":
      tone(c, 440, 0, 0.1, "square", 0.14);
      tone(c, 330, 0.11, 0.12, "square", 0.14);
      break;
  }
}
