import { initScene, getRefs, setCameraView } from './src/scene.js';
import { animateBalls } from './src/balls.js';
import { loadPitchData } from './src/data.js';
import { clearBalls, clearTrails, addBall, removeBallByType, setTrailVisible, replayAll, hasBallOfType, getBalls, initTrail } from './src/balls.js';

let showTrail = false;

let playing = true;
let data = null;
let player1Data = null;
let player2Data = null;
let player1Team = null;
let player1Pitcher = null;
let player2Team = null;
let player2Pitcher = null;
let player1LastDatum = null;
let player2LastDatum = null;

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildNameVariants(name) {
  const normalized = normalizeSearchText(name);
  const variants = new Set([normalized]);
  if (name && name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim()).filter(Boolean);
    if (first && last) variants.add(normalizeSearchText(`${first} ${last}`));
  }
  return Array.from(variants).filter(Boolean);
}

// Helper functions for metrics
function fmt(v, d = 1) {
  if (v === undefined || v === null || !isFinite(v)) return '--';
  return Number(v).toFixed(d);
}

function pick(...keys) {
  for (const k of keys) {
    if (k !== undefined && k !== null) return k;
  }
  return undefined;
}

function getVal(d, keys) {
  for (const k of keys) {
    if (Array.isArray(k)) {
      const [key, mult] = k;
      if (d[key] !== undefined) return Number(d[key]) * mult;
    } else if (d[k] !== undefined) {
      return Number(d[k]);
    }
  }
  return undefined;
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
    mph: undefined, spin: undefined, ivb: undefined, hb: undefined
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

  return { mph, spin, ivb, hb };
}

function renderPlayerMetrics(playerId, metrics) {
  const e = (id) => document.getElementById(id);
  const prefix = playerId === 'player1' ? 'p1' : 'p2';
  e(`${prefix}-velo`).textContent = fmt(metrics.mph, 1);
  e(`${prefix}-spin`).textContent = fmt(metrics.spin, 0);
  e(`${prefix}-ivb`).textContent  = fmt(metrics.ivb, 1);
  e(`${prefix}-hb`).textContent   = fmt(metrics.hb, 1);
}

// Initialize scene
initScene();
data = await loadPitchData({ groupByLeague: true });

// Setup orbit and trail toggles - these are global controls (not per-player)
const orbitToggle1 = document.getElementById('player1OrbitToggle');
const trailToggle1 = document.getElementById('player1TrailToggle');
const orbitToggle2 = document.getElementById('player2OrbitToggle');
const trailToggle2 = document.getElementById('player2TrailToggle');

// Orbit toggle - both toggles control the same thing
function updateOrbit(enabled) {
  const { controls } = getRefs();
  if (controls) controls.enabled = enabled;
  orbitToggle1.checked = enabled;
  orbitToggle2.checked = enabled;
}

orbitToggle1.addEventListener('change', (e) => updateOrbit(e.target.checked));
orbitToggle2.addEventListener('change', (e) => updateOrbit(e.target.checked));

// Trail toggle - both toggles control the same thing
function updateTrail(enabled) {
  showTrail = enabled;
  setTrailVisible(enabled);
  trailToggle1.checked = enabled;
  trailToggle2.checked = enabled;
}

trailToggle1.addEventListener('change', (e) => updateTrail(e.target.checked));
trailToggle2.addEventListener('change', (e) => updateTrail(e.target.checked));

// Custom dropdown for camera selection
const cameraDropdown = document.getElementById('cameraDropdown');
const cameraDropdownTrigger = document.getElementById('cameraDropdownTrigger');
const cameraDropdownValue = document.getElementById('cameraDropdownValue');
const cameraDropdownMenu = document.getElementById('cameraDropdownMenu');
const cameraItems = cameraDropdownMenu.querySelectorAll('.custom-dropdown-item');

let currentCameraValue = 'catcher';

cameraDropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  cameraDropdown.classList.toggle('open');
});

cameraItems.forEach(item => {
  item.addEventListener('click', () => {
    const value = item.dataset.value;
    const text = item.textContent;
    
    currentCameraValue = value;
    cameraDropdownValue.textContent = text;
    
    // Update selected state
    cameraItems.forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    
    // Close dropdown
    cameraDropdown.classList.remove('open');
    
    // Update camera view
    setCameraView(value);
  });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!cameraDropdown.contains(e.target)) {
    cameraDropdown.classList.remove('open');
  }
});

// Build player index
const playerIndex = [];
for (const league of Object.keys(data)) {
  const leagueData = data[league] || {};
  for (const team in leagueData) {
    for (const pitcher in leagueData[team]) {
      const nameVariants = buildNameVariants(pitcher);
      const tokens = normalizeSearchText(`${nameVariants.join(' ')} ${team} ${league}`).split(' ').filter(Boolean);
      playerIndex.push({
        league,
        team,
        pitcher,
        displayName: pitcher,
        searchText: normalizeSearchText(`${pitcher} ${team} ${league}`),
        nameVariants,
        tokens
      });
    }
  }
}

// Setup search for player 1
const player1Search = document.getElementById('player1Search');
const player1Results = document.getElementById('player1Results');
let searchTimeout1;

player1Search.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  
  clearTimeout(searchTimeout1);
  searchTimeout1 = setTimeout(() => {
    player1Results.innerHTML = '';
    player1Results.classList.remove('show');
    
    if (query.length < 2) {
      return;
    }

    const queryNormalized = normalizeSearchText(query);
    const queryTokens = queryNormalized.split(' ').filter(Boolean);
    const matches = playerIndex
      .filter(player => {
        const tokenMatch = queryTokens.every(t => player.tokens.includes(t));
        const textMatch = player.searchText.includes(queryNormalized) || player.nameVariants.some(v => v.includes(queryNormalized));
        return tokenMatch || textMatch;
      })
      .slice(0, 10);

    if (matches.length > 0) {
      matches.forEach(player => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <div class="player-name">${player.displayName}</div>
          <div class="team-name">${player.team} (${player.league})</div>
        `;
        item.addEventListener('click', () => {
          player1Team = player.team;
          player1Pitcher = player.pitcher;
          player1Data = data[player.league][player.team][player.pitcher];
          player1Search.value = `${player.displayName} (${player.team}, ${player.league})`;
          player1Results.classList.remove('show');
          document.querySelector('.player-panel.player1 h3').textContent = player.displayName;
          buildPitchCheckboxes('player1', player1Data, '#ff6600');
        });
        player1Results.appendChild(item);
      });
      player1Results.classList.add('show');
    }
  }, 150);
});

// Setup search for player 2
const player2Search = document.getElementById('player2Search');
const player2Results = document.getElementById('player2Results');
let searchTimeout2;

player2Search.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  
  clearTimeout(searchTimeout2);
  searchTimeout2 = setTimeout(() => {
    player2Results.innerHTML = '';
    player2Results.classList.remove('show');
    
    if (query.length < 2) {
      return;
    }

    const queryNormalized = normalizeSearchText(query);
    const queryTokens = queryNormalized.split(' ').filter(Boolean);
    const matches = playerIndex
      .filter(player => {
        const tokenMatch = queryTokens.every(t => player.tokens.includes(t));
        const textMatch = player.searchText.includes(queryNormalized) || player.nameVariants.some(v => v.includes(queryNormalized));
        return tokenMatch || textMatch;
      })
      .slice(0, 10);

    if (matches.length > 0) {
      matches.forEach(player => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <div class="player-name">${player.displayName}</div>
          <div class="team-name">${player.team} (${player.league})</div>
        `;
        item.addEventListener('click', () => {
          player2Team = player.team;
          player2Pitcher = player.pitcher;
          player2Data = data[player.league][player.team][player.pitcher];
          player2Search.value = `${player.displayName} (${player.team}, ${player.league})`;
          player2Results.classList.remove('show');
          document.querySelector('.player-panel.player2 h3').textContent = player.displayName;
          buildPitchCheckboxes('player2', player2Data, '#00aaff');
        });
        player2Results.appendChild(item);
      });
      player2Results.classList.add('show');
    }
  }, 150);
});

// Close search results when clicking outside
document.addEventListener('click', (e) => {
  const searchContainer1 = player1Search.closest('.search-container');
  const searchContainer2 = player2Search.closest('.search-container');
  
  if (searchContainer1 && !searchContainer1.contains(e.target)) {
    player1Results.classList.remove('show');
  }
  if (searchContainer2 && !searchContainer2.contains(e.target)) {
    player2Results.classList.remove('show');
  }
});

function buildPitchCheckboxes(playerId, pitcherData, color) {
  const container = document.getElementById(`${playerId}Checkboxes`);
  container.innerHTML = '';

  if (!pitcherData) return;

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
    head.textContent = type;

    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';

    for (let zone = 1; zone <= 9; zone++) {
      if (!pitchGroups[type][zone]) continue;
      const combo = `${type} ${zone}`;
      const fullId = `${playerId}-${combo}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = fullId;

      cb.addEventListener('change', () => {
        if (cb.checked) {
          const datum = pitchGroups[type][zone];
          // Add ball with player identifier
          const ball = addBall(datum, fullId, color);
          if (ball && ball.userData) {
            ball.userData.playerId = playerId;
            // Update ball color based on player
            if (ball.material) {
              ball.material.color.setHex(parseInt(color.replace('#', ''), 16));
            }
          }
          // Update metrics for this player
          if (playerId === 'player1') {
            player1LastDatum = datum;
            renderPlayerMetrics('player1', metricsFromDatum(datum));
          } else {
            player2LastDatum = datum;
            renderPlayerMetrics('player2', metricsFromDatum(datum));
          }
        } else {
          // Remove ball by full ID
          removeBallByType(fullId);
          // Clear metrics if this was the last selected pitch
          if (playerId === 'player1') {
            const hasSelected = document.querySelectorAll('#player1Checkboxes input[type="checkbox"]:checked').length > 0;
            if (!hasSelected) {
              player1LastDatum = null;
              renderPlayerMetrics('player1', metricsFromDatum(null));
            }
          } else {
            const hasSelected = document.querySelectorAll('#player2Checkboxes input[type="checkbox"]:checked').length > 0;
            if (!hasSelected) {
              player2LastDatum = null;
              renderPlayerMetrics('player2', metricsFromDatum(null));
            }
          }
        }
      });

      const wrap = document.createElement('div');
      wrap.className = 'checkbox-group';
      wrap.appendChild(cb);
      grid.appendChild(wrap);
    }

    group.appendChild(head);
    group.appendChild(grid);
    container.appendChild(group);
  });

  const clr = document.createElement('button');
  clr.textContent = 'Clear All';
  clr.addEventListener('click', () => {
    document.querySelectorAll(`#${playerId}Checkboxes input[type="checkbox"]`).forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      }
    });
    // Clear metrics for this player
    if (playerId === 'player1') {
      player1LastDatum = null;
      renderPlayerMetrics('player1', metricsFromDatum(null));
    } else {
      player2LastDatum = null;
      renderPlayerMetrics('player2', metricsFromDatum(null));
    }
  });
  container.appendChild(clr);
}

// Replay button
const replayBtn = document.getElementById('replayBtn');
replayBtn.addEventListener('click', () => {
  clearTrails();
  
  // Re-add any selected pitches that were removed
  const allCheckboxes = document.querySelectorAll('#player1Checkboxes input[type="checkbox"]:checked, #player2Checkboxes input[type="checkbox"]:checked');
  
  allCheckboxes.forEach(cb => {
    const fullId = cb.id;
    const [playerId, ...comboParts] = fullId.split('-');
    const combo = comboParts.join('-');
    const playerData = playerId === 'player1' ? player1Data : player2Data;
    const color = playerId === 'player1' ? '#ff6600' : '#00aaff';
    
    if (!hasBallOfType(fullId) && playerData && playerData[combo]) {
      const ball = addBall(playerData[combo], fullId, color);
      if (ball && ball.userData) {
        ball.userData.playerId = playerId;
        // Update ball color based on player
        if (ball.material) {
          ball.material.color.setHex(parseInt(color.replace('#', ''), 16));
        }
      }
    }
  });
  
  replayAll();
});

// Clear all button
const clearBtn = document.getElementById('clearBtn');
clearBtn.addEventListener('click', () => {
  clearBalls();
  clearTrails();
  document.querySelectorAll('#player1Checkboxes input[type="checkbox"], #player2Checkboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  player1LastDatum = null;
  player2LastDatum = null;
  renderPlayerMetrics('player1', metricsFromDatum(null));
  renderPlayerMetrics('player2', metricsFromDatum(null));
});

// Animation loop
const { clock } = getRefs();
let last = clock.getElapsedTime();

function loop() {
  requestAnimationFrame(loop);
  const now = clock.getElapsedTime();
  const dt = now - last; last = now;
  if (playing) animateBalls(dt);
  const { renderer, scene, camera, controls } = getRefs();
  if (controls) controls.update();
  renderer.render(scene, camera);
}
loop();

