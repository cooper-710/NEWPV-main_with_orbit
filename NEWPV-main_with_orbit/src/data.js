export async function loadPitchData() {
  const res = await fetch('./pitch_data.json');
  return await res.json();
}

// --- very small event bus ---
export const Bus = {
  _h: {},
  on(evt, fn) { (this._h[evt] ||= []).push(fn); },
  emit(evt, payload) { (this._h[evt]||[]).forEach(f => f(payload)); }
};
