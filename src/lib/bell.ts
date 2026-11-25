let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

function triggerSingleBellStrike(ctx: AudioContext, startTime: number, baseFreq: number, peakGain: number): void {
  // Harmonic bell partials for a clear metallic chime
  const partials = [
    { ratio: 1, gain: 1.0, decay: 0.95 },
    { ratio: 2.0, gain: 0.45, decay: 0.65 },
    { ratio: 2.98, gain: 0.22, decay: 0.42 },
  ];

  for (const partial of partials) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * partial.ratio, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(peakGain * partial.gain, startTime + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + partial.decay);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + partial.decay + 0.05);
  }
}

export async function playBellChime(isOverdue = false): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  if (ctx.state !== 'running') {
    return false;
  }

  const now = ctx.currentTime;
  if (isOverdue) {
    // Urgent crisp double-ring bell (A5 -> C#6)
    triggerSingleBellStrike(ctx, now + 0.01, 880, 0.22);
    triggerSingleBellStrike(ctx, now + 0.24, 1108.73, 0.24);
  } else {
    // Clear approaching-SLA bell chime (G5 -> B5)
    triggerSingleBellStrike(ctx, now + 0.01, 783.99, 0.18);
    triggerSingleBellStrike(ctx, now + 0.28, 987.77, 0.2);
  }

  return true;
}
