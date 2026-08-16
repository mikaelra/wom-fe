#!/usr/bin/env node
/**
 * Generates a garment "shell" -- a wearable body-hugging mesh harvested from
 * the frog's own surface -- for docs/CLOTHING_PLAN.md.
 *
 * The problem this solves: a sweater modelled independently (in Meshy or
 * anywhere else) has its own proportions and will clip through the frog no
 * matter how carefully it's placed. A shell can't, because every one of its
 * vertices *is* a frog vertex pushed out along its own normal. Fit is exact
 * by construction rather than by eye.
 *
 * It works across the whole skin catalogue because every frog shares one
 * base mesh: measured nearest-surface distance from frog_gold/bling/red/
 * rainbow to frog_green is 0.0000 everywhere. Meshy's texturing pass re-UVs
 * and re-orders vertices on each run (which is why the .glb files differ in
 * vertex count by a handful and share no UVs), but it does not move the
 * surface. One shell therefore fits every existing skin and every future
 * re-texture of the same base -- see scripts/verifyFrogBaseMesh.mjs, which
 * re-checks that invariant.
 *
 * The output is deliberately untextured: it goes to Meshy's texturing mode,
 * the same workflow that produces the frog skins themselves, and that pass
 * generates its own UVs and materials. Every sweater variant is then another
 * texture run against this one shell -- no new geometry per garment.
 *
 *   node scripts/generateGarmentShell.mjs --preview
 *   node scripts/generateGarmentShell.mjs --min-y -0.35 --max-y 0.42
 *
 * --preview prints a side-on silhouette of the frog with the selected band
 * highlighted and writes nothing, so the band can be dialled in without
 * opening a 3D viewer. Drop it to write the .glb.
 *
 * Node builtins only -- no Blender, no three.js, no npm dependency. The GLB
 * reader/writer here handles exactly the subset the frog models use
 * (single mesh, single primitive, indexed triangles, float attributes).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT = 5125;
const MODE_TRIANGLES = 4;

// Penetration depth (in model units) below which poke-through cannot be seen.
// Avatars render at scale 0.6, so this is 0.006 world units on a frog that
// stands about 1.14 units tall -- well under a pixel at lobby framing. A few
// vertices grazing the surface by less than this is not worth inflating the
// gap for; the garment would visibly float instead.
const VISIBLE_PENETRATION = 0.01;

// Minimum workable --gap. The penetration check above deliberately does not
// catch a too-small gap: a shell lying almost exactly on the skin measures as
// "barely outside" everywhere (gap 0.0005 reports fewer penetrations than the
// default does), yet it is the worst case in practice, because the two
// surfaces then z-fight into a shimmering mess at any distance. Penetration
// and z-fighting are separate failures; this floor guards the second one.
const MIN_GAP = 0.004;

const DEFAULTS = {
  source: 'public/models/frogs/frog_green_v1.glb',
  out: 'public/models/garments/shell_torso_v1.glb',
  // A sweater band on the frog's Y axis. Landmarks on the base mesh, from
  // its radius-by-height profile (the model spans -0.949..0.953):
  //
  //     -0.92  feet, splayed and very dense
  //     -0.77  ankles (local minimum, r 0.59)
  //     -0.52  haunches, widest point of the model (r 0.84)
  //     -0.02  waist, narrowest point of the torso (r 0.36)
  //      0.33  chest, widest point above the waist (r 0.69)
  //      0.44  neck (dip before the head flares out again)
  //      0.48+ head
  //
  // Default is a sweater: hem just below the waist so it can't ride up,
  // collar at the neck. A long tunic is roughly -0.35..0.45, a crop top
  // 0.05..0.45. Confirm any new band with --preview first.
  minY: -0.12,
  maxY: 0.45,
  // How far the inner face floats above the skin. Big enough to clear the
  // base mesh's surface detail and to avoid z-fighting at lobby distance,
  // small enough to still read as worn rather than hovering. Measured on
  // frog_green_v1, this leaves 4 vertices grazing the body by at most 0.0034
  // -- a quarter of a pixel on screen, and far below VISIBLE_PENETRATION.
  // Driving that to a true zero needs a gap around 0.10, which looks like a
  // barrel rather than a sweater; this is the right trade.
  gap: 0.014,
  // Wall thickness, so the hem/neckline has a visible edge instead of
  // looking like a decal.
  thickness: 0.022,
  // Laplacian passes over the offset direction field. This is a look
  // setting, not a correctness one: it makes the garment drape over the
  // frog's surface detail instead of reproducing every bump of it. It barely
  // affects clipping (28 penetrations at 4 passes vs 30 at 20, with gap
  // 0.006) -- raise --gap for that, not this.
  smooth: 4,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS, preview: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = () => Number(argv[++i]);
    if (a === '--preview') opts.preview = true;
    else if (a === '--source') opts.source = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--min-y') opts.minY = num();
    else if (a === '--max-y') opts.maxY = num();
    else if (a === '--gap') opts.gap = num();
    else if (a === '--thickness') opts.thickness = num();
    else if (a === '--smooth') opts.smooth = num();
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  if (opts.minY >= opts.maxY) {
    console.error('--min-y must be below --max-y');
    process.exit(1);
  }
  if (opts.gap < MIN_GAP) {
    console.error(`--gap must be at least ${MIN_GAP} or the shell z-fights with the skin`);
    process.exit(1);
  }
  return opts;
}

// ---------------------------------------------------------------- GLB input

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} is not a .glb`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    else if (type === CHUNK_BIN) bin = body;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error(`${path} is missing a JSON or BIN chunk`);
  return { json, bin };
}

const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const comps = TYPE_COMPONENTS[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out =
    accessor.componentType === COMPONENT_FLOAT
      ? new Float32Array(accessor.count * comps)
      : new Uint32Array(accessor.count * comps);
  for (let i = 0; i < out.length; i++) {
    out[i] =
      accessor.componentType === COMPONENT_FLOAT
        ? bin.readFloatLE(start + i * 4)
        : accessor.componentType === COMPONENT_UINT
          ? bin.readUInt32LE(start + i * 4)
          : bin.readUInt16LE(start + i * 2);
  }
  return out;
}

function loadMesh(path) {
  const { json, bin } = readGlb(path);
  const prim = json.meshes[0].primitives[0];
  if (prim.mode !== undefined && prim.mode !== MODE_TRIANGLES) {
    throw new Error('Only triangle primitives are supported');
  }
  return {
    position: readAccessor(json, bin, prim.attributes.POSITION),
    normal: readAccessor(json, bin, prim.attributes.NORMAL),
    index: readAccessor(json, bin, prim.indices),
  };
}

// ------------------------------------------------------------------ welding

/**
 * Meshy splits vertices along UV seams, so the raw arrays contain several
 * entries per physical point (~16.2k stored for ~11.3k real ones). Every
 * topological step below -- boundary detection above all -- has to run on
 * welded points, or each UV seam reads as a hole in the surface and the
 * generated shell grows a rim straight through the middle of itself.
 */
function weld(position, normal) {
  const key = (i) =>
    `${Math.round(position[i * 3] * 1e5)},${Math.round(position[i * 3 + 1] * 1e5)},${Math.round(position[i * 3 + 2] * 1e5)}`;
  const lookup = new Map();
  const remap = new Uint32Array(position.length / 3);
  const points = [];
  const normals = [];
  for (let i = 0; i < position.length / 3; i++) {
    const k = key(i);
    let target = lookup.get(k);
    if (target === undefined) {
      target = points.length / 3;
      lookup.set(k, target);
      points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
      normals.push(0, 0, 0);
    }
    remap[i] = target;
    // Accumulate the split copies' normals; they agree on a smooth-shaded
    // model, but averaging costs nothing and survives a re-export that
    // splits on anything other than UVs.
    normals[target * 3] += normal[i * 3];
    normals[target * 3 + 1] += normal[i * 3 + 1];
    normals[target * 3 + 2] += normal[i * 3 + 2];
  }
  const weldedNormal = new Float32Array(normals.length);
  for (let i = 0; i < normals.length / 3; i++) {
    const x = normals[i * 3];
    const y = normals[i * 3 + 1];
    const z = normals[i * 3 + 2];
    const len = Math.hypot(x, y, z) || 1;
    weldedNormal[i * 3] = x / len;
    weldedNormal[i * 3 + 1] = y / len;
    weldedNormal[i * 3 + 2] = z / len;
  }
  return { point: new Float32Array(points), normal: weldedNormal, remap };
}

/**
 * Smooths the direction field the offset follows, so the shell drapes over
 * the frog's surface detail instead of reproducing every bump of it. The gap
 * stops being perfectly uniform -- slightly tighter in hollows, looser over
 * peaks -- which is what fabric actually does.
 *
 * This is a look setting only. It was originally added to fix vertices
 * landing inside the body, on the theory that offsetting along raw normals
 * self-intersects in creases; measuring it showed that was wrong. Smoothing
 * changes the penetration count by one or two either way, while the gap moves
 * it from 28 to zero. See DEFAULTS.gap.
 */
function smoothDirections(point, normal, triangles, iterations) {
  const neighbours = Array.from({ length: point.length / 3 }, () => new Set());
  for (const [a, b, c] of triangles) {
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  let current = Float32Array.from(normal);
  for (let pass = 0; pass < iterations; pass++) {
    const next = new Float32Array(current.length);
    for (let i = 0; i < point.length / 3; i++) {
      let x = current[i * 3];
      let y = current[i * 3 + 1];
      let z = current[i * 3 + 2];
      for (const j of neighbours[i]) {
        x += current[j * 3];
        y += current[j * 3 + 1];
        z += current[j * 3 + 2];
      }
      const len = Math.hypot(x, y, z) || 1;
      next[i * 3] = x / len;
      next[i * 3 + 1] = y / len;
      next[i * 3 + 2] = z / len;
    }
    current = next;
  }
  return current;
}

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection). */
function closestOnTriangle(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a);
  const ac = sub(c, a);
  const d1 = dot(ab, sub(p, a));
  const d2 = dot(ac, sub(p, a));
  if (d1 <= 0 && d2 <= 0) return a;
  const d3 = dot(ab, sub(p, b));
  const d4 = dot(ac, sub(p, b));
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
  }
  const d5 = dot(ab, sub(p, c));
  const d6 = dot(ac, sub(p, c));
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

/**
 * Self-check: how deeply, if at all, the emitted shell pokes back through the
 * body. The premise of a shell is that it doesn't clip, so the script
 * measures that rather than asserting it.
 *
 * This measures distance to the nearest source *triangle*, signed by that
 * triangle's face normal. Nearest-vertex approximations are not good enough
 * here: they reported 6 to 9 "penetrations" that stayed put or grew as the
 * shell was pushed further out, which a real penetration cannot do. Against
 * triangles the count falls to 4 at the default gap and reaches 0 by 0.10.
 */
function measurePenetration(shellPositions, sourcePosition, sourceIndex) {
  const CELL = 0.08;
  const triangleCount = sourceIndex.length / 3;
  const corner = (t, k) => {
    const v = sourceIndex[t * 3 + k];
    return [sourcePosition[v * 3], sourcePosition[v * 3 + 1], sourcePosition[v * 3 + 2]];
  };
  const grid = new Map();
  for (let t = 0; t < triangleCount; t++) {
    const [a, b, c] = [corner(t, 0), corner(t, 1), corner(t, 2)];
    const key = `${Math.floor((a[0] + b[0] + c[0]) / 3 / CELL)},${Math.floor((a[1] + b[1] + c[1]) / 3 / CELL)},${Math.floor((a[2] + b[2] + c[2]) / 3 / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(t);
  }
  let inside = 0;
  let worst = 0;
  for (let i = 0; i < shellPositions.length; i += 3) {
    const p = [shellPositions[i], shellPositions[i + 1], shellPositions[i + 2]];
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    const cz = Math.floor(p[2] / CELL);
    let best = Infinity;
    let bestTri = -1;
    let bestPoint = null;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (const t of bucket) {
            const q = closestOnTriangle(p, corner(t, 0), corner(t, 1), corner(t, 2));
            const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
            if (d < best) {
              best = d;
              bestTri = t;
              bestPoint = q;
            }
          }
        }
      }
    }
    if (bestTri < 0) continue;
    const a = corner(bestTri, 0);
    const b = corner(bestTri, 1);
    const c = corner(bestTri, 2);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const away = [p[0] - bestPoint[0], p[1] - bestPoint[1], p[2] - bestPoint[2]];
    if (away[0] * n[0] + away[1] * n[1] + away[2] * n[2] < 0) {
      inside++;
      worst = Math.max(worst, Math.sqrt(best));
    }
  }
  return { inside, worst };
}

// --------------------------------------------------------------- silhouette

/** Side-on ASCII view, so a band can be chosen without a 3D viewer. */
function silhouette(point, minY, maxY) {
  const COLS = 64;
  const ROWS = 30;
  let lo = Infinity;
  let hi = -Infinity;
  let xLo = Infinity;
  let xHi = -Infinity;
  for (let i = 0; i < point.length / 3; i++) {
    lo = Math.min(lo, point[i * 3 + 1]);
    hi = Math.max(hi, point[i * 3 + 1]);
    xLo = Math.min(xLo, point[i * 3]);
    xHi = Math.max(xHi, point[i * 3]);
  }
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  for (let i = 0; i < point.length / 3; i++) {
    const col = Math.min(COLS - 1, Math.floor(((point[i * 3] - xLo) / (xHi - xLo)) * COLS));
    const row = Math.min(ROWS - 1, Math.floor(((hi - point[i * 3 + 1]) / (hi - lo)) * ROWS));
    grid[row][col] = true;
  }
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    const y = hi - ((r + 0.5) / ROWS) * (hi - lo);
    const inBand = y >= minY && y <= maxY;
    const body = grid[r].map((on) => (on ? (inBand ? '#' : '.') : ' ')).join('');
    lines.push(`${y.toFixed(2).padStart(6)} ${inBand ? '|' : ' '}${body}`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------ shell builder

/**
 * Selects the triangles inside the band and solidifies them: an outer face
 * offset by gap+thickness, an inner face offset by gap with reversed winding,
 * and a rim of quads stitching the two along the boundary. The result is a
 * closed solid, so it renders correctly single-sided and reads as a garment
 * with real thickness rather than a sticker on the skin.
 */
function buildShell(mesh, opts) {
  const welded = weld(mesh.position, mesh.normal);
  const { point, remap } = welded;

  const allTris = [];
  for (let i = 0; i < mesh.index.length; i += 3) {
    const a = remap[mesh.index[i]];
    const b = remap[mesh.index[i + 1]];
    const c = remap[mesh.index[i + 2]];
    if (a === b || b === c || a === c) continue; // degenerate after welding
    allTris.push([a, b, c]);
  }

  // Smooth over the whole mesh, not just the band, so vertices at the hem and
  // collar are still influenced by the body continuing past them.
  const normal = smoothDirections(point, welded.normal, allTris, opts.smooth);

  const tris = allTris.filter(([a, b, c]) => {
    const midY = (point[a * 3 + 1] + point[b * 3 + 1] + point[c * 3 + 1]) / 3;
    return midY >= opts.minY && midY <= opts.maxY;
  });
  if (tris.length === 0) throw new Error('No triangles fall inside the band; widen --min-y/--max-y');

  // Boundary = a directed edge whose opposite is not also used. Correct only
  // because we welded first.
  const directed = new Set();
  for (const [a, b, c] of tris) {
    directed.add(`${a},${b}`);
    directed.add(`${b},${c}`);
    directed.add(`${c},${a}`);
  }
  const boundary = [];
  for (const edge of directed) {
    const [a, b] = edge.split(',').map(Number);
    if (!directed.has(`${b},${a}`)) boundary.push([a, b]);
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Cylindrical UVs around Y. Meshy re-UVs during texturing anyway, but a
  // sane layout keeps the shell paintable by hand and previewable as-is.
  const uvFor = (x, y, z) => [
    Math.atan2(x, z) / (Math.PI * 2) + 0.5,
    (y - opts.minY) / (opts.maxY - opts.minY),
  ];

  const pushVertex = (px, py, pz, nx, ny, nz) => {
    const [u, v] = uvFor(px, py, pz);
    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };

  // Shell surfaces share one vertex per welded point per side, so the offset
  // faces stay smooth-shaded.
  const outerOf = new Map();
  const innerOf = new Map();
  const surfaceVertex = (cache, welded_, distance, flip) => {
    let existing = cache.get(welded_);
    if (existing !== undefined) return existing;
    const nx = normal[welded_ * 3];
    const ny = normal[welded_ * 3 + 1];
    const nz = normal[welded_ * 3 + 2];
    existing = pushVertex(
      point[welded_ * 3] + nx * distance,
      point[welded_ * 3 + 1] + ny * distance,
      point[welded_ * 3 + 2] + nz * distance,
      flip ? -nx : nx,
      flip ? -ny : ny,
      flip ? -nz : nz,
    );
    cache.set(welded_, existing);
    return existing;
  };

  const outerDist = opts.gap + opts.thickness;
  for (const [a, b, c] of tris) {
    indices.push(
      surfaceVertex(outerOf, a, outerDist, false),
      surfaceVertex(outerOf, b, outerDist, false),
      surfaceVertex(outerOf, c, outerDist, false),
    );
    // Reversed winding so the inside face points inward.
    indices.push(
      surfaceVertex(innerOf, c, opts.gap, true),
      surfaceVertex(innerOf, b, opts.gap, true),
      surfaceVertex(innerOf, a, opts.gap, true),
    );
  }

  // Rim gets its own vertices with a flat face normal, giving the hem a crisp
  // edge instead of a smeared continuation of the body shading.
  const at = (welded_, distance) => {
    const nx = normal[welded_ * 3];
    const ny = normal[welded_ * 3 + 1];
    const nz = normal[welded_ * 3 + 2];
    return [
      point[welded_ * 3] + nx * distance,
      point[welded_ * 3 + 1] + ny * distance,
      point[welded_ * 3 + 2] + nz * distance,
    ];
  };
  for (const [a, b] of boundary) {
    const oa = at(a, outerDist);
    const ob = at(b, outerDist);
    const ia = at(a, opts.gap);
    const ib = at(b, opts.gap);
    // Outward rim normal: (inner->outer) x (a->b), which points away from the
    // hem rather than back into the body.
    const e1 = [ia[0] - oa[0], ia[1] - oa[1], ia[2] - oa[2]];
    const e2 = [ib[0] - oa[0], ib[1] - oa[1], ib[2] - oa[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    const fn = [nx / len, ny / len, nz / len];
    const vOA = pushVertex(...oa, ...fn);
    const vIA = pushVertex(...ia, ...fn);
    const vIB = pushVertex(...ib, ...fn);
    const vOB = pushVertex(...ob, ...fn);
    indices.push(vOA, vIA, vIB);
    indices.push(vOA, vIB, vOB);
  }

  fixSeamUvs(positions, normals, uvs, indices);

  const out = new Float32Array(positions);
  return {
    positions: out,
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    stats: {
      selected: tris.length,
      boundary: boundary.length,
      ...measurePenetration(out, mesh.position, mesh.index),
    },
  };
}

/**
 * A cylindrical unwrap wraps from u≈1 back to u≈0 behind the model; any
 * triangle straddling that line would otherwise stretch a copy of the whole
 * texture across itself. Duplicate just those triangles' low-u corners at
 * u+1 (the sampler repeats, so the texture still lines up).
 */
function fixSeamUvs(positions, normals, uvs, indices) {
  const shifted = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    const us = tri.map((v) => uvs[v * 2]);
    if (Math.max(...us) - Math.min(...us) <= 0.5) continue;
    for (let k = 0; k < 3; k++) {
      if (us[k] >= 0.5) continue;
      const original = tri[k];
      let duplicate = shifted.get(original);
      if (duplicate === undefined) {
        duplicate = positions.length / 3;
        // All three attribute arrays have to grow together -- an earlier
        // version appended only positions/uvs, which silently truncated the
        // normal accessor and left the tail of the mesh unlit.
        positions.push(
          positions[original * 3],
          positions[original * 3 + 1],
          positions[original * 3 + 2],
        );
        normals.push(
          normals[original * 3],
          normals[original * 3 + 1],
          normals[original * 3 + 2],
        );
        uvs.push(uvs[original * 2] + 1, uvs[original * 2 + 1]);
        shifted.set(original, duplicate);
      }
      indices[i + k] = duplicate;
    }
  }
  return shifted.size;
}

// --------------------------------------------------------------- GLB output

function align4(n) {
  return (n + 3) & ~3;
}

function writeGlb(path, shell) {
  const { positions, normals, uvs, indices } = shell;
  const parts = [
    { data: Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength) },
    { data: Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength) },
    { data: Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength) },
    { data: Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength) },
  ];
  let offset = 0;
  const views = parts.map(({ data }) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: data.length };
    offset = align4(offset + data.length);
    return view;
  });
  const bin = Buffer.alloc(offset);
  parts.forEach(({ data }, i) => data.copy(bin, views[i].byteOffset));

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }

  const count = positions.length / 3;
  const gltf = {
    asset: { version: '2.0', generator: 'wom-fe scripts/generateGarmentShell.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'GarmentShell' }],
    meshes: [
      {
        name: 'GarmentShell',
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
        ],
      },
    ],
    materials: [
      {
        name: 'GarmentShellBase',
        pbrMetallicRoughness: {
          baseColorFactor: [0.82, 0.82, 0.85, 1],
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: false,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: COMPONENT_FLOAT, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: COMPONENT_FLOAT, count, type: 'VEC3' },
      { bufferView: 2, componentType: COMPONENT_FLOAT, count, type: 'VEC2' },
      { bufferView: 3, componentType: COMPONENT_UINT, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = Buffer.alloc(align4(jsonBuf.length) - jsonBuf.length, 0x20);
  const json = Buffer.concat([jsonBuf, jsonPad]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (data, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, chunk(json, CHUNK_JSON), chunk(bin, CHUNK_BIN)]));
}

// ---------------------------------------------------------------------- run

const opts = parseArgs(process.argv.slice(2));
const mesh = loadMesh(opts.source);

if (opts.preview) {
  const { point } = weld(mesh.position, mesh.normal);
  console.log(`\n${opts.source} -- band ${opts.minY} .. ${opts.maxY} marked '#'\n`);
  console.log(silhouette(point, opts.minY, opts.maxY));
  console.log('\nRe-run without --preview to write the shell.\n');
  process.exit(0);
}

const shell = buildShell(mesh, opts);
writeGlb(opts.out, shell);
const { inside, worst } = shell.stats;
console.log(
  `${opts.out}\n` +
    `  band        ${opts.minY} .. ${opts.maxY}\n` +
    `  gap/thick   ${opts.gap} / ${opts.thickness} (smooth ${opts.smooth})\n` +
    `  triangles   ${shell.indices.length / 3} (from ${shell.stats.selected} selected, ` +
    `${shell.stats.boundary} boundary edges)\n` +
    `  vertices    ${shell.positions.length / 3}\n` +
    `  clipping    ${
      inside === 0
        ? 'none -- every vertex sits outside the body'
        : `${inside} vertices inside by up to ${worst.toFixed(4)}` +
          `${worst < VISIBLE_PENETRATION ? ' (below the visible threshold)' : ' -- RAISE --gap'}`
    }\n` +
    `  next        upload to Meshy texturing, same as the frog base`,
);
if (worst >= VISIBLE_PENETRATION) process.exitCode = 1;
