const TICK_COUNT = 3;
const MIN_FLIGHT_TIME_SECONDS = 0.05;

let audioContext = null;
let masterGain = null;
let metronomeEnabled = false;
const activeSchedules = new Set();

function getAudioContext() {
  if (audioContext) return audioContext;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.8;

  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;

  masterGain.connect(limiter);
  limiter.connect(audioContext.destination);
  return audioContext;
}

function finishSchedule(schedule) {
  activeSchedules.delete(schedule);
  schedule.oscillators.length = 0;
}

function createTick(context, when, schedule, isArrivalTick) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startFrequency = isArrivalTick ? 780 : 1100;
  const endFrequency = isArrivalTick ? 500 : 700;
  const peakGain = isArrivalTick ? 0.18 : 0.12;
  const tickDuration = isArrivalTick ? 0.05 : 0.04;

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(startFrequency, when);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + 0.03);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peakGain, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + tickDuration - 0.005);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(when);
  oscillator.stop(when + tickDuration);
  schedule.oscillators.push(oscillator);

  oscillator.addEventListener('ended', () => {
    const index = schedule.oscillators.indexOf(oscillator);
    if (index !== -1) schedule.oscillators.splice(index, 1);
    oscillator.disconnect();
    gain.disconnect();

    if (schedule.oscillators.length === 0 && schedule.scheduled) {
      finishSchedule(schedule);
    }
  }, { once: true });
}

export function setMetronomeEnabled(enabled) {
  metronomeEnabled = Boolean(enabled);

  if (!metronomeEnabled) {
    cancelAllPitchTicks();
    return false;
  }

  const context = getAudioContext();
  if (context?.state === 'suspended') {
    context.resume().catch(() => {});
  }
  return true;
}

export function isMetronomeEnabled() {
  return metronomeEnabled;
}

export function schedulePitchTicks(timeToPlateSeconds, startDelaySeconds = 0) {
  const flightTime = Number(timeToPlateSeconds);
  const startDelay = Math.max(0, Number(startDelaySeconds) || 0);
  if (!metronomeEnabled || !Number.isFinite(flightTime) || flightTime < MIN_FLIGHT_TIME_SECONDS) {
    return null;
  }

  const schedule = {
    cancelled: false,
    scheduled: false,
    oscillators: []
  };
  activeSchedules.add(schedule);

  const context = getAudioContext();
  if (!context) {
    finishSchedule(schedule);
    return null;
  }

  const beginScheduling = () => {
    if (schedule.cancelled || !metronomeEnabled) {
      finishSchedule(schedule);
      return;
    }

    // Three ticks mark release, the midpoint, and plate arrival.
    const startTime = context.currentTime + 0.005 + startDelay;
    const interval = flightTime / (TICK_COUNT - 1);
    for (let tickIndex = 0; tickIndex < TICK_COUNT; tickIndex += 1) {
      createTick(
        context,
        startTime + interval * tickIndex,
        schedule,
        tickIndex === TICK_COUNT - 1
      );
    }
    schedule.scheduled = true;
  };

  if (context.state === 'suspended') {
    context.resume().then(beginScheduling).catch(() => finishSchedule(schedule));
  } else {
    beginScheduling();
  }

  return schedule;
}

export function cancelPitchTicks(schedule) {
  if (!schedule || schedule.cancelled) return;
  schedule.cancelled = true;

  for (const oscillator of [...schedule.oscillators]) {
    try {
      oscillator.stop();
    } catch (_) {
      // The oscillator may already have ended.
    }
  }
  finishSchedule(schedule);
}

export function cancelAllPitchTicks() {
  for (const schedule of [...activeSchedules]) {
    cancelPitchTicks(schedule);
  }
}
