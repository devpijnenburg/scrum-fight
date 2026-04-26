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
const SUFFIXES = ['Sprint','Planning','Refinement','Poker','Sessie'];

function generateRoomName() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(SUFFIXES)}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Pre-fill name from localStorage if available
const savedName = localStorage.getItem('userName');
if (savedName) {
  document.getElementById('createName').value = savedName;
  document.getElementById('joinName').value = savedName;
}

// Set random room name
document.getElementById('createRoomName').value = generateRoomName();

// Randomize button
document.getElementById('randomNameBtn').addEventListener('click', () => {
  document.getElementById('createRoomName').value = generateRoomName();
  document.getElementById('createRoomName').focus();
});

// Update navbar if logged in
updateNavbar();

// Pre-fill name from token
const user = getCurrentUser();
if (user) {
  document.getElementById('createName').value = user.name;
  document.getElementById('joinName').value = user.name;
}

// ── Handle room code from URL (e.g. shared link) ─────────────────────────────
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('join')) {
  document.getElementById('joinCode').value = urlParams.get('join').toUpperCase();
}
if (urlParams.get('error')) {
  const errMap = {
    oauth_state_invalid: 'OAuth verificatie mislukt, probeer opnieuw.',
    oauth_failed: 'OAuth inloggen mislukt, probeer opnieuw.',
  };
  showJoinError(errMap[urlParams.get('error')] || 'Er is een fout opgetreden.');
}

// ── Create room ───────────────────────────────────────────────────────────────

document.getElementById('createRoomBtn').addEventListener('click', async () => {
  const name = document.getElementById('createName').value.trim();
  const roomName = document.getElementById('createRoomName').value.trim();
  const method = document.getElementById('createMethod').value;

  if (!name) return showCreateError('Vul jouw naam in');
  if (!roomName) return showCreateError('Vul een kamernaam in');

  localStorage.setItem('userName', name);

  try {
    const room = await apiFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: roomName, method }),
    });
    // Navigate to room, carrying name for socket join
    window.location.href = `/room.html?id=${room.id}&name=${encodeURIComponent(name)}`;
  } catch (err) {
    showCreateError(err.message);
  }
});

// ── Join room ─────────────────────────────────────────────────────────────────

document.getElementById('joinRoomBtn').addEventListener('click', async () => {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();

  if (!name) return showJoinError('Vul jouw naam in');
  if (!code || code.length < 4) return showJoinError('Voer een geldige kamercode in');

  localStorage.setItem('userName', name);

  try {
    // Verify the room exists before navigating
    await apiFetch(`/rooms/${code}`);
    window.location.href = `/room.html?id=${code}&name=${encodeURIComponent(name)}`;
  } catch {
    showJoinError('Kamer niet gevonden. Controleer de code en probeer opnieuw.');
  }
});

// Allow Enter key on join code input
document.getElementById('joinCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('joinRoomBtn').click();
});

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
