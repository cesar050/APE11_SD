const peerList = document.getElementById('peerList');
const saveButton = document.getElementById('saveButton');
const refreshLiveButton = document.getElementById('refreshLiveButton');
const statusBadge = document.getElementById('statusBadge');
const peerCount = document.getElementById('peerCount');
const infectedCount = document.getElementById('infectedCount');
const onlineCount = document.getElementById('onlineCount');
const isolatedCount = document.getElementById('isolatedCount');
const coordinatorBanner = document.getElementById('coordinatorBanner');
const consensusState = document.getElementById('consensusState');
const consensusDetail = document.getElementById('consensusDetail');
const coordinatorValue = document.getElementById('coordinatorValue');
const decisionValue = document.getElementById('decisionValue');
const totalsValue = document.getElementById('totalsValue');
const voteList = document.getElementById('voteList');
const liveGrid = document.getElementById('liveGrid');
const isolatedGrid = document.getElementById('isolatedGrid');
const isolatedSummary = document.getElementById('isolatedSummary');

let currentState = null;
let saveTimer = null;

function setStatus(text) {
  statusBadge.textContent = text;
}

function renderPeers(config) {
  peerList.innerHTML = '';
  peerCount.textContent = String(config.peers.length);
  infectedCount.textContent = String(config.infected.length);

  config.peers.forEach((peer) => {
    const row = document.createElement('label');
    row.className = 'peer-item';

    row.innerHTML = `
      <div class="peer-meta">
        <strong>${peer.label}</strong>
        <span>${peer.host}:${peer.port}</span>
      </div>
      <input type="checkbox" value="${peer.id}">
    `;

    const checkbox = row.querySelector('input');
    checkbox.checked = config.infected.includes(peer.id);

    peerList.appendChild(row);
  });
}

function selectedInfectedIds() {
  return [...peerList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveConfig().catch((error) => setStatus(error.message));
  }, 150);
}

function renderLive(state) {
  liveGrid.innerHTML = '';
  isolatedGrid.innerHTML = '';
  if (!state || !state.nodes) return;

  const activeNodes = state.activeNodes || [];
  const isolatedNodes = state.isolatedNodes || [];

  onlineCount.textContent = String(state.stats?.active ?? activeNodes.length ?? 0);
  isolatedCount.textContent = String(state.stats?.isolated ?? isolatedNodes.length ?? 0);
  isolatedSummary.textContent = `${isolatedNodes.length} nodos`;

  const coordinator = state.coordinator;
  coordinatorBanner.textContent = state.clusterState === 'ELECCION'
    ? 'Estado del clúster: elección en curso'
    : state.clusterState === 'RECUPERACION'
      ? 'Estado del clúster: recuperando coordinador'
      : state.clusterState === 'SIN_NODOS'
        ? 'Estado del clúster: sin nodos activos'
        : coordinator
          ? `Estado del clúster: líder vivo ${coordinator.label} (${coordinator.host}:${coordinator.port})`
          : 'Estado del clúster: no disponible';

  activeNodes.forEach((node) => {
    const card = document.createElement('article');
    card.className = `node-card online${coordinator && coordinator.id === node.id ? ' coordinator' : ''}`;

    card.innerHTML = `
      <div class="node-top">
        <div>
          <strong>${node.label}</strong>
          <span>${node.host}:${node.port}</span>
        </div>
        <div class="node-flags">
          ${coordinator && coordinator.id === node.id ? '<span class="node-badge leader">Líder</span>' : ''}
          <span class="node-badge up">En línea</span>
        </div>
      </div>
      <div class="node-foot">
        <span>Estado LAN</span>
        <strong>Respondió PONG</strong>
      </div>
    `;

    liveGrid.appendChild(card);
  });

  isolatedNodes.forEach((node) => {
    const card = document.createElement('article');
    card.className = 'node-card offline isolated';

    card.innerHTML = `
      <div class="node-top">
        <div>
          <strong>${node.label}</strong>
          <span>${node.host}:${node.port}</span>
        </div>
        <div class="node-flags">
          <span class="node-badge down">Aislado</span>
        </div>
      </div>
      <div class="node-foot">
        <span>Estado LAN</span>
        <strong>Fuera hasta reconexión</strong>
      </div>
    `;

    isolatedGrid.appendChild(card);
  });
}

function renderConsensus(consensus) {
  if (!consensus || !consensus.available) {
    consensusState.classList.remove('hidden');
    consensusDetail.classList.add('hidden');
    consensusState.textContent = 'Todavía no hay un consenso guardado.';
    return;
  }

  consensusState.classList.add('hidden');
  consensusDetail.classList.remove('hidden');
  coordinatorValue.textContent = consensus.coordinator ? `P${consensus.coordinator}` : '-';
  decisionValue.textContent = consensus.decision || '-';

  const totals = consensus.totals || {};
  totalsValue.textContent = `SI: ${totals.SI ?? 0} | NO: ${totals.NO ?? 0}`;

  voteList.innerHTML = '';
  (consensus.votes || []).forEach((vote) => {
    const item = document.createElement('li');
    item.innerHTML = `<span class="vote-peer">P${vote.peer}</span><span class="vote-value">${vote.vote}</span>`;
    voteList.appendChild(item);
  });
}

async function loadState() {
  const response = await fetch('/api/status');
  currentState = await response.json();
  renderLive(currentState);
  renderConsensus(currentState.consensus);
  setStatus(currentState.coordinator ? `Coordinador: ${currentState.coordinator.label}` : 'Sin coordinador');
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();
  if (!currentState) {
    currentState = { config };
  } else {
    currentState.config = config;
  }
  renderPeers(config);
}

async function saveConfig(infectedIds = selectedInfectedIds()) {
  if (!currentState) return;

  setStatus('Guardando selección...');
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ infectedIds }),
  });

  const result = await response.json();
  if (!result.ok) {
    setStatus(`Error: ${result.error}`);
    return;
  }

  currentState.config = result.config;
  renderPeers(currentState.config);

  const runResponse = await fetch('/api/consensus/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ infectedIds }),
  });
  const runResult = await runResponse.json();
  if (!runResult.ok) {
    setStatus(`Error al solicitar consenso: ${runResult.error}`);
    return;
  }

  setStatus(`Infectado(s): ${infectedIds.length ? infectedIds.map((id) => `P${id}`).join(', ') : 'ninguno'} | consenso solicitado`);
}

saveButton.addEventListener('click', () => {
  saveConfig().catch((error) => setStatus(error.message));
});

peerList.addEventListener('change', queueSave);

refreshLiveButton.addEventListener('click', () => {
  loadState().catch((error) => setStatus(error.message));
});

(async function bootstrap() {
  try {
    await loadConfig();
    await loadState();

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'consensus') {
          renderConsensus(msg.data);
        }
      } catch (_) {}
    };
    ws.onclose = () => {
      setStatus('WebSocket desconectado, usando polling');
    };

    setInterval(() => {
      loadState().catch(() => {});
    }, 10000);
  } catch (error) {
    setStatus(error.message);
  }
})();
