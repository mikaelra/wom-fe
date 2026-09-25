# Clothing Plan — Garment Slots, Shells & the Meshy Pipeline

Status: **not built**. This document records the measurements that make
clothing tractable, the asset pipeline, and the integration traps found while
reading the avatar code. The one piece that exists is
`scripts/generateGarmentShell.mjs` and its first output,
`public/models/garments/shell_torso_v1.glb`.

Companion to `docs/MONETIZATION_PLAN.md` — clothing is the first item type that
is *additive* rather than a replacement for what the player already owns.

---

## 1. Summary

Frog skins are mutually exclusive: buying a new one retires the old one, which
caps lifetime spend at roughly "one favourite". Clothing stacks, so purchases
compound instead of replacing, and it multiplies with the existing skin
catalogue rather than competing with it — a player who owns four skins gains a
reason to own items for each.

The blocker everyone assumes exists — fitting each garment to each of the
twelve skins — does not exist here. Section 2 shows why.

---

## 2. The base-mesh invariant

Everything below depends on one measured fact, so it is recorded with numbers
rather than asserted.

**Every frog skin is the same geometry.** Meshy's texturing pass re-UVs and
re-orders vertices on each run, which is why the `.glb` files differ
superficially, but it does not move the surface:

| Property | Result |
|---|---|
| Bounding box, all 13 files | identical: min `[-0.883, -0.949, -0.616]`, max `[0.883, 0.953, 0.616]` |
| Vertex counts | 16202–16221 (differ only by UV-seam splits) |
| UVs matching at the same index | 0% |
| **Nearest-surface distance to `frog_green_v1`** | **0.0000 for every skin** |
| Skeleton / animation | none — `skins: 0`, `animations: none`, one mesh, one primitive |

Two consequences:

1. **A garment fitted once fits every skin**, present and future, as long as
   new skins keep coming from the same base through Meshy texturing.
2. **Nothing deforms.** `Playerv1.tsx` animates only whole-object `position`,
   `rotation`, and `scale` — death is a 90° z-rotation, the attack lunge is a
   damped position move, Cherub's hover is a parent group's Y offset. There
   are no skin weights to author and no pose in which a fitted garment stops
   fitting. This is the part that is genuinely hard in a rigged game and
   absent here.

`scripts/generateGarmentShell.mjs` re-checks this invariant implicitly: its
self-check reports **identical results (4 vertices, 0.0034) against all twelve
skins**. A future skin that breaks the invariant will change that number.

### 2.1 Frog anatomy

From the radius-by-height profile of the base mesh — the landmarks any garment
band is cut against:

| y | feature |
|---|---|
| -0.92 | feet, splayed and very dense (2175+2411 verts in the bottom two bands) |
| -0.77 | ankles, local minimum (r 0.59) |
| -0.52 | haunches, widest point of the model (r 0.84) |
| -0.02 | **waist**, narrowest point of the torso (r 0.36) |
| 0.33 | **chest**, widest above the waist (r 0.69) |
| 0.44 | **neck**, the dip before the head flares out |
| 0.48+ | head |

---

## 3. Product design

### 3.1 Slots

Slot-based inventory, shipped one slot at a time:

| Slot | Clipping risk | Meshy fit |
|---|---|---|
| head (hats, crowns) | none — sits in empty space | text-to-3D, excellent |
| face (glasses, masks) | none | text-to-3D, excellent |
| neck (chains, scarves) | low | text-to-3D, good |
| back (backpacks, wings) | none | text-to-3D, good |
| torso (sweaters, jackets) | **high** — must hug the body | shell + texturing (§4.2) |

Ship head and face first. They need no new skill, no new tooling, and they
prove out the equip/slot/render path before any geometry work.

### 3.2 Wheel timing

A second wheel splits attention with the Special Wheel, and the wheel
presentation spec (`MONETIZATION_PLAN.md` §3.5) is built around a populated
slice ring — a four-prize wheel will feel thin. Hold the separate clothing
wheel until there are roughly eight items; until then sell direct or fold
items into the existing wheel.

### 3.3 Compliance

A new paid wheel inherits all of `MONETIZATION_PLAN.md` §9 — odds disclosure,
the Belgium/Netherlands gate, the minors rules — and
`LEGAL_COMPLIANCE_PLAN.md`. Not new work, but not free either.

---

## 4. Asset pipeline

### 4.1 Props (head, face, neck, back)

Generate in Meshy text-to-3D, place once with a fixed local transform. Because
every skin shares a bounding box, that transform is correct for all of them.
No modelling, no Blender.

### 4.2 Torso — the shell

A sweater modelled independently has its own proportions and will clip through
the frog however carefully it is placed. The shell inverts the problem: it is
harvested *from* the frog, so every vertex is a frog vertex pushed out along
its own (smoothed) normal, and fit is a property of the construction rather
than of anyone's eye.

```
node scripts/generateGarmentShell.mjs --preview        # pick the band
node scripts/generateGarmentShell.mjs                  # write the .glb
```

`--preview` prints a side-on ASCII silhouette with the selected band marked,
so a band can be dialled in without opening a 3D viewer.

| Flag | Default | Meaning |
|---|---|---|
| `--min-y` / `--max-y` | -0.12 / 0.45 | the band, cut against §2.1. Sweater by default; long tunic ≈ -0.35..0.45, crop top ≈ 0.05..0.45 |
| `--gap` | 0.014 | how far the inner face floats above the skin (floor 0.004) |
| `--thickness` | 0.022 | wall thickness, so the hem has a visible edge rather than reading as a decal |
| `--smooth` | 4 | Laplacian passes on the offset direction — a *look* setting (drape vs shrink-wrap), not a correctness one |

Output for the defaults: 8076 triangles, 4861 vertices, closed solid, no
material of its own.

Two notes on the committed `.glb`. It is 248 KB of uncompressed float32
attributes and uint32 indices — fine for a pipeline input, but it is not the
shipped garment, and `next build` copies all of `public/` into the export
regardless of what any code imports (see `scripts/audit-assets.mjs`). Whatever
comes back from Meshy is what needs the Draco/KTX2 treatment of §4.4, and
uint16 indices would suffice for a mesh this size. For the same reason
`audit-assets.mjs` will report this file as unreachable from `src/`; that is
correct and expected until a garment component references it.

**Then hand it to Meshy texturing — the same workflow that produces the frog
skins.** Every sweater variant is another texture run against this one shell.
No new geometry per garment, and Meshy re-UVs anyway, so the shell's own
cylindrical unwrap only needs to be sane, not beautiful.

### 4.3 What the self-check does and does not cover

The script measures penetration rather than asserting it: distance from every
emitted vertex to the nearest source *triangle*, signed by that triangle's
face normal.

Nearest-*vertex* approximations were tried first and are not good enough — they
reported 6–9 "penetrations" that stayed put or grew as the shell was pushed
further out, which a real penetration cannot do. Against triangles the honest
number at the default gap is **4 vertices grazing the body by at most 0.0034**,
about a quarter of a pixel at lobby framing, and it reaches zero by a gap of
0.10 — which looks like a barrel rather than a sweater. The script therefore
reports the depth and only fails above `VISIBLE_PENETRATION`.

It deliberately does **not** catch a too-small gap. A shell lying almost
exactly on the skin measures as "barely outside" everywhere — a gap of 0.0005
reports *fewer* penetrations than the default — while being the worst case in
practice, because the two surfaces z-fight into a shimmer. That is a separate
failure mode, guarded by the `MIN_GAP` floor instead.

### 4.4 Budget

Frog skins are ~1 MB each, almost entirely baked texture (three JPEGs:
~106 KB base colour, ~12 KB metallic-roughness, ~68 KB normal). Garments must
not follow that: attach a small extra `.glb` rather than baking clothing into
skins, or the catalogue becomes 12 × N one-megabyte files.

- Apply the existing `_draco` convention (`crown_hd_v1_draco.glb`) to garments
  from day one, and consider KTX2 for their textures. Nothing in
  `public/models/frogs/` looks compressed today.
- A lobby can hold several players wearing several items each. Keep garment
  triangle counts near the shell's ~8k, not the frog's 22.6k.

---

## 5. Frontend integration

### 5.1 Where a garment attaches

`PlayerWithName` (`src/components/lobby/PlayerAvatars.tsx`) already renders the
avatar inside one `<group>` carrying position, rotation, and the click/hover
handlers, with `PlayerModelLayer` inside it. A garment is a sibling
`<primitive>` in that same group, so it inherits every transform — including
the death tip and the Cherub hover — with no extra bookkeeping.

### 5.2 Traps found while reading the code

**Dead players will look wrong.** The `isDead` effect in `Playerv1.tsx`
traverses `sceneClone` to clone each material, set `opacity 0.3`, and blend 50%
grey via `onBeforeCompile`. A garment parented as a sibling is *not* in that
traversal, so a ghosted frog would wear a fully opaque sweater. Factor that
material treatment out of `PlayerV1` rather than duplicating it.

**Render order.** `PlayerV1` sets `renderOrder = 10` on every frog mesh. A
shell sitting just above the surface needs a matching or higher value, or the
transparent dead-state sorting will fight.

**Double-sidedness.** The frog material is `doubleSided: true`; the generated
shell is a closed solid and is written single-sided deliberately. Keep it that
way — it halves the fill cost and a closed shell never needs backfaces.

**Surfaces that render a skin.** Anything showing a dressed frog needs the same
composition, not just the lobby: `SpinningModelViewer` is used by
`app/inventory/page.tsx`, `app/shop/page.tsx`, `TradeUpModal.tsx`, and
`WheelSpinModal.tsx`, and `scripts/renderSkinThumbnails.mjs` bakes the
inventory thumbnails. Prefer one component that composes skin + equipped items
over teaching five call sites the same rule — the same reasoning that put
`skinUrl()` in `lib/frogSkins.ts`.

### 5.3 Guardrail

Add a bounding-box assertion over `public/models/frogs/*.glb` (natural home:
`scripts/audit-assets.mjs`). The entire fitting scheme rests on the §2
invariant, and a future Meshy export that breaks it would misplace every
garment at once with no obvious cause.

---

## 6. Sequencing

1. **Head and face props.** Meshy text-to-3D, fixed transforms. No new skills.
   Proves the slot/equip/render path end to end.
2. **Slot data model.** Items table + slot field, mirroring how
   `lib/frogSkins.ts` handles skins. Extend `renderSkinThumbnails.mjs` for item
   cards.
3. **Dead-state refactor.** Lift the `isDead` material treatment out of
   `PlayerV1` (§5.2) before there is more than one thing to fade.
4. **Torso.** Ship `shell_torso_v1.glb` through Meshy texturing; each sweater
   is one texture run.
5. **Clothing wheel**, once the catalogue justifies a populated ring (§3.2).
6. **Hero geometry** — hoods, capes, puffers, where silhouette *is* the
   product. Real modelling; outsource or defer indefinitely.
