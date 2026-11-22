// Room page entry point (loaded as an ES module from room.html).
//
//   state.js       shared page state          socket.js     the connection
//   identity.js    joining, names, login      events.js     server → client events
//   rounds.js      render / reveal / reset    controls.js   player actions + shortcuts
//   table.js       seats and vote progress    picker.js     card picker
//   analytics.js   stats panel and history    consensus.js  pure consensus rules
//   header.js      name, code, share, banners celebrations.js reactions and badges
//   overlays.js    countdown and exit screens
//
// Shared helpers come from ../core (i18n, api, auth, settings, badges),
// ../ui (modal, toast, auth panel) and ../components (page chrome).

import '../components/siteChrome.js';
import '../ui/authPanel.js';
import { ROOM_ID } from './state.js';

if (!ROOM_ID) {
  window.location.href = '/';
} else {
  const [{ wireHeader }, { wireControls }, { wireAnalyticsPanel }, { wireNameModal }, { registerSocketEvents }] =
    await Promise.all([
      import('./header.js'),
      import('./controls.js'),
      import('./analytics.js'),
      import('./identity.js'),
      import('./events.js'),
    ]);
  wireHeader();
  wireControls();
  wireAnalyticsPanel();
  wireNameModal();
  registerSocketEvents();
}
