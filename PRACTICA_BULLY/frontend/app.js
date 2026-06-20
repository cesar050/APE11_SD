const peerList = document.getElementById('peerList');
const saveButton = document.getElementById('saveButton');
const statusBadge = document.getElementById('statusBadge');
const peerCount = document.getElementById('peerCount');
const infectedCount = document.getElementById('infectedCount');
const onlineCount = document.getElementById('onlineCount');
const isolatedCount = document.getElementById('isolatedCount');
const coordinatorBanner = document.getElementById('coordinatorBanner');
const consensusState = document.getElementById('consensusState');
const consensusDetail = document.getElementById('consensusDetail');
const decisionBanner = document.getElementById('decisionBanner');
const coordinatorValue = document.getElementById('coordinatorValue');
const decisionValue = document.getElementById('decisionValue');
const totalsValue = document.getElementById('totalsValue');
const voteTableBody = document.getElementById('voteTableBody');
const liveGrid = document.getElementById('liveGrid');
const isolatedGrid = document.getElementById('isolatedGrid');
const isolatedSection = document.getElementById('isolatedSection');

let roundActive = false;
let voteMap = new Map();
let currentState = null;
let saveTimer = null;
let ws = null;
let wsReconnectTimer = null;

function setLiveStatus(connected, text) {
  statusBadge.classList.toggle('disconnected', !connected);
  statusBadge.innerHTML = '';
  if (connected) {
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    statusBadge.appendChild(dot);
  }
  statusBadge.appendChild(document.createTextNode(text));
}

function setClusterBanner(state) {
  const coordinator = state?.coordinator;
  const isolated = state?.isolatedNodes?.length ?? 0;
  coordinatorBanner.className = 'cluster-chip';

  if (coordinator) {
    const suffix = isolated > 0 ? ` · ${isolated} aislado${isolated > 1 ? 's' : ''}` : '';
    coordinatorBanner.textContent = `Líder: ${coordinator.label}${suffix}`;
    coordinatorBanner.classList.add('stable');
  } else if (state?.clusterState === 'ELECCION') {
    coordinatorBanner.textContent = 'Elección en curso';
    coordinatorBanner.classList.add('election');
  } else if (state?.clusterState === 'SIN_NODOS') {
    coordinatorBanner.textContent = 'Sin nodos activos';
    coordinatorBanner.classList.add('down');
  } else {
    coordinatorBanner.textContent = 'Sin coordinador';
    coordinatorBanner.classList.add('down');
  }
}

function decisionOutcome(decision) {
  if (!decision || decision === '—' || decision === 'Votando…') return 'pending';
  const text = String(decision).toUpperCase();
  if (text.includes('APROB') || text.includes('ACEPT') || text === 'SI') return 'ok';
  if (text.includes('RECHAZ') || text.includes('DENEG') || text === 'NO') return 'fail';
  return 'pending';
}

function setDecisionStyle(decision) {
  decisionBanner.className = 'decision-banner';
  decisionBanner.classList.add(`decision-${decisionOutcome(decision)}`);
}

function countVotes() {
  let si = 0;
  let no = 0;
  for (const vote of voteMap.values()) {
    if (vote === 'SI') si++;
    else if (vote === 'NO') no++;
  }
  return { si, no };
}

function updateTotals() {
  const { si, no } = countVotes();
  totalsValue.textContent = `SI ${si} · NO ${no}`;
}

function voteBadgeHtml(vote) {
  if (!vote || vote === '—') {
    return '<span class="vote-badge vote-wait">Esperando</span>';
  }
  const cls = vote === 'SI' ? 'vote-si' : 'vote-no';
  return `<span class="vote-badge ${cls}">${vote}</span>`;
}

function lanBadgeHtml(online) {
  return online
    ? '<span class="lan-badge lan-up">En línea</span>'
    : '<span class="lan-badge lan-down">Caído</span>';
}

function buildVoteTable(peers, nodes, votesByPeer = new Map()) {
  voteTableBody.innerHTML = '';
  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));

  peers.forEach((peer) => {
    const node = nodeMap.get(peer.id);
    const online = node?.online ?? false;
    const vote = votesByPeer.get(peer.id) || null;

    const row = document.createElement('tr');
    row.dataset.peer = String(peer.id);
    row.innerHTML = `
      <td class="cell-peer">${peer.label}</td>
      <td class="cell-addr">${peer.host}:${peer.port}</td>
      <td class="cell-lan">${lanBadgeHtml(online)}</td>
      <td class="cell-vote">${voteBadgeHtml(vote)}</td>
    `;
    voteTableBody.appendChild(row);
  });
}

function updateVoteRow(peerId, vote) {
  const row = voteTableBody.querySelector(`tr[data-peer="${peerId}"]`);
  if (!row) return;
  const cell = row.querySelector('.cell-vote');
  if (cell) cell.innerHTML = voteBadgeHtml(vote);
  row.classList.toggle('row-voted', vote === 'SI' || vote === 'NO');
  row.classList.toggle('row-si', vote === 'SI');
  row.classList.toggle('row-no', vote === 'NO');
}

function initVoteRound(peers, nodes) {
  voteMap = new Map();
  roundActive = true;
  showConsensusPanel();
  decisionValue.textContent = 'Votando…';
  setDecisionStyle('Votando…');
  coordinatorValue.textContent = currentState?.coordinator?.label || '—';
  buildVoteTable(peers, nodes, voteMap);
  updateTotals();
}

function showConsensusPanel() {
  consensusState.classList.add('hidden');
  consensusDetail.classList.remove('hidden');
}

function renderPeers(config, nodes) {
  peerList.innerHTML = '';
  peerCount.textContent = String(config.peers.length);
  infectedCount.textContent = String(config.infected.length);

  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));

  config.peers.forEach((peer) => {
    const node = nodeMap.get(peer.id);
    const online = node?.online ?? false;
    const infected = config.infected.includes(peer.id);

    const row = document.createElement('label');
    row.className = `peer-item ${online ? 'online' : 'offline'}${infected ? ' infected' : ''}`;
    row.innerHTML = `
      <div class="peer-meta">
        <strong>${peer.label}</strong>
        <span>${peer.host}:${peer.port}</span>
      </div>
      <div class="peer-status">
        <span class="peer-badge ${online ? 'up' : 'down'}">${online ? 'En línea' : 'Caído'}</span>
        <input type="checkbox" value="${peer.id}" title="Marcar como bizantino">
      </div>
    `;
    row.querySelector('input').checked = infected;
    peerList.appendChild(row);
  });

  if (roundActive || consensusDetail.classList.contains('hidden') === false) {
    const votesByPeer = new Map(voteMap);
    buildVoteTable(config.peers, nodes, votesByPeer);
  }
}

function selectedInfectedIds() {
  return [...peerList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveConfig().catch((error) => setLiveStatus(true, error.message));
  }, 150);
}

function renderNodeCard(node, coordinator, isolated = false) {
  const isLeader = !isolated && coordinator && coordinator.id === node.id;
  const card = document.createElement('article');
  card.className = `node-card${isolated ? ' isolated' : ' online'}${isLeader ? ' coordinator' : ''}`;
  card.innerHTML = `
    <div class="node-row">
      <div class="node-info">
        <strong>${node.label}</strong>
        <span>${node.host}:${node.port}</span>
      </div>
      <div class="node-badges">
        ${isLeader ? '<span class="node-badge leader">Líder</span>' : ''}
        <span class="node-badge ${isolated ? 'down' : 'up'}">${isolated ? 'Aislado' : 'Activo'}</span>
      </div>
    </div>
    <div class="node-status">${isolated ? 'Sin respuesta' : 'PONG ✓'}</div>
  `;
  return card;
}

function renderLive(state) {
  liveGrid.innerHTML = '';
  isolatedGrid.innerHTML = '';
  if (!state?.nodes) return;

  const activeNodes = state.activeNodes || [];
  const isolatedNodes = state.isolatedNodes || [];
  const coordinator = state.coordinator;

  onlineCount.textContent = String(state.stats?.active ?? activeNodes.length);
  isolatedCount.textContent = String(state.stats?.isolated ?? isolatedNodes.length);
  setClusterBanner(state);

  activeNodes.forEach((node) => {
    liveGrid.appendChild(renderNodeCard(node, coordinator));
  });

  if (isolatedNodes.length > 0) {
    isolatedSection.classList.remove('hidden');
    isolatedNodes.forEach((node) => {
      isolatedGrid.appendChild(renderNodeCard(node, coordinator, true));
    });
  } else {
    isolatedSection.classList.add('hidden');
  }
}

function renderConsensus(consensus) {
  if (!consensus?.available) {
    if (!roundActive) {
      consensusState.classList.remove('hidden');
      consensusDetail.classList.add('hidden');
    }
    return;
  }

  roundActive = false;
  showConsensusPanel();

  coordinatorValue.textContent = consensus.coordinator ? `P${consensus.coordinator}` : '—';
  decisionValue.textContent = consensus.decision || '—';
  setDecisionStyle(consensus.decision);

  voteMap = new Map();
  (consensus.votes || []).forEach((v) => voteMap.set(v.peer, v.vote));

  const peers = currentState?.config?.peers || [];
  buildVoteTable(peers, currentState?.nodes, voteMap);
  updateTotals();
}

function renderLiveVote(vote) {
  if (!vote || vote.peer == null) return;

  const peers = currentState?.config?.peers || [];
  if (!roundActive) {
    initVoteRound(peers, currentState?.nodes);
  }

  voteMap.set(vote.peer, vote.vote);
  updateVoteRow(vote.peer, vote.vote);
  updateTotals();
}

function applyState(state) {
  currentState = state;
  renderLive(state);
  if (!roundActive) renderConsensus(state.consensus);
  if (state.config) renderPeers(state.config, state.nodes);
  setLiveStatus(true, 'En vivo');
}

async function loadState() {
  const response = await fetch('/api/status');
  applyState(await response.json());
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();
  renderPeers(config, currentState?.nodes);
}

async function saveConfig(infectedIds = selectedInfectedIds()) {
  if (!currentState) return;

  setLiveStatus(true, 'Guardando…');
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ infectedIds }),
  });

  const result = await response.json();
  if (!result.ok) {
    setLiveStatus(true, `Error: ${result.error}`);
    return;
  }

  currentState.config = result.config;
  renderPeers(result.config, currentState.nodes);
  initVoteRound(result.config.peers, currentState.nodes);

  const runResponse = await fetch('/api/consensus/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ infectedIds }),
  });
  const runResult = await runResponse.json();
  if (!runResult.ok) {
    setLiveStatus(true, `Error consenso: ${runResult.error}`);
    return;
  }

  setLiveStatus(true, 'Consenso en curso');
}

function handleWsMessage(event) {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'status') {
      applyState(msg.data);
    } else if (msg.type === 'consensus') {
      renderConsensus(msg.data);
    } else if (msg.type === 'vote') {
      renderLiveVote(msg.data);
    }
  } catch (_) {}
}

function connectWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProto}//${location.host}`);
  ws.onopen = () => setLiveStatus(true, 'En vivo');
  ws.onmessage = handleWsMessage;
  ws.onclose = () => {
    setLiveStatus(false, 'Reconectando…');
    wsReconnectTimer = setTimeout(connectWebSocket, 2000);
  };
  ws.onerror = () => ws.close();
}

saveButton.addEventListener('click', () => {
  saveConfig().catch((error) => setLiveStatus(true, error.message));
});

peerList.addEventListener('change', queueSave);

(async function bootstrap() {
  try {
    await loadConfig();
    await loadState();
    connectWebSocket();
    setInterval(() => loadState().catch(() => {}), 5000);
  } catch (error) {
    setLiveStatus(false, error.message);
  }
})();
