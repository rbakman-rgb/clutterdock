// Ten launcher themes. `tone` drives the Windows frame (light or dark title
// chrome). `chrome` is the window background painted before the page draws,
// so a theme change does not flash the wrong color.
//
// `system`, `light`, and `dark` stay valid prefs and are not in this list.

const THEMES = [
  {
    id: 'harbor',
    name: 'Harbor',
    tone: 'light',
    blurb: 'Cool paper and a clear blue. The daytime ClutterDock.',
    chrome: '#e7eef8',
  },
  {
    id: 'nightharbor',
    name: 'Night Harbor',
    tone: 'dark',
    blurb: 'Deep navy, soft blue type. Quiet after dark.',
    chrome: '#0e1524',
  },
  {
    id: 'paper',
    name: 'Paper',
    tone: 'light',
    blurb: 'Warm ivory and ink. No blue cast.',
    chrome: '#f6f1e7',
  },
  {
    id: 'ink',
    name: 'Ink',
    tone: 'dark',
    blurb: 'Near-black, high contrast, almost no color.',
    chrome: '#07080a',
  },
  {
    id: 'slate',
    name: 'Slate',
    tone: 'dark',
    blurb: 'Graphite with a violet accent. Closest to a command palette.',
    chrome: '#1c1e22',
  },
  {
    id: 'ember',
    name: 'Ember',
    tone: 'dark',
    blurb: 'Charcoal and copper. Warm, not loud.',
    chrome: '#1a1210',
  },
  {
    id: 'tide',
    name: 'Tide',
    tone: 'dark',
    blurb: 'Sea-black and aqua.',
    chrome: '#071618',
  },
  {
    id: 'moss',
    name: 'Moss',
    tone: 'dark',
    blurb: 'Forest black and sage.',
    chrome: '#101610',
  },
  {
    id: 'bloom',
    name: 'Bloom',
    tone: 'light',
    blurb: 'Warm blush and rose. Light, not pastel-candy.',
    chrome: '#fbf4f6',
  },
  {
    id: 'quartz',
    name: 'Quartz',
    tone: 'light',
    blurb: 'Cool lilac mist. Airy and a little formal.',
    chrome: '#f3f0fa',
  },
];

function themeById(id) {
  return THEMES.find((t) => t.id === id) || null;
}

module.exports = { THEMES, themeById };
