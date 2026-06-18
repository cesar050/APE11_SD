const peerList = document.getElementById('peerList');
const saveButton = document.getElementById('saveButton');
const refreshButton = document.getElementById('refreshButton');
const statusBadge = document.getElementById('statusBadge');
const peerCount = document.getElementById('peerCount');
const infectedCount = document.getElementById('infectedCount');
const onlineCount = document.getElementById('onlineCount');
const coordinatorBanner = document.getElementById('coordinatorBanner');
const consensusState = document.getElementById('consensusState');
const consensusDetail = document.getElementById('consensusDetail');
const coordinatorValue = document.getElementById('coordinatorValue');
const decisionValue = document.getElementById('decisionValue');
const totalsValue = document.getElementById('totalsValue');
const voteList = document.getElementById('voteList');
const liveGrid = document.getElementById('liveGrid');

let currentState = null;

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

function renderLive(state) {
  liveGrid.innerHTML = '';
  if (!state || !state.nodes) return;

  onlineCount.textContent = String(state.stats?.online ?? 0);

  const coordinator = state.coordinator;
  coordinatorBanner.textContent = coordinator
    ? `Coordinador detectado: ${coordinator.label} (${coordinator.host}:${coordinator.port})`
    : 'Coordinador detectado: no disponible';

  state.nodes.forEach((node) => {
    const card = document.createElement('article');
    card.className = `node-card ${node.online ? 'online' : 'offline'}${coordinator && coordinator.id === node.id ? ' coordinator' : ''}`;

    card.innerHTML = `
      <div class="node-top">
        <div>
          <strong>${node.label}</strong>
          <span>${node.host}:${node.port}</span>
        </div>
        <div class="node-flags">
          ${coordinator && coordinator.id === node.id ? '<span class="node-badge leader">Líder</span>' : ''}
          <span class="node-badge ${node.online ? 'up' : 'down'}">${node.online ? 'En línea' : 'Caído'}</span>
        </div>
      </div>
      <div class="node-foot">
        <span>Estado LAN</span>
        <strong>${node.online ? 'Respondió PONG' : 'Sin respuesta'}</strong>
      </div>
    `;

    liveGrid.appendChild(card);
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
  coordinatorValue.textContent = `P${consensus.coordinator}`;
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
  renderPeers(currentState.config);
  renderLive(currentState);
  renderConsensus(currentState.consensus);
  setStatus(currentState.coordinator ? `Coordinador: ${currentState.coordinator.label}` : 'Sin coordinador');
}

async function saveConfig() {
  if (!currentState) return;

  const infectedIds = selectedInfectedIds();
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
  setStatus(`Infectado(s): ${infectedIds.length ? infectedIds.map((id) => `P${id}`).join(', ') : 'ninguno'}`);
}

saveButton.addEventListener('click', () => {
  saveConfig().catch((error) => setStatus(error.message));
});

refreshButton.addEventListener('click', () => {
  loadState().catch((error) => setStatus(error.message));
});

(async function bootstrap() {
  try {
    await loadState();
    setInterval(() => {
      loadState().catch(() => {});
    }, 2500);
  } catch (error) {
    setStatus(error.message);
  }
})();
