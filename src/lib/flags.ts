/**
 * App-wide display flags.
 *
 * SHOW_AAS_SCORE gates *display only*. The amino-acid score is shown; the
 * limiting amino acid is never surfaced in the UI or exports, though it is
 * still computed and used internally by the safety/advisory engine.
 */
export const SHOW_AAS_SCORE = true;
