#!/usr/bin/env python3
"""A flat picture of a .glb model: a transparent PNG, like
public/models/relics/pen_v1.thumbnail.png, rendered on the CPU.

    python3 scripts/render-glb-thumbnail.py <model.glb> <out.png> [--size 512] [--yaw 30] [--pitch 15] [--top 0.45]

numpy + PIL only (a headless browser's WebGL is not available on the dev VM).
Reads the first mesh's base-colour and metallic-roughness textures (normal maps are ignored): positions and normals through the node transforms (translation /
rotation / scale or a matrix), vertex strides, one base-colour texture. It
lights with a soft sky, a key light from the upper left and a rim light, adds
a Blinn-Phong highlight from the material's roughness and metalness, and
supersamples 3x for smooth edges. Not a PBR renderer: a faithful thumbnail,
not the game's exact shading.
"""
import argparse
import io
import json
import struct

import numpy as np
from PIL import Image

COMPONENT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load(path):
    data = open(path, 'rb').read()
    magic, _version, length = struct.unpack('<4sII', data[:12])
    if magic != b'glTF' or length != len(data):
        raise SystemExit(f'{path}: not a complete .glb (header says {length} bytes, file has {len(data)})')
    off, chunks = 12, {}
    while off < length:
        size, kind = struct.unpack('<I4s', data[off : off + 8])
        chunks[kind] = data[off + 8 : off + 8 + size]
        off += 8 + size
    return json.loads(chunks[b'JSON']), chunks[b'BIN\x00']


def accessor(j, blob, index):
    a = j['accessors'][index]
    view = j['bufferViews'][a['bufferView']]
    dt = np.dtype(COMPONENT[a['componentType']])
    n = WIDTH[a['type']]
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride') or dt.itemsize * n
    raw = np.frombuffer(blob, np.uint8, stride * (a['count'] - 1) + dt.itemsize * n, start)
    rows = np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * n), (stride, 1))
    out = np.ascontiguousarray(rows).view(dt).reshape(a['count'], n)
    return out / np.iinfo(dt).max if a.get('normalized') else out


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix']).reshape(4, 4).T
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    rot = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = rot * np.array(n.get('scale', [1, 1, 1]))
    m[:3, 3] = n.get('translation', [0, 0, 0])
    return m


def mesh_world_matrix(j, mesh_index=0):
    found = {}

    def walk(i, parent):
        n = j['nodes'][i]
        m = parent @ node_matrix(n)
        if 'mesh' in n:
            found.setdefault(n['mesh'], m)
        for c in n.get('children', []):
            walk(c, m)

    for root in j['scenes'][j.get('scene', 0)]['nodes']:
        walk(root, np.eye(4))
    return found.get(mesh_index, np.eye(4))


def texture(j, blob, tex_index):
    img = j['images'][j['textures'][tex_index]['source']]
    view = j['bufferViews'][img['bufferView']]
    start = view.get('byteOffset', 0)
    return np.array(Image.open(io.BytesIO(blob[start : start + view['byteLength']])).convert('RGB')).astype(float) / 255


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def render(path, size=512, yaw=30.0, pitch=15.0, ssaa=3, top=None):
    j, blob = load(path)
    prim = j['meshes'][0]['primitives'][0]
    pos = accessor(j, blob, prim['attributes']['POSITION']).astype(float)
    nrm = accessor(j, blob, prim['attributes']['NORMAL']).astype(float)
    uv = accessor(j, blob, prim['attributes']['TEXCOORD_0']).astype(float)
    idx = accessor(j, blob, prim['indices']).reshape(-1, 3)
    world = mesh_world_matrix(j)
    pos = pos @ world[:3, :3].T + world[:3, 3]
    nrm = nrm @ np.linalg.inv(world[:3, :3]).T
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12

    mat = j['materials'][prim.get('material', 0)]
    pbr = mat.get('pbrMetallicRoughness', {})
    tint = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
    tex = srgb_to_linear(texture(j, blob, pbr['baseColorTexture']['index'])) if 'baseColorTexture' in pbr else None
    rough_f = pbr.get('roughnessFactor', 1.0)
    metal_f = pbr.get('metallicFactor', 1.0)
    mr_tex = texture(j, blob, pbr['metallicRoughnessTexture']['index']) if 'metallicRoughnessTexture' in pbr else None

    # turn the model, then frame it
    ya, pa = np.radians(yaw), np.radians(pitch)
    ry = np.array([[np.cos(ya), 0, np.sin(ya)], [0, 1, 0], [-np.sin(ya), 0, np.cos(ya)]])
    rx = np.array([[1, 0, 0], [0, np.cos(pa), -np.sin(pa)], [0, np.sin(pa), np.cos(pa)]])
    rot = rx @ ry
    p = pos @ rot.T
    nr = nrm @ rot.T
    lo, hi = p.min(0), p.max(0)
    if top:  # frame only the top part of the model (a head-and-shoulders shot); the rest is cropped
        keep = p[p[:, 1] >= hi[1] - top * (hi[1] - lo[1])]
        lo, hi = keep.min(0), keep.max(0)
    centre = (lo + hi) / 2
    S = size * ssaa
    scale = 0.9 * S / max(hi[0] - lo[0], hi[1] - lo[1])
    X = (p[:, 0] - centre[0]) * scale + S / 2
    Y = S / 2 - (p[:, 1] - centre[1]) * scale
    Z = p[:, 2]

    key = np.array([-0.55, 0.65, 0.55]); key /= np.linalg.norm(key)
    rim = np.array([0.7, 0.2, -0.6]); rim /= np.linalg.norm(rim)
    view = np.array([0, 0, 1.0])
    half = key + view; half /= np.linalg.norm(half)

    rgb = np.zeros((S, S, 3))
    alpha = np.zeros((S, S), bool)
    zbuf = np.full((S, S), -1e18)
    for t in idx:
        xs, ys, zs = X[t], Y[t], Z[t]
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(S - 1, np.ceil(xs.max())))
        y0, y1 = int(max(0, np.floor(ys.min()))), int(min(S - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12:
            continue
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]
        sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        ok = inside & (z > zbuf[sl])
        if not ok.any():
            continue
        n = w0[..., None] * nr[t[0]] + w1[..., None] * nr[t[1]] + w2[..., None] * nr[t[2]]
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
        u = w0 * uv[t[0], 0] + w1 * uv[t[1], 0] + w2 * uv[t[2], 0]
        v = w0 * uv[t[0], 1] + w1 * uv[t[1], 1] + w2 * uv[t[2], 1]
        if tex is not None:
            h, w = tex.shape[:2]
            base = tex[(np.mod(v, 1) * (h - 1)).astype(int), (np.mod(u, 1) * (w - 1)).astype(int)] * tint
        else:
            base = np.broadcast_to(tint, n.shape)
        if mr_tex is not None:  # this pixel's own roughness (green) and metalness (blue)
            h, w = mr_tex.shape[:2]
            mr = mr_tex[(np.mod(v, 1) * (h - 1)).astype(int), (np.mod(u, 1) * (w - 1)).astype(int)]
            rough, metal = rough_f * mr[..., 1:2], metal_f * mr[..., 2:3]
        else:
            rough, metal = np.full(n.shape[:-1] + (1,), rough_f), np.full(n.shape[:-1] + (1,), metal_f)
        shininess = np.maximum(2 / np.maximum(rough, 0.08) ** 4 - 2, 12)
        sky = 0.5 + 0.5 * n[..., 1:2]                      # soft light from above
        diff = np.clip(n @ key, 0, 1)[..., None]
        rimlight = (np.clip(n @ rim, 0, 1) ** 2)[..., None]
        spec = np.clip(n @ half, 0, 1)[..., None] ** shininess
        fres = ((1 - np.clip(n @ view, 0, 1)) ** 3)[..., None]
        diffuse_part = base * (0.34 * sky + 0.95 * diff + 0.28 * rimlight) * (1 - 0.6 * metal)
        spec_color = (1 - metal) * 0.04 + metal * base
        # what the surface mirrors: a lighter sky above, a bright window where the key light is
        refl = 2 * (n @ view)[..., None] * n - view
        env = 0.14 + 0.36 * np.clip(refl[..., 1:2], 0, 1) + 3.2 * (np.clip(refl @ key, 0, 1)[..., None] ** (shininess * 2.5))
        mirror = env * ((1 - metal) * 0.05 + metal * (0.35 + 0.65 * base)) * (0.5 + 0.5 * fres.clip(0, 1) * 2)
        lit = diffuse_part + base * 0.18 * (1 - 0.6 * metal) + spec * (spec_color + 0.3) * 0.8 + mirror + fres * base * 0.4
        out = rgb[sl]
        out[ok] = lit[ok]
        zbuf[sl][ok] = z[ok]
        alpha[sl][ok] = True
    img = np.dstack([linear_to_srgb(rgb) * 255, alpha * 255]).astype(np.uint8)
    return Image.fromarray(img).resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('out')
    ap.add_argument('--size', type=int, default=512)
    ap.add_argument('--yaw', type=float, default=30.0)
    ap.add_argument('--pitch', type=float, default=15.0)
    ap.add_argument('--top', type=float, default=None, help='frame only this top fraction of the model, e.g. 0.45')
    a = ap.parse_args()
    render(a.model, a.size, a.yaw, a.pitch, top=a.top).save(a.out)
    print(f'wrote {a.out} ({a.size}x{a.size})')


if __name__ == '__main__':
    main()
