#!/usr/bin/env python3
"""Blimkin in 3D (Mikael, 2026-10-17): a short, fat banana standing on end with
a spike at its tip -- the 8-bit thumbnail's Blimkin (scripts/pixel-thumbnails.py
blimkin()) as a model. Written as a .glb with vertex colours, no textures:

    python3 scripts/make-blimkin-model.py public/models/blimkin_v1.glb

Yellow banana, amber underside, a curved spike, two red eyes in black sockets
looking to his right, a flat black mouth, arms hanging out from the sides and
two thin legs. Faces +z. numpy only. A first try, to refine.
"""
import json
import math
import struct
import sys

import numpy as np

YELLOW, AMBER, INK, RED = (1.0, 0.82, 0.08), (0.88, 0.65, 0.0), (0.04, 0.03, 0.01), (0.9, 0.12, 0.16)


def lin(c):  # sRGB-ish tuple to linear for glTF vertex colours
    return tuple(x**2.2 for x in c)


class Mesh:
    def __init__(self):
        self.v, self.n, self.c, self.f = [], [], [], []

    def add(self, verts, faces, colors, flat=False):
        verts = np.asarray(verts, float)
        faces = np.asarray(faces, int)
        norm = np.zeros_like(verts)
        for a, b, c in faces:
            fn = np.cross(verts[b] - verts[a], verts[c] - verts[a])
            norm[[a, b, c]] += fn
        norm /= np.linalg.norm(norm, axis=1, keepdims=True) + 1e-12
        base = len(self.v)
        self.v += verts.tolist()
        self.n += norm.tolist()
        self.c += [lin(c) for c in colors]
        self.f += (faces + base).tolist()


def tube(mesh, pts, radii, color_fn, segs=28, cap_start=True, cap_end=True):
    """A tube along a 3D polyline; radii[i] = (rx, rz) of the ring at pts[i]."""
    pts = np.asarray(pts, float)
    rings, cols = [], []
    for i, p in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        ref = np.array([0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        u = np.cross(t, ref); u /= np.linalg.norm(u)
        w = np.cross(t, u); w /= np.linalg.norm(w)
        rx, rz = radii[i]
        ring = [p + rx * math.cos(a) * u + rz * math.sin(a) * w for a in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
        rings.append(ring)
        cols.append([color_fn(q) for q in ring])
    verts, colors, faces = [], [], []
    for ring, col in zip(rings, cols):
        verts += ring; colors += col
    for i in range(len(rings) - 1):
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            c, d = (i + 1) * segs + k, (i + 1) * segs + (k + 1) % segs
            faces += [[a, c, b], [b, c, d]]
    for flag, i, flip in ((cap_start, 0, True), (cap_end, len(rings) - 1, False)):
        if not flag:
            continue
        centre = len(verts)
        verts.append(pts[i]); colors.append(color_fn(pts[i]))
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            faces.append([centre, b, a] if flip else [centre, a, b])
    mesh.add(verts, faces, colors)


def box(mesh, centre, size, color):
    cx, cy, cz = centre
    sx, sy, sz = (s / 2 for s in size)
    faces_def = [  # normal axis, direction
        ((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),
        ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
        ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]),
        ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
        ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
        ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ]
    verts, faces = [], []
    for _, corners in faces_def:
        i = len(verts)
        verts += [(cx + x * sx, cy + y * sy, cz + z * sz) for x, y, z in corners]
        faces += [[i, i + 1, i + 2], [i, i + 2, i + 3]]
    mesh.add(verts, faces, [color] * len(verts))


# --- the shape, in metres-ish: the banana is 1.0 tall, standing on legs 0.3 long ---
BASE_Y, HEIGHT = 0.30, 1.0


def centre(t):
    return 0.0 + 0.42 * (t - 0.56) - 0.12 * math.sin(math.pi * t) + 0.06, BASE_Y + HEIGHT * t


def radius(t):
    return 0.07 + 0.36 * math.sin(math.pi * (0.03 + 0.94 * t)) ** 0.7


def build():
    m = Mesh()
    ts = np.linspace(0, 1, 44)
    body_pts = [(*centre(t), 0.0) for t in ts]
    body_r = [(radius(t), radius(t) * 0.86) for t in ts]
    underside = BASE_Y + HEIGHT * 0.34
    tube(m, body_pts, body_r, lambda q: AMBER if q[1] < underside else YELLOW)
    # the spike at the tip: a tapering tube curving up and to his right
    tip = np.array([*centre(0.96), 0.0])
    sp = [tip + np.array([0.12 * s**1.5, 0.64 * s, 0.0]) for s in np.linspace(0, 1, 18)]
    tube(m, sp, [(0.20 * (1 - s) ** 0.8 + 0.004, 0.18 * (1 - s) ** 0.8 + 0.004) for s in np.linspace(0, 1, 18)],
         lambda q: YELLOW, segs=20, cap_start=False)
    # the face, at t = 0.56: eyes, looking to his right, and the mouth
    cx, cy = centre(0.56)
    rz = radius(0.56) * 0.86
    for dx in (-0.17, 0.17):
        box(m, (cx + dx, cy + 0.08, rz * 0.93), (0.19, 0.19, 0.10), INK)
        box(m, (cx + dx + 0.035, cy + 0.08, rz * 0.93 + 0.045), (0.09, 0.09, 0.07), RED)
    box(m, (cx, cy - 0.17, rz * 0.9), (0.34, 0.06, 0.10), INK)
    # arms hanging out from the sides, legs below
    for sgn in (-1, 1):
        ay = BASE_Y + HEIGHT * 0.36
        ax = centre(0.36)[0] + sgn * radius(0.36) * 0.9
        pts = [(ax + sgn * 0.30 * s, ay - 0.30 * s, 0.0) for s in np.linspace(0, 1, 8)]
        tube(m, pts, [(0.045, 0.045)] * 8, lambda q: YELLOW, segs=12)
        lx = centre(0.04)[0] + sgn * 0.13
        pts = [(lx + sgn * 0.02 * s, BASE_Y + 0.02 - 0.32 * s, 0.0) for s in np.linspace(0, 1, 6)]
        tube(m, pts, [(0.045, 0.045)] * 6, lambda q: YELLOW, segs=12)
    return m


def write_glb(m, path):
    pos = np.array(m.v, np.float32)
    nor = np.array(m.n, np.float32)
    col = np.array(m.c, np.float32)
    uv = np.zeros((len(pos), 2), np.float32)
    idx = np.array(m.f, np.uint32).ravel()
    blobs = [pos.tobytes(), nor.tobytes(), col.tobytes(), uv.tobytes(), idx.tobytes()]
    views, off = [], 0
    for b in blobs:
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b)})
        off += len(b)
    n = len(pos)
    j = {
        'asset': {'version': '2.0', 'generator': 'wom-fe scripts/make-blimkin-model.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'Blimkin'}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2, 'TEXCOORD_0': 3}, 'indices': 4, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.65}}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': n, 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()},
            {'bufferView': 1, 'componentType': 5126, 'count': n, 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5126, 'count': n, 'type': 'VEC3'},
            {'bufferView': 3, 'componentType': 5126, 'count': n, 'type': 'VEC2'},
            {'bufferView': 4, 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'},
        ],
        'bufferViews': views, 'buffers': [{'byteLength': off}],
    }
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bn = b''.join(blobs)
    bn += b'\0' * (-len(bn) % 4)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(bn), b'BIN\0') + bn)
    print(f'wrote {path}: {n} vertices, {len(idx) // 3} triangles, {total} bytes')


if __name__ == '__main__':
    write_glb(build(), sys.argv[1] if len(sys.argv) > 1 else 'blimkin_v1.glb')
