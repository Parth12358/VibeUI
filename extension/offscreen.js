// Offscreen document: plays a bundled song and analyzes it for energy / beats / spectrum.

let audio = null;
let audioCtx = null;
let analyser = null;
let srcNode = null;
let raf = 0;
let lastSent = 0;
let lastBeat = 0;
let envAvg = 0.001;
let bpm = 120;
let currentSongId = null;

const BANDS = 16;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "OFFSCREEN_START") start(msg.songId);
  if (msg.type === "OFFSCREEN_STOP") stop();
});

async function start(songId) {
  const id = songId || currentSongId || SONGS[0].id;
  if (audio && !audio.paused && currentSongId === id) return; // already playing this song
  stop();
  currentSongId = id;
  const song = SONGS.find((s) => s.id === id) || SONGS[0];
  bpm = song.bpm || 120;
  try {
    audio = new Audio(chrome.runtime.getURL(song.file));
    audio.loop = true;
    audioCtx = new AudioContext();
    srcNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    await audioCtx.resume();
    await audio.play();
    loop();
    console.log("[vibe] playing", song.id);
  } catch (e) {
    console.error("[vibe] playback failed", e);
    chrome.runtime.sendMessage({ type: "ERROR", error: String(e) }).catch(() => {});
  }
}

function stop() {
  cancelAnimationFrame(raf);
  audio?.pause();
  audio = null;
  try {
    srcNode?.disconnect();
    analyser?.disconnect();
  } catch {}
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  srcNode = null;
  lastBeat = 0;
  envAvg = 0.001;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!analyser) return;

  const now = performance.now();
  if (now - lastSent < 33) return;
  lastSent = now;

  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const bins = analyser.frequencyBinCount;

  let energy = 0;
  let bass = 0;
  const band = new Array(BANDS).fill(0);
  for (let i = 0; i < bins; i++) {
    const v = freq[i] / 255;
    energy += v;
    const bi = Math.floor((i / bins) * BANDS);
    if (v > band[bi]) band[bi] = v;
  }
  energy /= bins;
  for (let i = 0; i < 4; i++) bass += freq[i] / 255;
  bass /= 4;

  // Time-domain waveform, downsampled for the visualizer thread.
  const waveBuf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(waveBuf);
  const WAVE = 32;
  const wave = new Array(WAVE);
  for (let i = 0; i < WAVE; i++) {
    wave[i] = round3(waveBuf[Math.floor((i / WAVE) * waveBuf.length)] / 128 - 1);
  }

  envAvg = envAvg * 0.95 + energy * 0.05;
  let beat = false;
  let impulse = 0;
  if (energy > envAvg * 1.5 + 0.04 && now - lastBeat > 150) {
    beat = true;
    lastBeat = now;
    impulse = Math.min(1, (energy - envAvg) * 6);
  }

  chrome.runtime
    .sendMessage({
      type: "FRAME",
      data: { energy: round3(energy), bass: round3(bass), beat, impulse: round3(impulse), bands: band.map(round3), wave, bpm },
    })
    .catch(() => {});
}
