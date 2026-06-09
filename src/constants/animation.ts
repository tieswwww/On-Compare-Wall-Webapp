/**
 * Motion timings for the compare wall (milliseconds).
 *
 * Centralised so the wall's "motion language" — staggered panel drops, fades,
 * and the brief holds that let things animate *out* before they're cleared —
 * stays consistent and easy to tune. See docs/WEBAPP-HANDOVER.md §1.
 */

// ── Top quadrant (video + name) ──
/** Wait this long after a video's src is set before fading it in (lets it
 *  start buffering, so we don't fade in to a black frame). */
export const VIDEO_REVEAL_DELAY_MS = 250;
/** Keep the <video> mounted this long after removal so it can fade out. */
export const VIDEO_CLEAR_DELAY_MS = 600;
/** Name + tech opacity/blur fade. */
export const NAME_FADE_MS = 400;

// ── Shared ──
/** Keep rendering a just-removed shoe this long so the close animation can
 *  play before its content is cleared. Used by both quadrants. */
export const SHOE_HOLD_MS = 1200;

// ── Bottom quadrant (two-stage colour drape + black panel) ──
/** Duration of each panel's clip-path reveal. */
export const BOTTOM_STAGE_MS = 700;
/** Offset between the colour drape and the black panel (the stagger). */
export const BOTTOM_STAGGER_MS = 150;
/** Colour-drape background-colour crossfade when the sales colour changes. */
export const COLOR_DRAPE_FADE_MS = 300;

// ── Key look overlay (single-shoe lookbook image) ──
/** Reveal delay when the key look appears because a shoe was REMOVED — waits
 *  for the compare→single transition to settle first. */
export const KEYLOOK_DELAY_AFTER_REMOVAL_MS = 1400;
/** Reveal delay on a fresh first scan (near-immediate). */
export const KEYLOOK_DELAY_FRESH_MS = 300;
/** Keep the overlay mounted this long after it should hide, so it fades out. */
export const KEYLOOK_CLEAR_MS = 1000;
/** Opacity/transform + brightness transition duration. */
export const KEYLOOK_TRANSITION_MS = 1000;
