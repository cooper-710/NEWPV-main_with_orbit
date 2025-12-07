import { clearBalls, clearTrails, addBall, removeBallByType, setTrailVisible, replayAll, hasBallOfType } from './balls.js';
import { setCameraView, getRefs } from './scene.js';
import { Bus } from './data.js';

let _state = { team: null, pitcher: null };
let _lastDatum = null;

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
    <div class="metrics-title">
      <span>PERFORMANCE METRICS</span>
    </div>
    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-label">Velocity</div>
        <div class="metric-value" id="m-velo">--</div>
        <div class="metric-unit">mph</div>
      </div>
      <div class="metric">
        <div class="metric-label">Spin Rate</div>
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
    <div id="advancedMetrics" class="advanced-metrics" style="display: none;">
      <div class="metrics-grid advanced-grid">
        <div class="metric">
          <div class="metric-label">Spin Axis</div>
          <div class="metric-value" id="m-spin-axis">--</div>
          <div class="metric-unit">°</div>
        </div>
        <div class="metric">
          <div class="metric-label">Release S</div>
          <div class="metric-value" id="m-release-h">--</div>
          <div class="metric-unit">ft</div>
        </div>
        <div class="metric">
          <div class="metric-label">Release H</div>
          <div class="metric-value" id="m-release-v">--</div>
          <div class="metric-unit">ft</div>
        </div>
        <div class="metric">
          <div class="metric-label">Extension</div>
          <div class="metric-value" id="m-extension">--</div>
          <div class="metric-unit">ft</div>
        </div>
      </div>
    </div>
    <button id="advancedStatsToggle" class="advanced-toggle">
      <span>Show Advanced Stats</span>
      <svg class="toggle-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button id="comparisonBtn" class="comparison-button">
      <span>Comparison</span>
      <svg class="toggle-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
}

function renderMetrics({ mph, spin, ivb, hb, spinAxis, releaseH, releaseV, extension, timeToPlate, vertBreak, horizBreak, releaseSpeed }) {
  const e = (id) => document.getElementById(id);
  e('m-velo').textContent = fmt(mph, 1);
  e('m-spin').textContent = fmt(spin, 0);
  e('m-ivb').textContent  = fmt(ivb, 1);
  e('m-hb').textContent   = fmt(hb, 1);
  
  // Advanced metrics
  e('m-spin-axis').textContent = spinAxis !== undefined ? fmt(spinAxis, 0) : '--';
  e('m-release-h').textContent = releaseH !== undefined ? fmt(releaseH, 2) : '--';
  e('m-release-v').textContent = releaseV !== undefined ? fmt(releaseV, 2) : '--';
  e('m-extension').textContent = extension !== undefined ? fmt(extension, 2) : '--';
}

function trackmanIVBInches(d) {
  const explicit = getVal(d, ['inducedVerticalBreak', 'ivb', 'ivb_in', 'ivb_inches']);
  if (explicit !== undefined) return Number(explicit);

  const totalDropIn = (() => {
    const mvIn = getVal(d, [['movement_vertical', 12], ['movement_vertical_ft', 12], 'vertical_movement_in', 'total_vertical_break_in']);
    return mvIn === undefined ? undefined : Math.abs(mvIn);
  })();

  const t = pick(d.time_to_plate, d.timeToPlate, d.tt);
  if (totalDropIn !== undefined && t !== undefined) {
    const g = 32.174;
    const gravityDropIn = 0.5 * g * (Number(t) ** 2) * 12;
    return gravityDropIn - totalDropIn;
  }

  const pfxZ = getVal(d, ['pfx_z', 'vz_break', 'vertBreak']);
  return pfxZ;
}

function metricsFromDatum(d) {
  if (!d) return { 
    mph: undefined, spin: undefined, ivb: undefined, hb: undefined,
    spinAxis: undefined, releaseH: undefined, releaseV: undefined, extension: undefined,
    timeToPlate: undefined, vertBreak: undefined, horizBreak: undefined, releaseSpeed: undefined
  };

  // Convert velocity to mph - if value is > 100, assume it's in ft/s and convert
  let mphRaw = pick(d.mph, d.velocity, d.vel, d.release_speed);
  let mph;
  if (mphRaw !== undefined) {
    // If value is > 100, it's likely in ft/s, convert to mph
    if (mphRaw > 100) {
      mph = mphRaw * 0.681818; // ft/s to mph conversion
    } else {
      mph = mphRaw; // Already in mph
    }
  } else {
    mph = undefined;
  }
  const spin = pick(d.spin, d.rpm, d.release_spin_rate);
  const ivb  = trackmanIVBInches(d);

  const hbRaw = getVal(d, [
    'hb', 'hb_in', 'hb_inches', 'horizontalBreak', 'hbreak', 'horizontal_break',
    ['pfx_x', 1],
    ['movement_horizontal', 12], ['movement_horizontal_ft', 12]
  ]);
  const hb = hbRaw === undefined ? undefined : -hbRaw;

  // Advanced metrics
  const spinAxis = pick(d.spin_axis, d.spinAxis);
  const releaseH = pick(d.release_pos_x, d.releasePosX);
  const releaseV = pick(d.release_pos_z, d.releasePosZ);
  const extension = pick(d.release_extension, d.extension);
  const timeToPlate = pick(d.time_to_plate, d.timeToPlate, d.tt);
  
  const vertBreak = getVal(d, [
    ['movement_vertical', 12], ['movement_vertical_ft', 12], 'vertical_movement_in', 'total_vertical_break_in'
  ]);
  const horizBreak = getVal(d, [
    ['movement_horizontal', 12], ['movement_horizontal_ft', 12], 'horizontal_movement_in'
  ]);
  const releaseSpeed = pick(d.release_speed, d.releaseSpeed);

  return { 
    mph, spin, ivb, hb,
    spinAxis, releaseH, releaseV, extension, timeToPlate, vertBreak, horizBreak, releaseSpeed
  };
}

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

    const title = document.createElement('span');
    title.textContent = type;

    head.appendChild(title);

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
            renderMetrics(metricsFromDatum(null));
          }
        }
      });

      const wrap = document.createElement('div');
      wrap.className = 'checkbox-group';
      wrap.appendChild(cb);
      grid.appendChild(wrap);
      zoneBoxes.push(cb);
    }

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
    renderMetrics(metricsFromDatum(null));
  });
  container.appendChild(clr);
}

export function initControls(data, setPlaying) {
  // Custom dropdown elements
  const teamDropdown = document.getElementById('teamDropdown');
  const teamDropdownTrigger = document.getElementById('teamDropdownTrigger');
  const teamDropdownValue = document.getElementById('teamDropdownValue');
  const teamDropdownMenu = document.getElementById('teamDropdownMenu');
  
  const pitcherDropdown = document.getElementById('pitcherDropdown');
  const pitcherDropdownTrigger = document.getElementById('pitcherDropdownTrigger');
  const pitcherDropdownValue = document.getElementById('pitcherDropdownValue');
  const pitcherDropdownMenu = document.getElementById('pitcherDropdownMenu');
  
  const cameraDropdown = document.getElementById('cameraDropdown');
  const cameraDropdownTrigger = document.getElementById('cameraDropdownTrigger');
  const cameraDropdownValue = document.getElementById('cameraDropdownValue');
  const cameraDropdownMenu = document.getElementById('cameraDropdownMenu');
  const cameraItems = cameraDropdownMenu.querySelectorAll('.custom-dropdown-item');

  const replayBtn     = document.getElementById('replayBtn');
  const orbitToggle   = document.getElementById('orbitToggle');
  const trailToggle   = document.getElementById('trailToggle');
  const metricsPanel  = document.getElementById('metricsPanel');
  const playerSearch  = document.getElementById('playerSearch');
  const searchResults = document.getElementById('searchResults');

  // Build player index for search
  const playerIndex = [];
  for (const team in data) {
    for (const pitcher in data[team]) {
      playerIndex.push({
        team,
        pitcher,
        displayName: pitcher,
        searchText: `${pitcher} ${team}`.toLowerCase()
      });
    }
  }

  // Player search functionality
  let searchTimeout;
  playerSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchResults.innerHTML = '';
      searchResults.classList.remove('show');
      
      if (query.length < 2) {
        return;
      }

      const matches = playerIndex
        .filter(player => player.searchText.includes(query))
        .slice(0, 10); // Limit to 10 results

      if (matches.length > 0) {
        matches.forEach(player => {
          const item = document.createElement('div');
          item.className = 'search-result-item';
          item.innerHTML = `
            <div class="player-name">${player.displayName}</div>
            <div class="team-name">${player.team}</div>
          `;
          item.addEventListener('click', () => {
            // Update team dropdown
            const teamItem = Array.from(teamDropdownMenu.children).find(item => item.dataset.value === player.team);
            if (teamItem) {
              teamDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
              teamItem.classList.add('selected');
              teamDropdownValue.textContent = player.team;
              _state.team = player.team;
              
              // Update pitcher dropdown
              pitcherDropdownMenu.innerHTML = '';
              for (const p in data[_state.team]) {
                const item = document.createElement('div');
                item.className = 'custom-dropdown-item';
                item.dataset.value = p;
                item.textContent = p;
                if (p === player.pitcher) {
                  item.classList.add('selected');
                  pitcherDropdownValue.textContent = p;
                }
                item.addEventListener('click', () => {
                  pitcherDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
                  item.classList.add('selected');
                  pitcherDropdownValue.textContent = p;
                  pitcherDropdown.classList.remove('open');
                  _state.pitcher = p;
                  clearBalls();
                  buildPitchCheckboxes(data[_state.team][_state.pitcher]);
                  _lastDatum = null;
                  renderMetrics(metricsFromDatum(null));
                  _writeUrl();
                });
                pitcherDropdownMenu.appendChild(item);
              }
              _state.pitcher = player.pitcher;
              clearBalls();
              buildPitchCheckboxes(data[_state.team][_state.pitcher]);
              _lastDatum = null;
              renderMetrics(metricsFromDatum(null));
              _writeUrl();
            }
            
            // Clear search
            playerSearch.value = '';
            searchResults.classList.remove('show');
          });
          searchResults.appendChild(item);
        });
        searchResults.classList.add('show');
      }
    }, 150);
  });

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    const searchContainer = playerSearch.closest('.search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
      searchResults.classList.remove('show');
    }
  });

  // Populate team dropdown
  for (const team in data) {
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = team;
    item.textContent = team;
    item.addEventListener('click', () => {
      teamDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      teamDropdownValue.textContent = team;
      teamDropdown.classList.remove('open');
      _state.team = team;
      
      // Populate pitcher dropdown
      pitcherDropdownMenu.innerHTML = '';
      pitcherDropdownValue.textContent = 'Select Pitcher';
      for (const p in data[_state.team]) {
        const pitcherItem = document.createElement('div');
        pitcherItem.className = 'custom-dropdown-item';
        pitcherItem.dataset.value = p;
        pitcherItem.textContent = p;
        pitcherItem.addEventListener('click', () => {
          pitcherDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
          pitcherItem.classList.add('selected');
          pitcherDropdownValue.textContent = p;
          pitcherDropdown.classList.remove('open');
          _state.pitcher = p;
          clearBalls();
          buildPitchCheckboxes(data[_state.team][_state.pitcher]);
          _lastDatum = null;
          renderMetrics(metricsFromDatum(null));
          _writeUrl();
        });
        pitcherDropdownMenu.appendChild(pitcherItem);
      }
      _writeUrl();
    });
    teamDropdownMenu.appendChild(item);
  }

  // Team dropdown toggle
  teamDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    teamDropdown.classList.toggle('open');
  });

  // Pitcher dropdown toggle
  pitcherDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    pitcherDropdown.classList.toggle('open');
  });

  // Camera dropdown toggle
  cameraDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    cameraDropdown.classList.toggle('open');
  });

  // Camera dropdown items
  cameraItems.forEach(item => {
    item.addEventListener('click', () => {
      const value = item.dataset.value;
      const text = item.textContent;
      
      cameraItems.forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      cameraDropdownValue.textContent = text;
      cameraDropdown.classList.remove('open');
      
      setCameraView(value);
      _writeUrl();
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!teamDropdown.contains(e.target)) {
      teamDropdown.classList.remove('open');
    }
    if (!pitcherDropdown.contains(e.target)) {
      pitcherDropdown.classList.remove('open');
    }
    if (!cameraDropdown.contains(e.target)) {
      cameraDropdown.classList.remove('open');
    }
  });

  replayBtn.addEventListener('click', () => {
    clearTrails();
    
    // Re-add any selected pitches that were removed
    if (_state.team && _state.pitcher && data[_state.team] && data[_state.team][_state.pitcher]) {
      const pitcherData = data[_state.team][_state.pitcher];
      const checkedBoxes = document.querySelectorAll('#pitchCheckboxes input[type="checkbox"]:checked');
      
      checkedBoxes.forEach(cb => {
        const pitchType = cb.id;
        // Only re-add if ball doesn't exist (was removed after reaching plate)
        if (!hasBallOfType(pitchType) && pitcherData[pitchType]) {
          addBall(pitcherData[pitchType], pitchType);
        }
      });
    }
    
    replayAll();
  });

  trailToggle.addEventListener('change', e => { setTrailVisible(e.target.checked); _writeUrl(); });

  // NEW: Orbit toggle bind
  orbitToggle.addEventListener('change', e => {
    const { controls } = getRefs();
    if (controls) controls.enabled = !!e.target.checked;
    _writeUrl();
  });

  buildMetricsPanel(metricsPanel);

  // Advanced stats toggle
  const advancedToggle = document.getElementById('advancedStatsToggle');
  const advancedMetrics = document.getElementById('advancedMetrics');
  advancedToggle.addEventListener('click', () => {
    const isOpen = advancedMetrics.style.display !== 'none';
    advancedMetrics.style.display = isOpen ? 'none' : 'block';
    advancedToggle.classList.toggle('open');
    advancedToggle.querySelector('span').textContent = isOpen ? 'Show Advanced Stats' : 'Hide Advanced Stats';
  });

  const comparisonBtn = document.getElementById('comparisonBtn');
  comparisonBtn.addEventListener('click', () => {
    window.location.href = 'comparison.html';
  });

  let loggedKeysOnce = false;
  Bus.on('frameStats', (s) => {
    const last = s && s.last ? s.last : {};
    if (!loggedKeysOnce) {
      try { console.debug('[metrics] frameStats.last keys:', Object.keys(last).sort()); } catch (_) {}
      loggedKeysOnce = true;
    }
    let liveMphRaw = pick(last.mph, last.velocity, last.vel, last.release_speed);
    let liveMph;
    if (liveMphRaw !== undefined) {
      // If value is > 100, it's likely in ft/s, convert to mph
      if (liveMphRaw > 100) {
        liveMph = liveMphRaw * 0.681818; // ft/s to mph conversion
      } else {
        liveMph = liveMphRaw; // Already in mph
      }
    } else {
      liveMph = undefined;
    }
    const liveSpin = pick(last.spin, last.rpm, last.release_spin_rate);
    const base = metricsFromDatum(_lastDatum);
    const mph  = liveMph  !== undefined ? liveMph  : base.mph;
    const spin = liveSpin !== undefined ? liveSpin : base.spin;
    renderMetrics({ ...base, mph, spin });
  });

  const params = new URLSearchParams(location.search);
  const wantTeam = params.get('team');
  const wantPitcher = params.get('pitcher');
  const wantView = params.get('view');
  const wantTrail = params.get('trail');
  const wantOrbit = params.get('orbit');

  if (wantTeam && data[wantTeam]) {
    const teamItem = Array.from(teamDropdownMenu.children).find(item => item.dataset.value === wantTeam);
    if (teamItem) {
      teamDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
      teamItem.classList.add('selected');
      teamDropdownValue.textContent = wantTeam;
      _state.team = wantTeam;
      
      // Populate pitcher dropdown
      pitcherDropdownMenu.innerHTML = '';
      for (const p in data[_state.team]) {
        const pitcherItem = document.createElement('div');
        pitcherItem.className = 'custom-dropdown-item';
        pitcherItem.dataset.value = p;
        pitcherItem.textContent = p;
        if (wantPitcher && p === wantPitcher) {
          pitcherItem.classList.add('selected');
          pitcherDropdownValue.textContent = p;
          _state.pitcher = p;
          clearBalls();
          buildPitchCheckboxes(data[_state.team][_state.pitcher]);
          _lastDatum = null;
          renderMetrics(metricsFromDatum(null));
        }
        pitcherItem.addEventListener('click', () => {
          pitcherDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
          pitcherItem.classList.add('selected');
          pitcherDropdownValue.textContent = p;
          pitcherDropdown.classList.remove('open');
          _state.pitcher = p;
          clearBalls();
          buildPitchCheckboxes(data[_state.team][_state.pitcher]);
          _lastDatum = null;
          renderMetrics(metricsFromDatum(null));
          _writeUrl();
        });
        pitcherDropdownMenu.appendChild(pitcherItem);
      }
      _writeUrl();
    }
  } else {
    // Select first team
    const firstTeamItem = teamDropdownMenu.children[0];
    if (firstTeamItem) {
      firstTeamItem.click();
    }
  }

  if (wantView) {
    const cameraItem = Array.from(cameraItems).find(item => item.dataset.value === wantView);
    if (cameraItem) {
      cameraItems.forEach(i => i.classList.remove('selected'));
      cameraItem.classList.add('selected');
      cameraDropdownValue.textContent = cameraItem.textContent;
      setCameraView(wantView);
    }
  }
  if (wantTrail) {
    trailToggle.checked = (wantTrail === '1' || wantTrail === 'true');
    trailToggle.dispatchEvent(new Event('change'));
  }
  if (wantOrbit !== null) {
    const on = (wantOrbit === '1' || wantOrbit === 'true');
    orbitToggle.checked = on;
    const { controls } = getRefs();
    if (controls) controls.enabled = on;
  } else {
    orbitToggle.checked = true;
    const { controls } = getRefs();
    if (controls) controls.enabled = true;
  }

  function _writeUrl() {
    const cameraValue = Array.from(cameraItems).find(item => item.classList.contains('selected'))?.dataset.value || '';
    const q = new URLSearchParams({
      team: _state.team || '',
      pitcher: _state.pitcher || '',
      view: cameraValue,
      trail: trailToggle.checked ? '1' : '0',
      orbit: orbitToggle.checked ? '1' : '0'
    });
    const newUrl = `${location.pathname}?${q.toString()}`;
    history.replaceState(null, '', newUrl);
  }
}
