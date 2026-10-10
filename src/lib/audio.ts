let ctx: AudioContext | null = null;

/** Shared AudioContext. Call `unlockAudio()` from a click/tap so browsers allow sound. */
export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

export function unlockAudio() {
  const context = getAudioContext();
  if (context.state === "suspended") void context.resume();
}

/** A short synthesized kick drum at `when` (AudioContext time). */
export function playKick(when: number, volume: number) {
  const context = getAudioContext();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
  osc.connect(gain).connect(context.destination);
  osc.start(when);
  osc.stop(when + 0.26);
}

/** A short noise burst, used as a hi-hat on the off-beat. */
export function playHat(when: number, volume: number) {
  const context = getAudioContext();
  const length = Math.floor(context.sampleRate * 0.05);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(when);
}

/** A short metronome click; the downbeat is higher and louder so bars are easy to hear. */
export function playClick(when: number, downbeat: boolean) {
  const context = getAudioContext();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(downbeat ? 1760 : 1100, when);
  gain.gain.setValueAtTime(downbeat ? 0.5 : 0.28, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  osc.connect(gain).connect(context.destination);
  osc.start(when);
  osc.stop(when + 0.05);
}
