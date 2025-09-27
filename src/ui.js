import { clearBalls, clearTrails, addBall, removeBallByType, setTrailVisible, replayAll } from './balls.js';
import { setCameraView } from './scene.js';
import { Bus } from './data.js';

let _state = { team: null, pitcher: null };
let _lastDatum = null; // currently selected pitch datum (from JSON)

// ---------- helpers ----------
function fmt(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '--';
  const n = Number(v);
  return (Math.abs(n) >= 1000) ? Math.round(n).toString() : n.toFixed(d);
}
function pick(...keys) {
  for (const k of keys) {
    if (k !== undefined && k !== null) return k;
  }
  return undefined;
}
// candidates: "key" or ["key", multiplier]
function getVal(obj, candidates) {
  if (!obj) return undefined;
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const [k, mul = 1] = c;
      if (obj[k] !== undefined && obj[k] !== null) return Number(obj[k]) * mul;
    } else {
      if (obj[c] !== undefined && obj[c] !== null) return Number(obj[c]);
    }
  }
  return undefined;
}

function buildMetricsPanel(el) {
  el.innerHTML = `
    <div class="metrics-title">Metrics</div>
    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-label">Velo</div>
        <div class="metric-value" id="m-velo">--</div>
        <div class="metric-unit">mph</div>
      </div>
      <div class="metric">
        <div class="metric-label">Spin</div>
        <div class="metric-value" id="m-spin">--</div>
        <div class="metric-unit">rpm</div>
      </div>
      <div class="metric">
        <div class="metric-label">IVB</div>
        <div class="metric-value" id="m-ivb">--</div>
        <div class="metric-unit">in</div>
      </div>
      <div class="metric">
        <div class="metric-label">HB</div>
        <div class="metric-value" id="m-hb">--</div>
        <div class="metric-unit">in</div>
      </div>
    </div>
  `;
}

function renderMetrics({ mph, spin, ivb, hb }) {
  const e = (id) => document.getElementById(id);
  e('m-velo').textContent = fmt(mph, 1);
  e('m-spin').textContent = fmt(spin, 0);
  e('m-ivb').textContent  = fmt(ivb, 1);
  e('m-hb').textContent   = fmt(hb, 1);
}

// --------- TrackMan IVB from datum (gravity removed) ----------
function trackmanIVBInches(d) {
  // Use explicit IVB if present (already inches, positive = ride)
  const explicit = getVal(d, ['inducedVerticalBreak', 'ivb', 'ivb_in', 'ivb_inches']);
  if (explicit !== undefined) return Number(explicit);

  // Otherwise compute: IVB = gravity_drop - total_drop
  // total_drop from your JSON is movement_vertical (ft) → inches
  const totalDropIn = (() => {
    const mvIn = getVal(d, [['movement_vertical', 12], ['movement_vertical_ft', 12], 'vertical_movement_in', 'total_vertical_break_in']);
    return mvIn === undefined ? undefined : Math.abs(mvIn);
  })();

  const t = pick(d.time_to_plate, d.timeToPlate, d.tt); // seconds
  if (totalDropIn !== undefined && t !== undefined) {
    const g = 32.174; // ft/s^2
    const gravityDropIn = 0.5 * g * (Number(t) ** 2) * 12;
    return gravityDropIn - totalDropIn; // + = ride, - = extra drop
  }

  // Last resort: spin-only vertical deflection from Statcast-style fields (already inches)
  const pfxZ = getVal(d, ['pfx_z', 'vz_break', 'vertBreak']);
  return pfxZ;
}

// derive metrics from a raw datum (your JSON object for a pitch)
function metricsFromDatum(d) {
  if (!d) return { mph: undefined, spin: undefined, ivb: undefined, hb: undefined };

  const mph  = pick(d.mph, d.velocity, d.vel, d.release_speed);
  const spin = pick(d.spin, d.rpm, d.release_spin_rate);

  const ivb  = trackmanIVBInches(d);

  // HB (no gravity on X). Prefer inch-native, else convert ft → in.
  const hbRaw = getVal(d, [
    'hb', 'hb_in', 'hb_inches', 'horizontalBreak', 'hbreak', 'horizontal_break',
    ['pfx_x', 1],
    ['movement_horizontal', 12], ['movement_horizontal_ft', 12]
  ]);
  const hb = hbRaw === undefined ? undefined : -hbRaw;   // flip the sign


  return { mph, spin, ivb, hb };
}

// ---------- UI builders ----------
export function buildPitchCheckboxes(pitcherData) {
  const container = document.getElementById('pitchCheckboxes');
  container.innerHTML = '';

  const pitchGroups = {};
  for (const key in pitcherData) {
    const [type, zoneStr] = key.split(' ');
    const zone = Number(zoneStr);
    (pitchGroups[type] ||= {})[zone] = pitcherData[key];
  }

  Object.keys(pitchGroups).forEach(type => {
    const group = document.createElement('div');
    group.className = 'pitch-type-group';

    const head = document.createElement('div');
    head.className = 'pitch-type-title';
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';

    const title = document.createElement('span');
    title.textContent = type;

    const master = document.createElement('input');
    master.type = 'checkbox';
    master.title = 'Toggle all zones';

    head.appendChild(title);
    head.appendChild(master);

    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';

    const zoneBoxes = [];

    for (let zone = 1; zone <= 9; zone++) {
      if (!pitchGroups[type][zone]) continue;
      const combo = `${type} ${zone}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = combo;

      cb.addEventListener('change', () => {
        if (cb.checked) {
          const datum = pitchGroups[type][zone];
          addBall(datum, combo);
          _lastDatum = datum;
          renderMetrics(metricsFromDatum(_lastDatum));
        } else {
          removeBallByType(combo);
          if (_lastDatum === pitchGroups[type][zone]) {
            _lastDatum = null;
            renderMetrics({ mph: undefined, spin: undefined, ivb: undefined, hb: undefined });
          }
        }
      });

      const label = document.createElement('label');
      label.htmlFor = combo; label.textContent = zone;

      const wrap = document.createElement('div');
      wrap.className = 'checkbox-group';
      wrap.appendChild(cb); wrap.appendChild(label);
      grid.appendChild(wrap);
      zoneBoxes.push(cb);
    }

    master.addEventListener('change', () => {
      const want = master.checked;
      zoneBoxes.forEach(cb => {
        if (cb.checked !== want) {
          cb.checked = want;
          cb.dispatchEvent(new Event('change'));
        }
      });
    });

    group.appendChild(head);
    group.appendChild(grid);
    container.appendChild(group);
  });

  const clr = document.createElement('button');
  clr.textContent = 'Clear All';
  clr.addEventListener('click', () => {
    document.querySelectorAll('#pitchCheckboxes input[type="checkbox"]').forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      }
    });
    _lastDatum = null;
    renderMetrics({ mph: undefined, spin: undefined, ivb: undefined, hb: undefined });
  });
  container.appendChild(clr);
}

export function initControls(data, setPlaying) {
  const teamSelect    = document.getElementById('teamSelect');
  const pitcherSelect = document.getElementById('pitcherSelect');
  const cameraSelect  = document.getElementById('cameraSelect');
  const replayBtn     = document.getElementById('replayBtn');
  const toggleBtn     = document.getElementById('toggleBtn');
  const trailToggle   = document.getElementById('trailToggle');
  const metricsPanel  = document.getElementById('metricsPanel');

  for (const team in data) {
    const opt = document.createElement('option');
    opt.value = team; opt.textContent = team;
    teamSelect.appendChild(opt);
  }

  teamSelect.addEventListener('change', () => {
    pitcherSelect.innerHTML = '';
    _state.team = teamSelect.value;
    for (const p in data[_state.team]) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      pitcherSelect.appendChild(opt);
    }
    pitcherSelect.dispatchEvent(new Event('change'));
    _writeUrl();
  });

  pitcherSelect.addEventListener('change', () => {
    _state.pitcher = pitcherSelect.value;
    clearBalls();
    buildPitchCheckboxes(data[_state.team][_state.pitcher]);
    _lastDatum = null;
    renderMetrics({ mph: undefined, spin: undefined, ivb: undefined, hb: undefined });
    _writeUrl();
  });

  cameraSelect.addEventListener('change', (e) => { setCameraView(e.target.value); _writeUrl(); });

  replayBtn.addEventListener('click', () => { clearTrails(); replayAll(); });

  trailToggle.addEventListener('change', e => { setTrailVisible(e.target.checked); _writeUrl(); });

  buildMetricsPanel(metricsPanel);

  // Live updates for mph/spin; IVB/HB come from selected datum
  let loggedKeysOnce = false;
  Bus.on('frameStats', (s) => {
    const last = s && s.last ? s.last : {};

    if (!loggedKeysOnce) {
      try { console.debug('[metrics] frameStats.last keys:', Object.keys(last).sort()); } catch (_) {}
      loggedKeysOnce = true;
    }

    const liveMph  = pick(last.mph, last.velocity, last.vel, last.release_speed);
    const liveSpin = pick(last.spin, last.rpm, last.release_spin_rate);

    const base = metricsFromDatum(_lastDatum);
    const mph  = liveMph  !== undefined ? liveMph  : base.mph;
    const spin = liveSpin !== undefined ? liveSpin : base.spin;

    renderMetrics({ mph, spin, ivb: base.ivb, hb: base.hb });
  });

  const params = new URLSearchParams(location.search);
  const wantTeam = params.get('team');
  const wantPitcher = params.get('pitcher');
  const wantView = params.get('view');
  const wantTrail = params.get('trail');

  if (wantTeam && data[wantTeam]) {
    teamSelect.value = wantTeam;
    teamSelect.dispatchEvent(new Event('change'));
    if (wantPitcher && data[wantTeam][wantPitcher]) {
      pitcherSelect.value = wantPitcher;
      pitcherSelect.dispatchEvent(new Event('change'));
    }
  } else {
    teamSelect.selectedIndex = 0;
    teamSelect.dispatchEvent(new Event('change'));
  }

  if (wantView) {
    cameraSelect.value = wantView;
    cameraSelect.dispatchEvent(new Event('change'));
  }
  if (wantTrail) {
    trailToggle.checked = (wantTrail === '1' || wantTrail === 'true');
    trailToggle.dispatchEvent(new Event('change'));
  }

  function _writeUrl() {
    const q = new URLSearchParams({
      team: _state.team || '',
      pitcher: _state.pitcher || '',
      view: cameraSelect.value || '',
      trail: trailToggle.checked ? '1' : '0'
    });
    const newUrl = `${location.pathname}?${q.toString()}`;
    history.replaceState(null, '', newUrl);
  }
}
