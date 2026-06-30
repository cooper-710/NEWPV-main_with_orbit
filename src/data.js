export async function loadPitchData(options = {}) {
  const [mlbRes, aaaRes] = await Promise.all([
    fetch('./pitch_data.json'),
    fetch('./aaa_pitch_data_2025-06-10_to_2025-06-28.json')
  ]);
  const [mlbData, aaaData] = await Promise.all([mlbRes.json(), aaaRes.json()]);
  if (!options.groupByLeague) return mlbData || {};
  return {
    MLB: mlbData || {},
    AAA: aaaData || {}
  };
}

// --- very small event bus ---
export const Bus = {
  _h: {},
  on(evt, fn) { (this._h[evt] ||= []).push(fn); },
  emit(evt, payload) { (this._h[evt]||[]).forEach(f => f(payload)); }
};
