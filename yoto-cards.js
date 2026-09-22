/*! Yoto Cards — a Lovelace card set for Home Assistant
 *  https://github.com/tkamenick/lovelace-yoto-cards
 *
 *  Four cards:
 *    · custom:yoto-cards-player    — what the player is doing now: story, progress, battery, mode
 *    · custom:yoto-cards-library   — the Make-Your-Own playlists a sync maintains, and how full they are
 *    · custom:yoto-cards-sync      — whether the weekly story sync is healthy, and what it did last
 *    · custom:yoto-cards-listening — recorder-backed strip of today's listening, with yesterday for scale
 *
 *  Built for the entities published by yoto-sync (https://github.com/tkamenick/yoto-sync):
 *  the yoto-mqtt bridge's "Yoto Player" device and status.py's "Yoto sync" device.
 *  No external dependencies. Same visual language as Sun Cards and Air Quality Cards.
 */
(() => {
  'use strict';

  const VERSION = '0.1.2';
  const REPO = 'https://github.com/tkamenick/lovelace-yoto-cards';

  const ACCENTS = {
    dark: { amber: '#f2a35c', blue: '#8fa8d9', green: '#a8d98f', pink: '#d98fa8', red: '#ed7b72' },
    light: { amber: '#a8620f', blue: '#4f74ad', green: '#4a7a30', pink: '#a33c62', red: '#b7443d' },
  };

  const NEUTRALS = {
    text: 'var(--primary-text-color, #e8e6e1)',
    ink: 'var(--primary-text-color, #c9c7c2)',
    dim: 'var(--secondary-text-color, #8b8d96)',
    faint: 'var(--disabled-text-color, #565963)',
    divider: 'var(--divider-color, rgba(255,255,255,0.08))',
    track: 'var(--divider-color, rgba(255,255,255,0.09))',
    surface: 'var(--ha-card-background, var(--card-background-color, #1c1c1c))',
  };

  const palette = (darkMode) => ({ ...NEUTRALS, ...(darkMode ? ACCENTS.dark : ACCENTS.light) });

  const MONO = "'Fragment Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
  const SANS = "'Familjen Grotesk','Instrument Sans',system-ui,-apple-system,sans-serif";
  const FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Fragment+Mono&display=swap';

  function loadFonts() {
    if (document.getElementById('yoto-cards-fonts') || document.getElementById('air-quality-cards-fonts')) return;
    const link = document.createElement('link');
    link.id = 'yoto-cards-fonts';
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    document.head.appendChild(link);
  }

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const BAD = new Set(['unknown', 'unavailable', '', 'None']);
  const finite = (value) => {
    if (value == null || BAD.has(value)) return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  };

  // ---------------------------------------------------------------- entities ----
  function entity(hass, id) {
    const s = id ? hass?.states?.[id] : null;
    if (!s) return { id, present: false, ok: false, state: '', attrs: {}, updated: null, changed: null };
    return {
      id,
      present: true,
      ok: !BAD.has(s.state),
      state: s.state,
      attrs: s.attributes || {},
      updated: s.last_updated ? new Date(s.last_updated) : null,
      changed: s.last_changed ? new Date(s.last_changed) : null,
    };
  }
  const onOff = (e) => (e.ok ? e.state === 'on' : null);
  const newest = (entities) =>
    entities.reduce((best, e) => (e.updated && (!best || e.updated > best) ? e.updated : best), null);

  // ------------------------------------------------------------------- time ----
  const hour12 = (hass) => hass?.locale?.time_format !== '24';
  const lang = (hass) => hass?.locale?.language || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

  function ago(date, now = Date.now()) {
    if (!date) return '';
    const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
    if (s < 60) return `${s} s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
  }

  function until(date, now = Date.now()) {
    if (!date) return '';
    const s = Math.round((date.getTime() - now) / 1000);
    if (s < -60) return 'overdue';
    if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`;
    const h = Math.floor(s / 3600);
    if (h < 24) return `in ${h} h`;
    const d = Math.floor(h / 24);
    return `in ${d} d ${h - d * 24} h`;
  }

  function span(seconds) {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} m`;
    return `${Math.floor(m / 60)} h ${m % 60} m`;
  }

  const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function fmtWhen(date, hass) {
    if (!date || Number.isNaN(date.getTime())) return '';
    const day = new Intl.DateTimeFormat(lang(hass), { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
    return `${day} · ${fmtTime(date, hass)}`;
  }

  /** "Mon 9:28 PM": the weekday is enough when the date is within the week */
  function fmtShort(date, hass) {
    if (!date || Number.isNaN(date.getTime())) return '';
    const day = new Intl.DateTimeFormat(lang(hass), { weekday: 'short' }).format(date);
    return `${day} ${fmtTime(date, hass)}`;
  }

  function fmtTime(date, hass) {
    if (!date || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(lang(hass), { hour: 'numeric', minute: '2-digit', hour12: hour12(hass) }).format(date);
  }

  const parseDate = (value) => {
    if (!value || BAD.has(value)) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // -------------------------------------------------------------- fragments ----
  function pill(text, color) {
    return `<div style="font-family:${MONO}; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:${color}; padding:3px 9px; border:1px solid ${color}; border-radius:999px; white-space:nowrap;">${esc(text)}</div>`;
  }

  function eyebrow(text, C) {
    return `<div style="font-family:${MONO}; font-size:12px; letter-spacing:0.02em; color:${C.dim}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;">${esc(text)}</div>`;
  }

  function topRow(left, right) {
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">${left}${right}</div>`;
  }

  function footer(left, right, C, rightColor) {
    return `<div style="display:flex; justify-content:space-between; gap:12px; padding-top:14px; margin-top:auto; border-top:1px solid ${C.divider}; font-family:${MONO}; font-size:12px; color:${C.dim};">
      <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;">${left}</div>
      <div style="white-space:nowrap; color:${rightColor || C.dim};">${esc(right)}</div>
    </div>`;
  }

  const link = (id, inner, extra = '') =>
    id
      ? `<span data-entity="${esc(id)}" role="button" tabindex="0" style="cursor:pointer; ${extra}">${inner}</span>`
      : `<span style="${extra}">${inner}</span>`;

  // -------------------------------------------------------------- playlists ----
  /** The sync's per-playlist sensors: a configured list, or every sensor with a card_id attribute. */
  function playlistSensors(hass, configured) {
    const states = hass?.states || {};
    let ids;
    if (Array.isArray(configured) && configured.length) {
      ids = configured.map((p) => (typeof p === 'string' ? p : p?.entity)).filter(Boolean);
    } else {
      ids = Object.keys(states).filter((id) => id.startsWith('sensor.') && states[id].attributes?.card_id !== undefined);
    }
    return ids.map((id, index) => {
      const e = entity(hass, id);
      const cfg = Array.isArray(configured) ? configured[index] : null;
      return {
        id,
        ok: e.ok,
        title: (cfg && typeof cfg === 'object' && cfg.name) || e.attrs.title || e.attrs.friendly_name || id,
        stories: finite(e.state),
        minutes: finite(e.attrs.minutes),
        mb: finite(e.attrs.mb),
        cardId: e.attrs.card_id || null,
        known: finite(e.attrs.known),
        missing: Array.isArray(e.attrs.missing) ? e.attrs.missing : [],
        tone: (cfg && typeof cfg === 'object' && cfg.color) || null,
      };
    });
  }

  // ------------------------------------------------------------------- base ----
  class YotoCardsBase extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._signatureValue = null;
    }

    setConfig(config) {
      this._config = this._normalizeConfig({ ...this.constructor.defaults, ...(config || {}) });
      this._signatureValue = null;
      if (this._hass) this._render();
    }

    _normalizeConfig(cfg) {
      return cfg;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config) return;
      if (this._config.load_fonts !== false) loadFonts();
      const signature = this._signature();
      if (signature !== this._signatureValue) {
        this._signatureValue = signature;
        this._render();
      }
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      // "updated 12 s ago" and "in 6 d 22 h" drift on their own
      this._timer = setInterval(() => {
        if (this._hass && this._config) this._render();
      }, 30000);
      if (this._hass && this._config) this._render();
    }

    disconnectedCallback() {
      clearInterval(this._timer);
    }

    _entityIds() {
      return [];
    }

    _signature() {
      return [
        this._hass?.themes?.darkMode,
        ...this._entityIds().map((id) => {
          const state = this._hass?.states?.[id];
          return `${id}:${state?.state ?? ''}:${state?.last_updated || ''}`;
        }),
      ].join('|');
    }

    _pal() {
      return palette(this._hass?.themes?.darkMode !== false);
    }

    _card(inner) {
      const C = this._pal();
      return `<ha-card style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; padding:22px 26px 18px; color:${C.text}; font-family:${SANS};">${inner}</ha-card>`;
    }

    _render() {
      if (!this.shadowRoot) return;
      let html;
      try {
        html = this._template();
      } catch (error) {
        html = `<ha-card style="display:block; padding:16px; font-family:${MONO}; font-size:12px;">yoto-cards error: ${esc(error?.message || error)}</ha-card>`;
      }
      this.shadowRoot.innerHTML = html;
      this.shadowRoot.querySelectorAll('[data-entity]').forEach((el) => {
        const open = () => {
          this.dispatchEvent(
            new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: el.dataset.entity } })
          );
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
      });
    }

    getCardSize() {
      return this.constructor.cardSize || 6;
    }

    getGridOptions() {
      // 7 rows ≈ 440 px in a sections view: the sync card's four rows need it, and the three sit level
      return { columns: 12, rows: 7, min_columns: 6, min_rows: 5 };
    }

    static getStubConfig() {
      return {};
    }
  }

  // ----------------------------------------------------------------- player ----
  const PLAYER_KEYS = {
    playback: 'sensor.{p}_playback',
    now_playing: 'sensor.{p}_now_playing',
    track: 'sensor.{p}_track',
    chapter: 'sensor.{p}_chapter',
    position: 'sensor.{p}_position',
    track_length: 'sensor.{p}_track_length',
    battery: 'sensor.{p}_battery',
    charging: 'binary_sensor.{p}_charging',
    volume: 'sensor.{p}_volume',
    headphones: 'binary_sensor.{p}_headphones',
    bluetooth: 'binary_sensor.{p}_bluetooth_headphones',
    card: 'sensor.{p}_card',
    card_inserted: 'binary_sensor.{p}_card_inserted',
    day_mode: 'binary_sensor.{p}_day_mode',
    sleep_timer: 'binary_sensor.{p}_sleep_timer',
  };

  /** "Queens (read by Helena Bonham Carter)" -> ["Queens", "read by Helena Bonham Carter"] */
  function splitTrack(track, chapter) {
    const m = /^(.*?)\s*\((read by [^)]+)\)\s*$/i.exec(track || '');
    if (m) return [m[1] || chapter, m[2]];
    if (track && chapter && track !== chapter) return [chapter, track];
    return [chapter || track || '', ''];
  }

  class YotoCardsPlayer extends YotoCardsBase {
    static defaults = { player: 'yoto_player', name: '', entities: {}, playlists: null, load_fonts: true };
    static cardSize = 6;

    static getStubConfig() {
      return { player: 'yoto_player' };
    }

    _normalizeConfig(cfg) {
      const overrides = cfg.entities || {};
      cfg.ids = Object.fromEntries(
        Object.entries(PLAYER_KEYS).map(([key, template]) => [key, overrides[key] || template.replace('{p}', cfg.player)])
      );
      return cfg;
    }

    _entityIds() {
      const listed = Array.isArray(this._config.playlists)
        ? this._config.playlists.map((p) => (typeof p === 'string' ? p : p?.entity)).filter(Boolean)
        : Object.keys(this._hass?.states || {}).filter((id) => id.startsWith('sensor.yoto_sync_'));
      return [...Object.values(this._config.ids), ...listed];
    }

    _template() {
      const C = this._pal();
      const hass = this._hass;
      const ids = this._config.ids;
      const e = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, entity(hass, id)]));
      const now = Date.now();

      const playback = e.playback.ok ? e.playback.state : e.playback.present ? 'offline' : 'missing';
      const playing = playback === 'playing';
      const paused = playback === 'paused';
      const tone = playing ? C.amber : paused ? C.blue : C.dim;
      const inserted = onOff(e.card_inserted);
      const cardId = e.card.ok && e.card.state !== 'none' ? e.card.state : null;
      const noCard = !playing && !paused && !cardId && inserted === false;

      const playlists = playlistSensors(hass, this._config.playlists);
      const playlist = cardId ? playlists.find((p) => p.cardId === cardId) : null;
      const chapter = e.now_playing.ok ? e.now_playing.state : '';
      const [title0, narrator0] = splitTrack(e.track.ok ? e.track.state : '', chapter);
      let title = title0;
      let narrator = narrator0;
      let where = '';
      if (playback === 'missing') {
        title = 'No player';
        narrator = `no ${ids.playback}`;
      } else if (playback === 'offline') {
        title = 'Offline';
        narrator = 'the bridge is not reporting';
      } else if (noCard || !title) {
        title = 'No card';
        narrator = 'slot empty';
        where = 'put a card in to play';
      } else {
        if (!playing && !paused) narrator = narrator ? `stopped · ${narrator}` : 'stopped';
        const chapterNo = finite(e.chapter.state);
        const of = playlist && Number.isFinite(playlist.stories) ? ` of ${playlist.stories}` : '';
        const chapterText = Number.isFinite(chapterNo) ? `chapter ${chapterNo}${of}` : '';
        where = [playlist ? playlist.title : cardId ? `card ${cardId}` : '', chapterText].filter(Boolean).join(' · ');
      }
      const muted = !playing && !paused;

      const position = finite(e.position.state);
      const length = finite(e.track_length.state);
      const progress = playing || paused ? (length > 0 ? clamp(position / length, 0, 1) : 0) : 0;
      const elapsed = (playing || paused) && Number.isFinite(position) ? clock(position) : '—';
      const total = (playing || paused) && length > 0 ? `of ${clock(length)}` : '';

      const day = onOff(e.day_mode);
      const name = (this._config.name || (e.playback.attrs.friendly_name || 'Yoto').replace(/\s*playback$/i, '')).toLowerCase();
      const eyebrowText = [name, day === null ? '' : day ? 'day mode' : 'night mode'].filter(Boolean).join(' · ');

      const battery = finite(e.battery.state);
      const charging = onOff(e.charging);
      const bt = onOff(e.bluetooth);
      const wired = onOff(e.headphones);
      const sleep = onOff(e.sleep_timer);
      const volume = finite(e.volume.state);
      const facts = [
        {
          id: ids.battery, label: 'battery',
          value: Number.isFinite(battery) ? `${Math.round(battery)}%` : '—',
          color: Number.isFinite(battery) && battery < 20 && !charging ? C.red : C.text,
          note: charging ? 'charging' : Number.isFinite(battery) && battery < 20 ? 'low' : '',
          noteColor: charging ? C.amber : C.red,
        },
        { id: ids.volume, label: 'volume', value: Number.isFinite(volume) ? `${Math.round(volume)}%` : '—', color: C.text,
          note: Number.isFinite(volume) && volume === 0 ? 'muted' : '', noteColor: C.dim },
        { id: bt ? ids.bluetooth : ids.headphones, label: 'headphones',
          value: bt ? 'bluetooth' : wired ? 'wired' : 'none', color: bt ? C.blue : C.text, note: '', noteColor: C.dim },
        { id: ids.sleep_timer, label: 'sleep', value: sleep ? 'on' : sleep === null ? '—' : 'off',
          color: sleep ? C.amber : C.text, note: '', noteColor: C.dim },
      ];

      const ring = 132;
      const half = ring / 2;
      const radius = half - 8;
      const circ = 2 * Math.PI * radius;
      const dash = `${(progress * circ).toFixed(1)} ${circ.toFixed(1)}`;
      const titleSize = title.length > 18 ? 24 : 30;
      const updated = newest(Object.values(e));
      const cardLabel = cardId ? `card ${cardId}` : noCard ? 'no card' : e.card.ok ? 'no card' : '';
      const cardName = playlist && cardId ? ` · ${playlist.title}` : '';

      return this._card(`
        ${topRow(eyebrow(eyebrowText, C), pill(playback, tone))}
        <div style="display:flex; gap:22px; align-items:center; margin-top:22px;">
          <div style="position:relative; width:${ring}px; height:${ring}px; flex-shrink:0;">
            <svg width="${ring}" height="${ring}" style="display:block;" aria-hidden="true">
              <circle cx="${half}" cy="${half}" r="${radius}" fill="none" stroke="${C.track}" stroke-width="7"></circle>
              ${progress > 0 ? `<circle cx="${half}" cy="${half}" r="${radius}" fill="none" stroke="${tone}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(-90 ${half} ${half})"></circle>` : ''}
            </svg>
            <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">
              <div style="font-size:22px; font-weight:600; letter-spacing:-0.01em; color:${muted ? C.dim : C.text};">${esc(elapsed)}</div>
              <div style="font-family:${MONO}; font-size:11px; color:${C.dim};">${esc(total)}</div>
            </div>
          </div>
          <div style="flex-grow:1; min-width:0; display:flex; flex-direction:column; gap:7px;">
            ${link(ids.now_playing, `<div style="font-size:${titleSize}px; font-weight:600; line-height:1.08; letter-spacing:-0.015em; color:${muted ? C.dim : C.text};">${esc(title)}</div>`, 'display:block;')}
            <div style="font-family:${MONO}; font-size:13px; line-height:1.35; color:${C.ink}; overflow:hidden; text-overflow:ellipsis;">${esc(narrator)}</div>
            <div style="font-family:${MONO}; font-size:12px; line-height:1.35; color:${C.dim}; overflow:hidden; text-overflow:ellipsis;">${esc(where)}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; margin-top:24px; padding-top:16px; border-top:1px solid ${C.divider};">
          ${facts
            .map(
              (f) => `${link(f.id, `<div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
                <div style="font-family:${MONO}; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:${C.dim}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(f.label)}</div>
                <div style="font-size:16px; font-weight:500; color:${f.color}; white-space:nowrap;">${esc(f.value)}</div>
                <div style="font-family:${MONO}; font-size:11px; color:${f.noteColor}; white-space:nowrap; min-height:14px;">${esc(f.note)}</div>
              </div>`, 'display:block; min-width:0;')}`
            )
            .join('')}
        </div>
        <div style="height:18px;"></div>
        ${footer(
          `<span style="color:${cardId ? C.amber : C.dim};">${esc(cardLabel)}</span>${esc(cardName)}`,
          updated ? `updated ${ago(updated, now)}` : '',
          C
        )}
      `);
    }
  }

  // ---------------------------------------------------------------- library ----
  const TONES = ['blue', 'amber', 'green', 'pink', 'red'];

  class YotoCardsLibrary extends YotoCardsBase {
    static defaults = {
      playlists: null,
      stories: 'sensor.yoto_sync_stories',
      next_run: 'sensor.yoto_sync_next_run',
      cap_mb: 500,
      cap_stories: 100,
      name: 'make your own',
      load_fonts: true,
    };
    static cardSize = 6;

    _entityIds() {
      const listed = Array.isArray(this._config.playlists)
        ? this._config.playlists.map((p) => (typeof p === 'string' ? p : p?.entity)).filter(Boolean)
        : Object.keys(this._hass?.states || {}).filter((id) => id.startsWith('sensor.yoto_sync_'));
      return [this._config.stories, this._config.next_run, ...listed].filter(Boolean);
    }

    _template() {
      const C = this._pal();
      const hass = this._hass;
      const cfg = this._config;
      const playlists = playlistSensors(hass, cfg.playlists);
      const storiesEntity = entity(hass, cfg.stories);
      const total = Number.isFinite(finite(storiesEntity.state))
        ? finite(storiesEntity.state)
        : playlists.reduce((n, p) => n + (Number.isFinite(p.stories) ? p.stories : 0), 0);
      const minutes = playlists.reduce((n, p) => n + (Number.isFinite(p.minutes) ? p.minutes : 0), 0);
      const nextRun = parseDate(entity(hass, cfg.next_run).state);

      const rows = playlists.map((p, i) => {
        const pct = Number.isFinite(p.mb) ? clamp((p.mb / cfg.cap_mb) * 100, 0, 100) : 0;
        const storyPct = Number.isFinite(p.stories) ? (p.stories / cfg.cap_stories) * 100 : 0;
        const worst = Math.max(pct, storyPct);
        const fill = worst < 60 ? C.green : worst < 80 ? C.amber : C.red;
        const owed = Number.isFinite(p.known) && Number.isFinite(p.stories) && p.known > p.stories ? p.known - p.stories : 0;
        const meta = p.ok
          ? [`${Number.isFinite(p.minutes) ? p.minutes : '—'} min`, `${Number.isFinite(p.mb) ? Math.round(p.mb) : '—'} MB`, `${Math.round(pct)}%`]
              .join(' · ') + (owed ? ` · ${owed} owed` : '')
          : 'unavailable';
        return {
          id: p.id,
          name: p.title,
          dot: C[p.tone] || C[TONES[i % TONES.length]],
          stories: p.ok && Number.isFinite(p.stories) ? `${p.stories} ${p.stories === 1 ? 'story' : 'stories'}` : '—',
          meta,
          metaColor: owed ? C.amber : C.dim,
          fill,
          width: `${Math.max(1.5, pct).toFixed(1)}%`,
        };
      });

      const h = Math.floor(minutes / 60);
      const sub = playlists.length
        ? `${h ? `${h} h ` : ''}${minutes % 60} m · ${playlists.length} ${playlists.length === 1 ? 'card' : 'cards'}`
        : 'no playlist sensors found';

      return this._card(`
        ${eyebrow(`${cfg.name} · ${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`, C)}
        <div style="display:flex; align-items:baseline; gap:12px; margin-top:14px; min-width:0;">
          ${link(cfg.stories, `<div style="font-size:34px; font-weight:600; line-height:1.05; letter-spacing:-0.015em; color:${C.text}; white-space:nowrap;">${esc(total)} stories</div>`)}
          <div style="font-family:${MONO}; font-size:12px; color:${C.amber}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;">${esc(sub)}</div>
        </div>
        <div style="display:flex; flex-direction:column; margin-top:16px;">
          ${rows
            .map(
              (r) => `${link(r.id, `<div style="display:flex; flex-direction:column; gap:8px; padding:12px 0 13px; border-top:1px solid ${C.divider};">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:8px; height:8px; border-radius:999px; background:${r.dot}; flex-shrink:0;"></div>
                  <div style="flex-grow:1; min-width:0; font-size:15px; font-weight:500; color:${C.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.name)}</div>
                  <div style="font-size:15px; font-weight:500; color:${C.text}; white-space:nowrap;">${esc(r.stories)}</div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="flex-grow:1; height:4px; border-radius:2px; background:${C.track}; position:relative; overflow:hidden;">
                    <div style="position:absolute; left:0; top:0; bottom:0; width:${r.width}; border-radius:2px; background:${r.fill};"></div>
                  </div>
                  <div style="font-family:${MONO}; font-size:11px; color:${r.metaColor}; white-space:nowrap;">${esc(r.meta)}</div>
                </div>
              </div>`, 'display:block;')}`
            )
            .join('')}
        </div>
        <div style="height:18px;"></div>
        ${footer(
          esc(`cap ${cfg.cap_stories} · ${cfg.cap_mb} MB`),
          nextRun ? `next check ${fmtShort(nextRun, hass)}` : '',
          C,
          C.amber
        )}
      `);
    }
  }

  // ------------------------------------------------------------------- sync ----
  class YotoCardsSync extends YotoCardsBase {
    static defaults = {
      problem: 'binary_sensor.yoto_sync_problem',
      status: 'sensor.yoto_sync_status',
      last_run: 'sensor.yoto_sync_last_run',
      next_run: 'sensor.yoto_sync_next_run',
      last_added: 'sensor.yoto_sync_last_added',
      stories: 'sensor.yoto_sync_stories',
      container: 'binary_sensor.negroni_container_yoto_sync',
      name: 'weekly · yoto-sync',
      load_fonts: true,
    };
    static cardSize = 6;

    _entityIds() {
      const cfg = this._config;
      return [cfg.problem, cfg.status, cfg.last_run, cfg.next_run, cfg.last_added, cfg.stories, cfg.container].filter(Boolean);
    }

    _template() {
      const C = this._pal();
      const hass = this._hass;
      const cfg = this._config;
      const now = Date.now();
      const problem = entity(hass, cfg.problem);
      const status = entity(hass, cfg.status);
      const lastRun = parseDate(entity(hass, cfg.last_run).state);
      const nextRun = parseDate(entity(hass, cfg.next_run).state);
      const lastAdded = entity(hass, cfg.last_added);
      const stories = finite(entity(hass, cfg.stories).state);
      const container = entity(hass, cfg.container);

      const runState = problem.attrs.status || (problem.ok ? (onOff(problem) ? 'failed' : 'ok') : '');
      const offline = !status.present && !problem.present;
      const state = offline ? 'offline' : !problem.ok && !status.ok ? 'unknown' : runState || 'unknown';
      const tone = { ok: C.green, failed: C.red, running: C.amber }[state] || C.dim;
      const headline = { ok: 'All good', failed: 'Needs attention', running: 'Running', offline: 'No sensors' }[state] || 'Unknown';
      const reason = state === 'failed' ? problem.attrs.reason || status.state : '';

      const summary = status.ok ? status.state : '';
      const tail = summary.includes(', ') ? summary.slice(summary.lastIndexOf(', ') + 2) : '';
      const aside =
        state === 'failed'
          ? ''
          : state === 'running'
            ? 'checking sources'
            : [Number.isFinite(stories) ? `${stories} stories` : '', tail].filter(Boolean).join(' · ');
      const sub = state === 'offline'
        ? `no ${cfg.status}`
        : lastRun
          ? `last run ${fmtWhen(lastRun, hass)}${state === 'running' ? ' · running now' : ''}`
          : summary || 'no run recorded yet';

      const addedWhen = parseDate(lastAdded.attrs.when);
      const addedCount = finite(lastAdded.attrs.count);
      const containerUp = onOff(container);
      const rows = [
        { id: cfg.last_run, label: 'last run', value: lastRun ? ago(lastRun, now) + (state === 'failed' ? ' · failed' : '') : '—',
          color: state === 'failed' ? C.red : C.text, note: '' },
        { id: cfg.next_run, label: 'next run', value: nextRun ? fmtWhen(nextRun, hass) : '—', color: C.text,
          note: nextRun ? until(nextRun, now) : '' },
        { id: cfg.last_added, label: 'last added', value: lastAdded.ok ? lastAdded.state : '—', color: C.text,
          note: addedWhen ? `${fmtWhen(addedWhen, hass)}${Number.isFinite(addedCount) && addedCount > 1 ? ` · ${addedCount} stories` : ''}` : '' },
      ];
      if (cfg.container) {
        rows.push({
          id: cfg.container, label: 'container',
          value: containerUp === null ? '—' : containerUp ? 'up' : 'down',
          color: containerUp === false ? C.red : C.text,
          note: container.changed && containerUp !== null ? `since ${fmtWhen(container.changed, hass)}` : '',
        });
      }
      const updated = newest([problem, status, lastAdded, container]);

      return this._card(`
        ${topRow(eyebrow(cfg.name, C), pill(state, tone))}
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-top:14px;">
          ${link(cfg.status, `<div style="font-size:34px; font-weight:600; line-height:1.05; letter-spacing:-0.015em; color:${C.text}; white-space:nowrap;">${esc(headline)}</div>`)}
          <div style="font-family:${MONO}; font-size:12px; text-align:right; color:${tone}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;">${esc(aside)}</div>
        </div>
        <div style="font-family:${MONO}; font-size:12px; line-height:1.4; color:${C.dim}; margin-top:6px;">${esc(sub)}</div>
        ${reason ? `<div style="font-family:${MONO}; font-size:12px; line-height:1.4; color:${C.red}; margin-top:8px; padding:8px 10px; border:1px solid ${C.red}; border-radius:8px;">${esc(reason)}</div>` : ''}
        <div style="display:flex; flex-direction:column; margin-top:16px;">
          ${rows
            .map(
              (r) => `${link(r.id, `<div style="display:flex; align-items:baseline; justify-content:space-between; gap:16px; padding:10px 0; border-top:1px solid ${C.divider};">
                <div style="font-family:${MONO}; font-size:12px; color:${C.dim}; white-space:nowrap;">${esc(r.label)}</div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; min-width:0;">
                  <div style="font-size:15px; font-weight:500; color:${r.color}; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${esc(r.value)}</div>
                  ${r.note ? `<div style="font-family:${MONO}; font-size:11px; color:${C.dim}; white-space:nowrap;">${esc(r.note)}</div>` : ''}
                </div>
              </div>`, 'display:block;')}`
            )
            .join('')}
        </div>
        <div style="height:18px;"></div>
        ${footer(esc(this._sources()), updated ? `updated ${ago(updated, now)}` : '', C)}
      `);
    }

    _sources() {
      const playlists = playlistSensors(this._hass, null);
      const n = playlists.length;
      return n ? `${n} ${n === 1 ? 'playlist' : 'playlists'} watched` : '';
    }
  }

  // -------------------------------------------------------------- listening ----
  /**
   * Playing intervals from a history/history_during_period result (minimal_response):
   * [{s, lu}] -> [[startMs, endMs], ...], clipped to [fromMs, toMs].
   */
  function playingIntervals(rows, fromMs, toMs, playingStates = ['playing']) {
    const out = [];
    const list = (rows || []).slice().sort((a, b) => a.lu - b.lu);
    for (let i = 0; i < list.length; i += 1) {
      if (!playingStates.includes(list[i].s)) continue;
      const start = Math.max(fromMs, list[i].lu * 1000);
      const end = Math.min(toMs, i + 1 < list.length ? list[i + 1].lu * 1000 : toMs);
      if (end > start) {
        if (out.length && start - out[out.length - 1][1] < 60000) out[out.length - 1][1] = end; // a 5 s hiccup is one session
        else out.push([start, end]);
      }
    }
    return out;
  }

  const sumMs = (intervals) => intervals.reduce((n, [a, b]) => n + (b - a), 0);

  class YotoCardsListening extends HTMLElement {
    static defaults = {
      playback: 'sensor.yoto_player_playback',
      now_playing: 'sensor.yoto_player_now_playing',
      name: 'today · 24h',
      refresh_interval: 300,
      load_fonts: true,
    };
    static cardSize = 4;

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._data = null;
      this._loading = false;
      this._error = null;
      this._requestToken = 0;
      this._lastFetch = 0;
    }

    static getStubConfig() {
      return { playback: 'sensor.yoto_player_playback' };
    }

    setConfig(config) {
      this._config = { ...YotoCardsListening.defaults, ...(config || {}) };
      this._data = null;
      this._error = null;
      this._lastFetch = 0;
      if (this._hass) {
        this._render();
        this._maybeLoad();
      }
    }

    set hass(hass) {
      const playbackChanged = this._hass?.states?.[this._config?.playback]?.last_updated !== hass?.states?.[this._config?.playback]?.last_updated;
      const connectionChanged = this._hass?.connection !== hass?.connection;
      this._hass = hass;
      if (!this._config) return;
      if (this._config.load_fonts !== false) loadFonts();
      if (connectionChanged) this._lastFetch = 0;
      if (playbackChanged) this._render();
      this._maybeLoad(playbackChanged);
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      this._maybeLoad();
      this._refreshTimer = setInterval(() => this._maybeLoad(true), (this._config?.refresh_interval || 300) * 1000);
      this._tick = setInterval(() => this._render(), 60000);
    }

    disconnectedCallback() {
      clearInterval(this._refreshTimer);
      clearInterval(this._tick);
    }

    _range() {
      const end = new Date();
      const today = new Date(end);
      today.setHours(0, 0, 0, 0);
      const start = new Date(today.getTime() - 86400000); // yesterday's midnight, for the comparison
      return { start, today, end };
    }

    async _maybeLoad(force = false) {
      if (!this._config || !this._hass?.callWS || this._loading) return;
      const refreshMs = (this._config.refresh_interval || 300) * 1000;
      if (!force && this._lastFetch && Date.now() - this._lastFetch < refreshMs) return;
      const token = ++this._requestToken;
      this._loading = true;
      this._error = null;
      const { start, end } = this._range();
      try {
        const data = await this._hass.callWS({
          type: 'history/history_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          entity_ids: [this._config.playback],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        });
        if (token !== this._requestToken) return;
        this._data = data || {};
        this._lastFetch = Date.now();
      } catch (error) {
        if (token !== this._requestToken) return;
        this._error = error?.message || String(error);
      } finally {
        if (token === this._requestToken) {
          this._loading = false;
          this._render();
        }
      }
    }

    _pal() {
      return palette(this._hass?.themes?.darkMode !== false);
    }

    _render() {
      if (!this._config || !this.shadowRoot) return;
      let html;
      try {
        html = this._template();
      } catch (error) {
        html = `<ha-card style="display:block; padding:16px; font-family:${MONO}; font-size:12px;">yoto-cards error: ${esc(error?.message || error)}</ha-card>`;
      }
      this.shadowRoot.innerHTML = html;
      this.shadowRoot.querySelectorAll('[data-entity]').forEach((el) => {
        el.addEventListener('click', () => {
          this.dispatchEvent(
            new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: el.dataset.entity } })
          );
        });
      });
    }

    _template() {
      const C = this._pal();
      const hass = this._hass;
      const cfg = this._config;
      const { start, today, end } = this._range();
      const nowMs = end.getTime();
      const rows = this._data ? this._data[cfg.playback] || [] : null;
      const all = rows ? playingIntervals(rows, start.getTime(), nowMs) : [];
      const todayMs = today.getTime();
      const todays = all.filter(([, b]) => b > todayMs).map(([a, b]) => [Math.max(a, todayMs), b]);
      const yesterdays = all.filter(([a]) => a < todayMs).map(([a, b]) => [a, Math.min(b, todayMs)]);
      const totalToday = sumMs(todays) / 1000;
      const totalYesterday = sumMs(yesterdays) / 1000;
      const longest = todays.reduce((best, iv) => (!best || iv[1] - iv[0] > best[1] - best[0] ? iv : best), null);
      const live = entity(hass, cfg.playback).state === 'playing';
      const nowPlaying = entity(hass, cfg.now_playing);
      const lastEnd = todays.length ? new Date(todays[todays.length - 1][1]) : null;

      const headline = rows === null ? (this._error ? 'No history' : '…') : totalToday < 60 ? 'Nothing yet' : span(totalToday);
      const sub = this._error
        ? this._error
        : live
          ? `playing now · ${nowPlaying.ok ? nowPlaying.state : ''}`
          : lastEnd && nowPlaying.ok
            ? `listening today · last played ${nowPlaying.state} at ${fmtTime(lastEnd, hass)}`
            : rows === null
              ? 'loading the recorder'
              : 'listening today';
      const pct = (ms) => `${((clamp(ms - todayMs, 0, 86400000) / 86400000) * 100).toFixed(2)}%`;
      const segments = todays
        .map(([a, b]) => `<div style="position:absolute; top:10px; height:24px; left:${pct(a)}; width:${Math.max(0.35, ((b - a) / 86400000) * 100).toFixed(2)}%; border-radius:4px; background:${C.amber};"></div>`)
        .join('');
      const nowLeft = pct(nowMs);
      const sessions = todays.length;
      const footLeft = longest
        ? `longest ${span((longest[1] - longest[0]) / 1000)} · ${fmtTime(new Date(longest[0]), hass)} – ${fmtTime(new Date(longest[1]), hass)}`
        : '';
      const footRight = rows === null ? '' : `yesterday ${totalYesterday < 60 ? 'nothing' : span(totalYesterday)}`;

      return `<ha-card style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; padding:22px 26px 18px; color:${C.text}; font-family:${SANS};">
        ${topRow(eyebrow(cfg.name, C), `<div style="font-family:${MONO}; font-size:12px; color:${C.dim}; white-space:nowrap;">${esc(rows === null ? '' : `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`)}</div>`)}
        <div style="display:flex; align-items:baseline; gap:14px; margin-top:12px; flex-wrap:wrap;">
          ${link(cfg.playback, `<div style="font-size:34px; font-weight:600; line-height:1.05; letter-spacing:-0.015em; color:${C.text}; white-space:nowrap;">${esc(headline)}</div>`)}
          <div style="font-family:${MONO}; font-size:12px; color:${this._error ? C.red : C.amber}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;">${esc(sub)}</div>
        </div>
        <div style="position:relative; height:44px; margin-top:18px;">
          <div style="position:absolute; left:0; right:0; top:10px; height:24px; border-radius:4px; background:${C.track};"></div>
          ${segments}
          <div style="position:absolute; top:0; bottom:0; left:${nowLeft}; width:0; border-left:1px dashed ${C.ink};"></div>
          <div style="position:absolute; top:-3px; left:${nowLeft}; width:7px; height:7px; margin-left:-3px; border-radius:999px; background:${C.ink};"></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; font-family:${MONO}; font-size:11px; color:${C.dim};">
          <div>12 AM</div><div>6 AM</div><div>12 PM</div><div>6 PM</div><div>12 AM</div>
        </div>
        <div style="height:18px;"></div>
        ${footer(esc(footLeft), footRight, C)}
      </ha-card>`;
    }

    getCardSize() {
      return YotoCardsListening.cardSize;
    }

    getGridOptions() {
      return { columns: 'full', rows: 'auto', min_columns: 6 };
    }
  }

  customElements.define('yoto-cards-player', YotoCardsPlayer);
  customElements.define('yoto-cards-library', YotoCardsLibrary);
  customElements.define('yoto-cards-sync', YotoCardsSync);
  customElements.define('yoto-cards-listening', YotoCardsListening);

  window.customCards = window.customCards || [];
  window.customCards.push(
    { type: 'yoto-cards-player', name: 'Yoto Cards · Player', preview: true,
      description: 'What the player is doing now: story, progress ring, battery, volume, headphones, sleep timer.', documentationURL: REPO },
    { type: 'yoto-cards-library', name: 'Yoto Cards · Library', preview: true,
      description: 'The Make-Your-Own playlists the sync maintains, with a fill bar against the card cap.', documentationURL: REPO },
    { type: 'yoto-cards-sync', name: 'Yoto Cards · Sync', preview: true,
      description: 'Whether the weekly story sync is healthy: last run, next run, last story added, reason on failure.', documentationURL: REPO },
    { type: 'yoto-cards-listening', name: 'Yoto Cards · Listening', preview: true,
      description: 'Recorder-backed strip of today’s listening sessions, with yesterday for scale.', documentationURL: REPO }
  );

  window.__YOTO_CARDS__ = { VERSION, splitTrack, playingIntervals, ago, until, span, clock, playlistSensors };

  console.info(
    `%c YOTO-CARDS %c v${VERSION} `,
    'background:#f2a35c;color:#131318;border-radius:4px 0 0 4px;padding:2px 6px;font-weight:600;',
    'background:#16171d;color:#f2a35c;border-radius:0 4px 4px 0;padding:2px 6px;'
  );
})();
