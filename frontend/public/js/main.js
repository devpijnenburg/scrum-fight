// Landing page logic

const ADJECTIVES = [
  'Fluffy','Cosmic','Epic','Ninja','Turbo','Legendary','Quantum','Sneaky',
  'Blazing','Mysterious','Glittery','Thunderous','Magical','Hyper','Radical',
  'Zesty','Wobbly','Sparkly','Grumpy','Jolly','Speedy','Funky','Mighty',
];
const NOUNS = [
  'Unicorn','Dragon','Penguin','Elephant','Phoenix','Narwhal','Llama',
  'Gecko','Panda','Kraken','Platypus','Hamster','Octopus','Dinosaur','Giraffe',
  'Axolotl','Capybara','Quokka','Meerkat','Sloth','Dodo','Narwhal',
];
const SUFFIXES = ['Sprint','Planning','Refinement','Poker','Session'];

function generateRoomName() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(SUFFIXES)}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

const savedName = localStorage.getItem('userName');
if (savedName) {
  document.getElementById('createName').value = savedName;
}

document.getElementById('createRoomName').value = generateRoomName();

document.getElementById('randomNameBtn').addEventListener('click', () => {
  document.getElementById('createRoomName').value = generateRoomName();
  document.getElementById('createRoomName').focus();
});

updateNavbar();

const user = getCurrentUser();
if (user) {
  document.getElementById('createName').value = user.name;
}

// ── Handle room code from URL ─────────────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('join')) {
  document.getElementById('joinCode').value = urlParams.get('join').toUpperCase();
  lookupRoom();
}
if (urlParams.get('error')) {
  const errMap = {
    oauth_state_invalid: t('oauth.state_invalid'),
    oauth_failed: t('oauth.failed'),
  };
  showJoinError(errMap[urlParams.get('error')] || t('oauth.error'));
}

// ── Create room ───────────────────────────────────────────────────────────────

document.getElementById('createRoomBtn').addEventListener('click', async () => {
  const name = document.getElementById('createName').value.trim();
  const roomName = document.getElementById('createRoomName').value.trim();
  const method = document.getElementById('createMethod').value;

  if (!name) return showCreateError(t('error.name'));
  if (!roomName) return showCreateError(t('error.roomname'));

  localStorage.setItem('userName', name);

  try {
    const room = await apiFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: roomName, method }),
    });
    sessionStorage.setItem('pendingName', name);
    window.location.href = `/room.html?id=${room.id}`;
  } catch (err) {
    showCreateError(err.message);
  }
});

// ── Join room — step 1: look up code ─────────────────────────────────────────

document.getElementById('joinLookupBtn').addEventListener('click', lookupRoom);
document.getElementById('joinCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookupRoom();
});

async function lookupRoom() {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!code || code.length < 4) return showJoinError(t('error.code'));

  hideJoinError();
  const btn = document.getElementById('joinLookupBtn');
  btn.disabled = true;
  btn.textContent = t('landing.join.searching');

  try {
    const room = await apiFetch(`/rooms/${code}`);
    document.getElementById('joinFoundBanner').textContent = t('landing.join.found', { name: room.name });
    document.getElementById('joinStep1').classList.add('hidden');
    document.getElementById('joinStep2').classList.remove('hidden');
    const nameInput = document.getElementById('joinName');
    if (savedName) nameInput.value = savedName;
    if (user) nameInput.value = user.name;
    nameInput.focus();
  } catch {
    showJoinError(t('error.room_not_found'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('landing.join.search');
  }
}

// ── Join room — step 2: enter name and join ───────────────────────────────────

document.getElementById('joinBackBtn').addEventListener('click', () => {
  document.getElementById('joinStep2').classList.add('hidden');
  document.getElementById('joinStep1').classList.remove('hidden');
  hideJoinError();
  document.getElementById('joinCode').focus();
});

document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);
document.getElementById('joinName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();

  if (!name) return showJoinError(t('error.name'));

  localStorage.setItem('userName', name);
  sessionStorage.setItem('pendingName', name);
  window.location.href = `/room.html?id=${code}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showCreateError(msg) {
  const el = document.getElementById('createError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showJoinError(msg) {
  const el = document.getElementById('joinError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideJoinError() {
  document.getElementById('joinError').classList.add('hidden');
}
