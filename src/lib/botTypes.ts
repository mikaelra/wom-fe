// Kept in sync by hand with wom-be's config.BOT_TYPES/BOT_DISPLAY_NAMES --
// this is the menu of choices offered *before* a bot exists, so unlike an
// existing player's bot_type (now on the wire, see PlayerAvatars.tsx's
// BOT_MODEL_URLS), there's no live state to derive it from at runtime.
//
// The empty-string entry isn't a real bot_type -- sockets/lobby.py's
// handle_add_dummy falls back to its own random pick for anything that
// doesn't name one of BOT_TYPES, which this deliberately relies on rather
// than duplicating the random choice here.
export const RANDOM_BOT_TYPE = '';
export const BOT_TYPES: { type: string; label: string }[] = [
  { type: 'TURTLE', label: 'Turtle' },
  { type: 'SHEEP', label: 'Sheep' },
  { type: 'WOLF', label: 'Wolf' },
  { type: 'OWL', label: 'Owl' },
  { type: RANDOM_BOT_TYPE, label: 'Random' },
];
