import assert from 'node:assert/strict';

const registry = new Map();

globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ set id(_) {}, set rel(_) {}, set href(_) {} }),
  head: { appendChild: () => {} },
};
globalThis.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = { innerHTML: '', querySelectorAll: () => [] };
    return this.shadowRoot;
  }
  dispatchEvent() {}
};
globalThis.CustomEvent = class {};
globalThis.customElements = { define: (name, constructor) => registry.set(name, constructor) };

await import('../yoto-cards.js');

const M = globalThis.__YOTO_CARDS__;
assert.equal(M.VERSION, '0.2.1');
assert.deepEqual([...registry.keys()], ['yoto-cards-player', 'yoto-cards-library', 'yoto-cards-sync', 'yoto-cards-listening']);

// --- helpers
assert.deepEqual(M.splitTrack('Queens (read by Helena Bonham Carter)', 'Queens'), ['Queens', 'read by Helena Bonham Carter']);
assert.deepEqual(M.splitTrack('Thomas and Bertie', 'Thomas and Bertie'), ['Thomas and Bertie', '']);
assert.deepEqual(M.splitTrack('', 'Queens'), ['Queens', '']);
assert.equal(M.clock(139), '2:19');
assert.equal(M.clock(581), '9:41');
assert.equal(M.span(4320), '1 h 12 m');
assert.equal(M.span(2280), '38 m');
const now = Date.parse('2026-09-22T04:30:00Z');
assert.equal(M.ago(new Date(now - 12000), now), '12 s ago');
assert.equal(M.ago(new Date(now - 7200000), now), '2 h ago');
assert.equal(M.until(new Date(now + (6 * 24 + 22) * 3600000), now), 'in 6 d 22 h');
assert.equal(M.until(new Date(now - 120000), now), 'overdue');

// --- playing intervals: clip to the window, merge 5 s hiccups, run to "now" while playing
const t0 = Date.parse('2026-09-21T05:00:00Z') / 1000;
const rows = [
  { s: 'stopped', lu: t0 - 3600 },
  { s: 'playing', lu: t0 },
  { s: 'paused', lu: t0 + 600 },
  { s: 'playing', lu: t0 + 605 },
  { s: 'stopped', lu: t0 + 1200 },
  { s: 'playing', lu: t0 + 7200 },
];
const iv = M.playingIntervals(rows, (t0 - 60) * 1000, (t0 + 7500) * 1000);
assert.deepEqual(iv.map(([a, b]) => [(a / 1000 - t0), (b / 1000 - t0)]), [[0, 1200], [7200, 7500]]);
assert.deepEqual(M.playingIntervals([{ s: 'playing', lu: t0 - 100 }], t0 * 1000, (t0 + 50) * 1000), [[t0 * 1000, (t0 + 50) * 1000]]);
assert.deepEqual(M.playingIntervals([], 0, 1000), []);

// --- a hass snapshot with the real entity ids (values from 2026-09-21)
const iso = '2026-09-22T04:01:48+00:00';
const S = (state, attributes = {}) => ({ state, attributes, last_updated: iso, last_changed: iso });
const hass = {
  themes: { darkMode: true },
  locale: { language: 'en-US', time_format: '12' },
  states: {
    'sensor.yoto_player_playback': S('playing', { friendly_name: 'Yoto Player Playback' }),
    'sensor.yoto_player_now_playing': S('Queens'),
    'sensor.yoto_player_track': S('Queens (read by Helena Bonham Carter)'),
    'sensor.yoto_player_chapter': S('16'),
    'sensor.yoto_player_position': S('139'),
    'sensor.yoto_player_track_length': S('581'),
    'sensor.yoto_player_battery': S('100'),
    'binary_sensor.yoto_player_charging': S('on'),
    'sensor.yoto_player_volume': S('64'),
    'binary_sensor.yoto_player_headphones': S('off'),
    'binary_sensor.yoto_player_bluetooth_headphones': S('off'),
    'sensor.yoto_player_card': S('1mvb1'),
    'binary_sensor.yoto_player_card_inserted': S('on'),
    'binary_sensor.yoto_player_day_mode': S('off'),
    'binary_sensor.yoto_player_sleep_timer': S('off'),
    'sensor.yoto_player_firmware': S('v2.23.4'),
    'binary_sensor.yoto_sync_problem': S('off', { reason: '', status: 'ok' }),
    'sensor.yoto_sync_status': S('OK: 37 stories on 3 playlists, nothing new'),
    'sensor.yoto_sync_last_run': S(iso),
    'sensor.yoto_sync_next_run': S('2026-09-29T04:01:48+00:00'),
    'sensor.yoto_sync_last_added': S('nothing yet'),
    'sensor.yoto_sync_stories': S('37'),
    'binary_sensor.negroni_container_yoto_sync': S('on'),
    'sensor.yoto_sync_bluey_book_reads': S('22', { title: 'Bluey Book Reads', minutes: 136, mb: 71.7, card_id: '1mvb1', known: 22, missing: [] }),
    'sensor.yoto_sync_hey_duggee_read_alongs': S('7', { title: 'Hey Duggee Read-Alongs', minutes: 58, mb: 35.7, card_id: '58Hrl', known: 7, missing: [] }),
    'sensor.yoto_sync_thomas_friends_80th_anniversary_storytime': S('8', { title: 'Thomas & Friends 80th Anniversary Storytime', minutes: 51, mb: 28.3, card_id: '930JU', known: 8, missing: [] }),
  },
};

const make = (type, config) => {
  const card = new (registry.get(type))();
  card.setConfig(config);
  card.hass = hass;
  return card;
};

const player = make('yoto-cards-player', { player: 'yoto_player' });
let html = player.shadowRoot.innerHTML;
for (const needle of ['Queens', 'read by Helena Bonham Carter', '>Bluey Book Reads<', '2:19', 'of 9:41', 'battery 100%', 'charging', '>playing<']) {
  assert.ok(html.includes(needle), `player card lacks "${needle}"`);
}
for (const gone of ['chapter 16', 'night mode', 'card 1mvb1', 'sleep timer', 'headphones', 'updated']) {
  assert.ok(!html.includes(gone), `player card still shows "${gone}"`);
}
for (const needle of []) {
  assert.ok(html.includes(needle), `player card lacks "${needle}"`);
}
assert.ok(!html.includes('yoto-cards error'), html.slice(0, 300));

// stopped with no card
const stopped = { ...hass, states: { ...hass.states,
  'sensor.yoto_player_playback': S('stopped', { friendly_name: 'Yoto Player Playback' }),
  'sensor.yoto_player_card': S('none'),
  'binary_sensor.yoto_player_card_inserted': S('off') } };
player.hass = stopped;
html = player.shadowRoot.innerHTML;
assert.ok(html.includes('No card') && html.includes('put a card in') && html.includes('>stopped<'), 'no-card state');
// tags only when on
const tagged = { ...hass, states: { ...hass.states, 'binary_sensor.yoto_player_sleep_timer': S('on'), 'binary_sensor.yoto_player_bluetooth_headphones': S('on') } };
player.hass = tagged;
assert.ok(player.shadowRoot.innerHTML.includes('sleep timer') && player.shadowRoot.innerHTML.includes('bluetooth'), 'tags when on');

// bridge down: entities unavailable
const offline = { ...hass, states: Object.fromEntries(Object.entries(hass.states).map(([k, v]) => [k, k.includes('yoto_player') ? S('unavailable') : v])) };
player.hass = offline;
assert.ok(player.shadowRoot.innerHTML.includes('Offline'), 'offline state');

const library = make('yoto-cards-library', {});
html = library.shadowRoot.innerHTML;
for (const needle of ['37 stories', '4 h 5 m', 'Bluey Book Reads', '22 stories', 'Thomas &amp; Friends', 'width:14.3%']) {
  assert.ok(html.includes(needle), `library card lacks "${needle}"`);
}
for (const gone of ['136 min', '72 MB', 'next check', 'cap ', 'make your own']) {
  assert.ok(!html.includes(gone), `library card still shows "${gone}"`);
}
// the bridge's favourite-card sensor names a card too, but it is not a playlist
const withFavourite = { ...hass, states: { ...hass.states,
  'sensor.yoto_player_favourite_card': S('Bluey Book Reads', { title: 'Bluey Book Reads', card_id: '1mvb1', week: 23, plays: 4, chapters: [] }) } };
assert.deepEqual(M.playlistSensors(withFavourite).map((p) => p.id), [
  'sensor.yoto_sync_bluey_book_reads', 'sensor.yoto_sync_hey_duggee_read_alongs', 'sensor.yoto_sync_thomas_friends_80th_anniversary_storytime']);
library.hass = withFavourite;
assert.equal(library.shadowRoot.innerHTML.split('Bluey Book Reads').length - 1, 1, 'Bluey listed once');
// the list sets the height: a fourth playlist must not be clipped by a fixed row count
assert.equal(library.getGridOptions().rows, 'auto');

const sync = make('yoto-cards-sync', {});
html = sync.shadowRoot.innerHTML;
for (const needle of ['All good', '>ok<', 'last run', 'next Mon', 'last added', 'nothing yet']) {
  assert.ok(html.includes(needle), `sync card lacks "${needle}"`);
}
for (const gone of ['container', 'playlists watched', 'updated', '37 stories']) {
  assert.ok(!html.includes(gone), `sync card still shows "${gone}"`);
}
const down = { ...hass, states: { ...hass.states, 'binary_sensor.negroni_container_yoto_sync': S('off') } };
sync.hass = down;
assert.ok(sync.shadowRoot.innerHTML.includes('Needs attention') && sync.shadowRoot.innerHTML.includes('container is not running'), 'container down state');
sync.hass = hass;
const failed = { ...hass, states: { ...hass.states,
  'binary_sensor.yoto_sync_problem': S('on', { reason: 'Hey Duggee Read-Alongs: TimeoutExpired: yt-dlp', status: 'failed' }),
  'sensor.yoto_sync_status': S('Hey Duggee Read-Alongs: TimeoutExpired: yt-dlp') } };
sync.hass = failed;
html = sync.shadowRoot.innerHTML;
assert.ok(html.includes('Needs attention') && html.includes('TimeoutExpired') && html.includes('>failed<'), 'failed state');

// listening: recorder rows around "now"
const nowSec = Date.now() / 1000;
const listening = new (registry.get('yoto-cards-listening'))();
listening.setConfig({});
listening.hass = { ...hass, callWS: async () => ({ 'sensor.yoto_player_playback': [
  { s: 'stopped', lu: nowSec - 40000 }, { s: 'playing', lu: nowSec - 3000 }, { s: 'stopped', lu: nowSec - 600 } ] }) };
await new Promise((r) => setTimeout(r, 10));
html = listening.shadowRoot.innerHTML;
assert.ok(html.includes('40 m') && html.includes('yesterday'), html.slice(0, 400));
for (const gone of ['session', 'longest', '24h']) {
  assert.ok(!html.includes(gone), `listening card still shows "${gone}"`);
}
assert.ok(!html.includes('yoto-cards error'));

console.log('yoto-cards: all checks passed');
