// Launcher configuration. Edit this file, then run the install script (instalar_tv.ps1 on Windows,
// install.sh from the upstream project on macOS/Linux).
// App ids: run `python sync-apps.py <TV IP> --list` (or look in app/apps.js after a sync).
window.CONFIG = {
  // Apps pinned to the dock row, in this order. Missing apps are skipped. Max = columns.
  dockApps: ['netflix', 'amazon', 'youtube.leanback.v4', 'globoplaywebos', 'com.wbd.stream', 'com.apple.appletv', 'tv.twitch.tv.starshot.lg'],

  // Apps never shown as tiles. Inputs and Live TV live in the "Entradas" menu already.
  // The LG promo apps below are the usual clutter on Brazilian webOS 5/6 TVs; adjust to taste.
  hiddenApps: [
    'com.gathin.tvhome',
    'com.webos.app.livetv',
    'com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'com.webos.app.hdmi3', 'com.webos.app.hdmi4',
    'com.webos.app.lgchannels',          // LG Channels
    'lgchannels.br',                     // LG Channels (Brasil)
    'webos.day',                         // LG Streaming Week
    'com.twin.app.gamingportal',         // LG Gaming Portal
    'epoxyaisports',                     // LG Sports Playbook
    'com.webos.app.sportsteamsettings',  // Alerta de esportes (LG)
    'shortcutcopilot'                    // Copilot
  ],

  // The Live TV app, offered at the end of the Inputs menu. Leave empty to omit.
  liveTvApp: 'com.webos.app.livetv',

  // Tiles per row in the grid; the dock has this many slots. 7 fits 1920px comfortably.
  columns: 7,

  // Weather card (Open-Meteo, free, no API key). Find lat/lon on maps.google.com (right click).
  weather: { city: 'Uberlândia', lat: -18.9186, lon: -48.2772, timezone: 'America/Sao_Paulo' },

  // "Próximo jogo" card. ESPN team id: open espn.com/soccer/team/_/id/<ID>/... for your club.
  // Palmeiras = 2029, Flamengo = 819, Corinthians = 874, São Paulo = 2026, Santos = 2674.
  // Set team: null to hide the card.
  team: { id: '2029' },

  // Two news columns (Google News RSS, pt-BR). title = column header, query = search terms.
  news: [
    { title: 'Inteligência artificial', query: 'inteligência artificial' },
    { title: 'Palmeiras', query: 'Palmeiras' }
  ],

  // Optional service on an always-on PC (status chips + landscape photo of the day).
  // Empty = off. When tv_services.py is running: 'http://<PC IP>:8765'
  pcServices: ''
};
