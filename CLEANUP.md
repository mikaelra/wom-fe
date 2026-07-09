# CLEANUP CODE

This markdown is a temporary file to track things that needs cleanup in this project.
After it is used through a bot with claude, claude will end the file with a list of things to cleanup in the frontend. This file will then be put in the frontend folder. I will then manually go through the frontend code and add things to this document for claude to cleanup in that folder. Then I will use claude again to cleanup the front-end.

## Backend cleanup — done (branch `cleanup`)

1. **Gremlin and Ragnaros** — removed. All gremlin/ragnaros config, game-state factories, boss AI, socket branching, the `create_gremlin_lobby` endpoint, and tests are gone.
2. **Mentions of "raid"** — deferred on purpose. "Raid" is wired end-to-end into the frontend (`action: 'raid'`, `state.raidwinner`, `raid_wins`), so renaming it backend-only would break gameplay. Do this together with the frontend pass below, including a DB migration for the `raid_wins` columns on `players` and `game_player_stats`.
3. **`get_city_chat` endpoint** — removed, along with `send_city_message`, `join_city`, and `city_message` socket events and the `city_chats` in-memory store. (No frontend code referenced these — nothing to clean up there.)
4. **Leaderboards endpoint** — removed (`routes/leaderboards.py` and its registration).
5. **`templates/docs.html`** — rewritten to match the current Socket.IO-based architecture, "Tjuvpakk" branding fixed to "World of Mythos", stale gremlin/city-chat/leaderboards docs removed.

## Frontend cleanup — for the next pass

1. **Gremlin feature** — done (branch `cleanup`). Removed the route (`src/app/gremlin/[lobbyId]/page.tsx`), the components (`src/components/gremlin/`), `createGremlinLobby()` from `src/lib/api.ts`, the Gremlin popup state/handlers/UI in `src/app/page.tsx`, `GremlinPinFigure`/`isGremlin` marker handling in `src/components/worldmap/CityMarker.tsx`, the `isGremlin`/`gremlin`/`gremlin_fight` fields in `src/lib/cities.ts` and `src/types/game.ts`, gremlin filters in `src/components/lobby/LobbyScene.tsx`/`src/lib/frogSkins.ts`, stale gremlin comments in `src/components/SceneOverlay.tsx`/`src/components/Playerv1.tsx`/`src/lib/useStagedResources.ts`, and the `public/models/gremlinv01.glb` asset. Verified with `eslint`, `tsc --noEmit` (no new errors vs. before), and a full `next build` (compiled successfully).

2. **Leaderboards page** — backend `/leaderboards` endpoint is gone.
   - Remove `src/app/leaderboards/page.tsx`
   - Remove links/nav entries pointing at it in `src/components/home/HomeOverlay.tsx` and `src/app/page.tsx`
   - Check `src/lib/cities.ts` for any leaderboard-related references

3. **"Raid" → "Well" rename** — do this together with the matching backend change (see backend item 2 above); renaming only one side breaks gameplay.
   - `src/types/game.ts` — `raidwinner` field
   - `src/components/SceneOverlay.tsx`, `src/components/lobby/LobbyOverlay.tsx`, `src/components/lobby/LobbyScene.tsx` — `state.raidwinner`, `action: 'raid'` submissions, `currentAction === 'raid'` styling
   - `src/lib/useStagedResources.ts` — `state.raidwinner` reward-timing logic
   - `src/components/worldmap/WorldMap.tsx`, `src/app/vault/page.tsx`, `src/app/page.tsx`, `src/components/home/HomeOverlay.tsx` — check for "raid" copy/labels
   - (The leaderboards page also references `raid_wins`, but it's being removed entirely per item 2 above)
   - Backend side: `VALID_ACTIONS`, `raidwinner` lobby field, `raid_wins` columns on `players`/`game_player_stats` (needs an Alembic migration), `engine/phases/well.py`, `engine/phases/attacks.py`, `sockets/utils.py`, `helpers.py`, `engine/combat.py`, `routes/bossfight.py`, `routes/auth.py`
