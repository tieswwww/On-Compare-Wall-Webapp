// Hex codes for On sales color names. The On `sales_color_name` field is
// typically "Primary | Secondary" (e.g. "Black | Frost"). We pick whichever
// token resolves to the more saturated color so the visual hint isn't
// dominated by neutrals like "Black" or "White".
//
// Values are hand-picked approximations based on On's published palette
// naming. Tweak freely — this is a presentational hint, not a brand spec.

const COLOR_MAP: Record<string, string> = {
  // Neutrals — black/grey
  All: "#0a0a0a",
  Black: "#0a0a0a",
  Eclipse: "#1c1c1e",
  Obsidian: "#0d0f12",
  Midnight: "#0f1726",
  Inkberry: "#16121f",
  Inkwell: "#15182a",
  Nocturne: "#171a26",
  Mystere: "#262a33",
  Magnet: "#3a3d42",
  Asphalt: "#3c3f44",
  Granite: "#4a4d52",
  Shadow: "#3d4046",
  Shade: "#52555b",
  Stratos: "#2b3a55",
  Trench: "#2a2d33",
  Iron: "#54585f",
  Metal: "#5f6369",
  Stone: "#6b6c70",
  Rock: "#7a7c80",
  Flint: "#6d7176",
  Cinder: "#56585d",
  Ash: "#8a8c90",
  Fog: "#b6b8bc",
  Mantle: "#7e8186",
  Mineral: "#5b6066",
  Monolith: "#3f434a",
  Tundra: "#9aa0a6",
  Tempest: "#404754",
  Pelican: "#a8acb1",
  Argent: "#c0c2c6",
  Silver: "#c8cacd",
  Nimbus: "#cdd0d4",
  Alloy: "#b0b3b8",
  Skyline: "#9aa6b4",
  Steel: "#6b7480",
  Tin: "#9da1a6",
  Statue: "#9ea3a8",

  // Whites / off-whites
  White: "#f4f4f2",
  Ivory: "#efe9dc",
  Pearl: "#ecebe5",
  Chalk: "#ece9e1",
  Ghost: "#e8e6df",
  Vellum: "#e5dfd0",
  Cream: "#f0e6d2",
  Meringue: "#e9dfc8",
  Porcelain: "#eee9e0",
  Gardenia: "#efebde",
  Seashell: "#f1ece1",
  Salt: "#efeee9",
  Tulle: "#e8e2d6",
  Linen: "#e3dac6",
  Blonde: "#e7d8b8",
  Sphinx: "#d8cfbf",
  Dust: "#cfc7b7",
  Flour: "#ede6d4",
  Dew: "#dfe2d4",

  // Beiges / sands / browns
  Sand: "#d6c4a3",
  Gobi: "#cfb892",
  Pebble: "#bcae93",
  Sandstone: "#c9b189",
  Sandalwood: "#a8896a",
  Latte: "#a3866a",
  Chai: "#9a7e60",
  Truffle: "#7b5f49",
  Bask: "#a07c5b",
  Cassava: "#a98864",
  Hillier: "#8a6b4d",
  Earth: "#6b4a32",
  Terre: "#5e3f2a",
  Padauk: "#5a3a2a",
  Acajou: "#4a2a20",
  Cherrywood: "#5c2d27",
  Bronzite: "#6e4530",
  Hearth: "#7a3f2a",
  Wenge: "#3d2820",
  Brass: "#a98146",
  Honey: "#c79545",
  Butterscotch: "#c98a3e",
  Amber: "#c97a2a",
  Tangerine: "#e87a2c",
  Sunstone: "#d27a3a",
  Flame: "#dc4a2a",
  Annatto: "#b8482b",
  Red: "#c1352a",
  Crimson: "#9b2030",
  Maroon: "#5a1f24",
  Cinnamon: "#a55336",
  Coralite: "#e87f6a",
  Antique: "#b88a72",
  Pulcino: "#e6c87a",
  Chamomile: "#e7d883",
  Sundew: "#d8c45c",
  Lima: "#c8d24a",
  Lime: "#c8e04a",
  Limelight: "#d6e054",
  Spirulina: "#3f7a4a",
  Bloom: "#b8d36a",
  Sprout: "#a6c272",
  Spore: "#8aa066",
  Seedling: "#7a9758",
  Olive: "#6b7340",
  Safari: "#7a7440",
  Marsh: "#5e6442",
  Cyprus: "#3e5640",
  Evergreen: "#1f4530",
  Juniper: "#274a3a",
  Lichen: "#5f7350",
  Jungle: "#1c3a26",
  Thorn: "#3c4a2e",
  Artichoke: "#6e7448",
  Liana: "#4a5a32",
  Mire: "#3a3c2a",
  Moor: "#3e3d33",
  Grove: "#3f5036",
  Canna: "#7a3f3a",
  Pietra: "#7a6a58",
  Relic: "#85745c",
  Santal: "#9a7456",
  Olympus: "#a89c8a",
  Moonstone: "#b8b0a4",
  Pixie: "#9ac0c0",

  // Blues / cyans
  Ciel: "#a8c4d8",
  Glacier: "#b8d2dc",
  Ice: "#d6e6ec",
  Iceberg: "#c4dde2",
  Frost: "#d2e2e6",
  Arctic: "#cce2e8",
  Freeze: "#9bb8c6",
  Robin: "#7ab0c4",
  Gourami: "#4a8aa8",
  Cerulean: "#1f6a9c",
  Reef: "#2a7a9a",
  Pond: "#3a6a78",
  Harbor: "#3a5a78",
  Sailor: "#1f3a5e",
  Navy: "#172a4a",
  Indigo: "#202850",
  Larkspur: "#3a4a8a",
  Apollo: "#2a4a8a",
  Zodiac: "#1a2e54",
  Ultramarine: "#2c3aa0",
  Galaxy: "#1a1e3a",
  Nebula: "#3a3a6e",
  Creek: "#3a5e6a",
  Tide: "#3a6a7a",
  Horizon: "#7a96b0",
  Malibu: "#3a8acc",
  Meteor: "#2a4a7a",
  Lucent: "#dce4ea",
  Ion: "#a8c8d8",
  Ore: "#6a727a",

  // Pinks / purples / reds
  Pink: "#e89aac",
  Sakura: "#f0c4cf",
  Blush: "#e8c6c0",
  Rosy: "#e6a4a4",
  Rococo: "#caa19b",
  Peony: "#d97a8a",
  Grenadine: "#c9304a",
  Raspberry: "#b73250",
  Barberry: "#9a2a3a",
  Jambu: "#a8324a",
  Heather: "#a8889c",
  Mauve: "#a890a0",
  Orchid: "#b888b0",
  Lilac: "#b8a4ce",
  Thistle: "#9a8aae",
  Dewberry: "#7a5a8e",
  Fig: "#5a3a4a",
  Mulberry: "#6a2a3e",
  Muscadine: "#3a1e2e",
  Grape: "#4a2a4a",
  Heron: "#6a7a8a",
  Lily: "#efe6d2",
  Flowerbud: "#e8b8c4",

  Sienna: "#a04a2a",
  Wolf: "#7a7670",
  Zinc: "#8a8d90",

  // Fallback-ish
  Fade: "#9aa0a6",
  Shell: "#e8dccb",
  Frostbite: "#cfe1e6",
};

// --- Brightening pass ----------------------------------------------------
// We want most swatches to read light & bright while keeping each color's
// original hue and (roughly) saturation. So we:
//   - lift any color below a minimum HSL lightness up to that minimum,
//   - keep neutrals neutral (don't accidentally tint greys),
//   - leave already-light colors untouched.
// Hue is preserved exactly.

// Lightness floor — high enough to lift muddy darks, low enough to keep
// vivid colors vivid (not pastel-washed).
const MIN_LIGHTNESS = 0.59;
const GREY_SAT_THRESHOLD = 0.08; // below this, treat as a true neutral

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

// Ceiling so very-light colors (whites, ivories, pale tints) still read as
// a color and not as the background.
const MAX_LIGHTNESS_CHROMATIC = 0.86;
const MAX_LIGHTNESS_NEUTRAL = 0.9;

function brighten(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < GREY_SAT_THRESHOLD) {
    // True neutral — clamp into [MIN, MAX_NEUTRAL] and strip residual tint.
    const clamped = Math.min(Math.max(l, MIN_LIGHTNESS), MAX_LIGHTNESS_NEUTRAL);
    const [nr, ng, nb] = hslToRgb(0, 0, clamped);
    return rgbToHex(nr, ng, nb);
  }
  // Chromatic: keep hue, clamp lightness into [MIN, MAX_CHROMATIC], and
  // boost saturation so the color still pops instead of going pastel/white.
  const clampedL = Math.min(Math.max(l, MIN_LIGHTNESS), MAX_LIGHTNESS_CHROMATIC);
  const boostedSat = Math.max(s, 0.7);
  const [nr, ng, nb] = hslToRgb(h, boostedSat, clampedL);
  return rgbToHex(nr, ng, nb);
}

function saturationOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b)[1];
}

function lookup(token: string): string | null {
  if (COLOR_MAP[token]) return COLOR_MAP[token];
  const first = token.split(/\s+/)[0];
  if (COLOR_MAP[first]) return COLOR_MAP[first];
  return null;
}

export function hexForSalesColor(name: string | null | undefined): string {
  if (!name) return "#cccccc";
  // Sales color names look like "Primary | Secondary | ...".
  // Resolve every token, then pick the most saturated hit so the swatch
  // reflects the color of the shoe rather than a neutral like "Black".
  const tokens = name
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
  const hits = tokens
    .map(lookup)
    .filter((h): h is string => Boolean(h))
    .map((hex) => ({ hex, sat: saturationOf(hex) }));
  if (hits.length === 0) return "#cccccc";
  hits.sort((a, b) => b.sat - a.sat);
  return brighten(hits[0].hex);
}
