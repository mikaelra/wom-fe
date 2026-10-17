#!/usr/bin/env python3
"""8-bit thumbnails (Mikael, 2026-10-17): every frog skin, the Cherub, the
artifact, the relics (Pen, Paper, Stone) and the wheels, drawn on a 32x32
grid and scaled x8 to 256x256 with nearest-neighbour, so each pixel stays a
square at any size.

    python3 scripts/pixel-thumbnails.py            # writes public/pixel/*.png
    python3 scripts/pixel-thumbnails.py --sheet X  # also a preview sheet

PIL + numpy only. One frog drawing, recoloured per skin: the skin and belly
colours were sampled from the 3D thumbnails in public/skins/thumbnails/, the
eyes read off them by eye.
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw

N = 32
SCALE = 8
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'pixel')

YY, XX = np.mgrid[0:N, 0:N]
CX, CY = XX + 0.5, YY + 0.5


def ell(cx, cy, rx, ry):
    return ((CX - cx) ** 2 / rx**2 + (CY - cy) ** 2 / ry**2) <= 1.0


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def mix(c, to, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c, to))


def lighten(c, t=0.28):
    return mix(c, (255, 255, 255), t)


def darken(c, t=0.28):
    return mix(c, (0, 0, 20), t)


def shift(mask, dx, dy):
    out = np.zeros_like(mask)
    ys, xs = np.nonzero(mask)
    ys2, xs2 = ys + dy, xs + dx
    ok = (ys2 >= 0) & (ys2 < N) & (xs2 >= 0) & (xs2 < N)
    out[ys2[ok], xs2[ok]] = True
    return out


def dilate(mask):
    return mask | shift(mask, 1, 0) | shift(mask, -1, 0) | shift(mask, 0, 1) | shift(mask, 0, -1)


class Canvas:
    def __init__(self, bg=None):
        self.px = np.zeros((N, N, 4), dtype=np.uint8)
        if bg:
            self.px[:, :] = (*rgb(bg), 255)

    def fill(self, mask, color):
        self.px[mask] = (*color, 255)

    def dot(self, x, y, color):
        if 0 <= x < N and 0 <= y < N:
            self.px[y, x] = (*color, 255)

    def alpha(self):
        return self.px[:, :, 3] > 0

    def outline(self, color):
        a = self.alpha()
        self.fill(dilate(a) & ~a, color)

    def rim(self, base_mask, hi, lo):
        """Cel shading: the lit upper-left edge and the shaded lower-right edge."""
        lit = base_mask & ~shift(base_mask, 1, 1)
        shade = base_mask & ~shift(base_mask, -1, -1)
        self.fill(shade, lo)
        self.fill(lit, hi)

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        im = Image.fromarray(self.px).resize((N * SCALE, N * SCALE), Image.NEAREST)
        im.save(os.path.join(OUT, name))
        return im


# ---------------------------------------------------------------- frogs ----
# Only the face (Mikael, 2026-10-17): the head and its two eyes fill the
# whole grid, no body.

EYE_L, EYE_R = (7.5, 8.5), (24.5, 8.5)  # on pixel centres, mirrored

# skin, belly (the lower face): sampled from the 3D thumbnails. sclera / iris
# / pupil: the eye as it looks there. pr: pupil radius, ir: iris radius, in
# the units of the old body drawing (the face scales them up).
FROGS = {
    'frog_green_v1': dict(mouth=(20, 3.2), curl=True, skin='#d8ea6a', belly='#f1ece2', sclera='#f4f4ea', iris='#9a1233', pupil='#150003', ir=2.7, pr=1.5),
    'frog_blue_v1': dict(skin='#a8e0ee', belly='#f0f0f0', sclera='#f4f4f4', iris='#000000', pupil='#000000', ir=2.9, pr=2.9),
    'frog_orange_cursed_v1': dict(skin='#f8be3c', belly='#f6d878', sclera='#c98a2c', iris='#4a3a34', iris_edge='#8a6a56', speck='#b09a86', pupil='#0b0807', ir=2.95, pr=0, diamond=4),
    'frog_pink_v1': dict(skin='#f4bfd0', belly='#fbe0e8', sclera='#ffffff', iris='#111111', pupil='#000000', ir=2.0, pr=2.0),
    'frog_purple_v1': dict(skin='#cfa0ea', belly='#f0e6f0', sclera='#ffffff', iris='#111111', pupil='#000000', ir=2.0, pr=2.0),
    'frog_red_v1': dict(skin='#ff4a2e', belly='#ecd8d8', sclera='#eef0dc', iris='#000000', pupil='#000000', py=0, ir=2.95, pr=2.95),
    'frog_yellow_v1': dict(skin='#f4e060', belly='#f3e8b8', sclera='#b98650', iris='#b98650', pupil='#0a0502', ir=2.95, pr=0, diamond=4),
    'frog_gold_v1': dict(skin='#a66f12', belly='#dcb888', sclera='#a81426', iris='#a81426', pupil='#0c0002', ir=2.95, pr=0, diamond=4, hi='#e2b04a'),
    'frog_silver_v1': dict(skin='#62646e', belly='#52545e', sclera='#16161a', iris='#000000', pupil='#000000', ir=2.8, pr=2.8, hi='#dce0ea'),
    'frog_bling_v1': dict(mouth=(23, -2.8), skin='#55cc34', belly='#d6e8c0', sclera='#2f9c8c', iris='#46c4b8', iris_edge='#7040b0', crescent=True, pupil='#2a1860', bar='#000000', py=0, ir=3.0, pr=1.75, sparkle=True),
    'frog_rainbow_v2': dict(skin='#ff6a30', belly='#f4ec96', sclera='#ff9a2c', iris='#000000', pupil='#000000', ir=2.8, pr=2.8, rainbow=True),
}



EYE_SCALE = 1.32


def diamond(cx, cy, r):
    """A square turned onto its corners -- they point up, down, left and
    right of the eye -- the pupil of the orange, yellow and gold frogs.
    (cx, cy) is a pixel centre."""
    ax, ay = int(cx - 0.5), int(cy - 0.5)
    return np.abs(XX - ax) + np.abs(YY - ay) <= r


SPECKS = [(-2, -1), (2, -2), (-1, 2), (2, 1), (0, -3), (-3, 1), (3, 0), (1, 3), (-2, 3), (-3, -2)]


DEFAULT_MOUTH = (21.6, 1.0)  # a natural, nearly flat mouth


def mouth_y(x, mouth=DEFAULT_MOUTH):
    """The mouth line: `ends` is where it meets the cheeks, `amp` how far its
    middle sits below them -- a smile if positive, an arch if negative."""
    ends, amp = mouth
    return int(round(ends + amp * (1 - ((x - 16) / 12.6) ** 2)))


def frog_shapes(mouth=DEFAULT_MOUTH):
    head = ell(16, 18, 15.4, 10.8)
    bumps = ell(*EYE_L, 6.1, 6.1) | ell(*EYE_R, 6.1, 6.1)
    skin = head | bumps
    below = np.zeros((N, N), dtype=bool)  # the lower face, under the smile
    for x in range(N):
        below[mouth_y(x, mouth) + 1 :, x] = True
    belly = below & head
    return dict(head=head, bumps=bumps, skin=skin, belly=belly)


def draw_frog(c, p, dark_outline='#15121e'):
    mouth = p.get('mouth', DEFAULT_MOUTH)
    s = frog_shapes(mouth)
    skin, belly = rgb(p['skin']), rgb(p['belly'])
    hi = rgb(p['hi']) if 'hi' in p else lighten(skin, 0.35)
    lo = darken(skin, 0.22)
    c.fill(s['skin'], skin)
    c.fill(s['belly'], belly)
    if p.get('rainbow'):
        lime = ((np.abs(CX - 16) <= 5.8) & (CY <= 16.5)) | ell(16, 15.5, 4.6, 3.0)
        c.fill(lime & s['skin'], rgb('#c4ee8c'))  # the lime stripe: nose to the top of the skull, a little onto the eyes
        c.fill(s['belly'] & (YY >= 26), rgb('#c4ee8c'))
        c.fill(s['head'] & (CX < 5) & (YY >= 16), rgb('#ff3a2c'))
        c.fill(s['head'] & (CX > 27) & (YY >= 16), rgb('#ff3a2c'))
    c.rim(s['skin'], hi, lo)
    if p.get('sparkle'):  # fine glitter over the middle of the face and the lower face
        wear = ((np.abs(CX - 16) <= 4.8) & (CY >= 9.5) & s['head']) | s['belly']
        grain = np.random.default_rng(7).random((N, N)) * 100  # seeded: the same glitter every run
        for y in range(N):
            for x in range(N):
                if not wear[y, x]:
                    continue
                h = grain[y, x]
                if h < 22:
                    c.dot(x, y, (255, 255, 255))
                elif h < 34:
                    c.dot(x, y, rgb('#c8f4ff'))
                elif h < 40:
                    c.dot(x, y, rgb('#9fe6c0'))
    outline = rgb(dark_outline)
    line_col = darken(skin, 0.7) if sum(skin) > 150 else outline
    for x in range(4, 29):
        c.dot(x, mouth_y(x, mouth), line_col)
    if p.get('curl'):  # the corners of a real smile curl up
        c.dot(3, mouth_y(4, mouth) - 1, line_col)
        c.dot(28, mouth_y(28, mouth) - 1, line_col)
    # nostrils
    for x in (13, 18):
        c.dot(x, 15, lo)
        c.dot(x + 1, 15, lo)
    # eyes
    for cx, cy in (EYE_L, EYE_R):
        if p.get('rim'):
            c.fill(ell(cx, cy, 4.9, 4.9), rgb(p['rim']))
            c.fill(ell(cx, cy, 4.1, 4.1), rgb(p['sclera']))
        else:
            c.fill(ell(cx, cy, 4.9, 4.9), rgb(p['sclera']))
        ir = p['ir'] * EYE_SCALE
        if p.get('crescent'):  # the edge shows only along the bottom
            c.fill(ell(cx, cy + 0.3, ir, ir), rgb(p['iris_edge']))
            c.fill(ell(cx, cy - 0.5, ir - 0.2, ir - 0.2) & ell(cx, cy + 0.3, ir, ir), rgb(p['iris']))
        elif p.get('iris_edge'):
            c.fill(ell(cx, cy + 0.3, ir, ir), rgb(p['iris_edge']))
            c.fill(ell(cx, cy + 0.3, ir - 0.9, ir - 0.9), rgb(p['iris']))
        else:
            c.fill(ell(cx, cy + p.get('py', 0.3), ir, ir), rgb(p['iris']))
        if p.get('speck'):
            for dx, dy in SPECKS:
                c.dot(int(cx + dx), int(cy + dy), rgb(p['speck']))
        if p.get('diamond'):
            c.fill(diamond(cx, cy, p['diamond']), rgb(p['pupil']))
        else:
            c.fill(ell(cx, cy + p.get('py', 0.3), p['pr'] * EYE_SCALE, p['pr'] * EYE_SCALE), rgb(p['pupil']))
        if p.get('bar'):  # a black line through the pupil, side to side across the iris
            row = int(cy - 0.5 + p.get('py', 0.3))
            c.fill((YY == row) & (np.abs(CX - cx) <= ir), rgb(p['bar']))
        c.dot(int(cx - 2), int(cy - 2), (255, 255, 255))
        c.dot(int(cx - 1), int(cy - 2), (255, 255, 255))
    # a gloss mark on the forehead
    for x in (14, 15, 16):
        c.dot(x, 11, hi)
    c.dot(14, 12, hi)
    c.outline(darken(skin, 0.78) if sum(skin) > 200 else outline)


def frog(name):
    c = Canvas()
    draw_frog(c, FROGS[name])
    return c


# --------------------------------------------------------------- others ----


def artifact():
    """The artifact is the rolled scroll (public/skins/items/pergament_v1.glb):
    parchment with a narrow waist, a gold-brown cord tied round it, the
    inside of the roll showing at the top."""
    c = Canvas()
    parch, light, dark = rgb('#dcc38c'), rgb('#ecd9a8'), rgb('#b69a62')
    half = lambda y: 6.6 - 2.6 * math.sin(math.pi * (y - 3) / 26) ** 1.2  # wider at the ends
    body = np.zeros((N, N), dtype=bool)
    for y in range(4, 30):
        h = half(y)
        body[y, :] = np.abs(CX[0] - 16) <= h
    c.fill(body, parch)
    c.fill(body & (CX < 13.0), light)
    c.fill(body & (CX >= 18.4), dark)
    c.fill(body & (CX >= 20.8), darken(dark, 0.18))
    # the top opening: the inside of the roll
    c.fill(ell(16, 4.2, 6.7, 2.0), rgb('#8a6a34'))
    c.fill(ell(16, 4.0, 4.6, 1.2), rgb('#f2e2b4'))
    c.fill(ell(16, 4.1, 2.0, 0.6), rgb('#8a6a34'))
    # the bottom edge
    c.fill(ell(16, 29.6, 6.6, 1.0) & ~body, dark)
    # the cord: a band round the waist, a loop, two tails
    cord, cord_hi, cord_lo = rgb('#a8832a'), rgb('#c8a248'), rgb('#6e5214')
    band = (YY >= 15) & (YY <= 17) & (np.abs(CX - 16) <= half(16) + 0.9)
    c.fill(band, cord)
    c.fill(band & (YY == 15), cord_hi)
    c.fill(band & (YY == 17), cord_lo)
    for x, y in [(23, 15), (24, 14), (25, 14), (25, 15), (24, 16)]:
        c.dot(x, y, cord)
    c.dot(24, 15, rgb('#070b15'))
    c.dot(23, 14, cord_hi)
    for x, y in [(22, 18), (22, 19), (22, 20), (23, 21), (24, 18), (24, 19), (25, 20)]:
        c.dot(x, y, cord)
    # grain and a few ink marks on the parchment
    for x, y in [(12, 8), (14, 11), (11, 22), (13, 25), (15, 27), (17, 9), (18, 23), (12, 12)]:
        c.dot(x, y, dark)
    c.dot(11, 10, rgb('#6e5a38'))
    c.dot(11, 11, rgb('#6e5a38'))
    c.outline(rgb('#3a2c14'))
    return c


def poly(c, pts, color):
    """A polygon filled on the pixel grid (no anti-aliasing)."""
    m = Image.new('L', (N, N), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    c.fill(np.array(m) > 0, color)


def line(c, pts, color):
    m = Image.new('L', (N, N), 0)
    ImageDraw.Draw(m).line(pts, fill=255, width=1)
    c.fill(np.array(m) > 0, color)


def dagger(c):
    """The cherub's small dagger (0.8x its first size), held across its chest as in the 3D model:
    gold pommel, brown grip in the hand, gold crossguard, a steel blade
    tapering up and to the right."""
    d = Canvas()
    gold, gold_lo, grip = rgb('#d8a830'), rgb('#8a5a14'), rgb('#8a4a30')
    for x, y in [(5, 21), (6, 21), (5, 22), (6, 22)]:  # the pommel
        d.dot(x, y, gold)
    d.dot(6, 22, gold_lo)
    for x, y in [(7, 21), (8, 20), (9, 20)]:  # the grip
        d.dot(x, y, grip)
    for x, y in [(10, 18), (10, 19), (11, 19), (10, 20), (11, 20), (10, 21)]:  # the crossguard
        d.dot(x, y, gold)
    d.dot(11, 20, gold_lo)
    for i in range(8):  # the blade
        x = 12 + i
        yc = 19 - round(i * 0.4)
        half = 1 if i < 5 else 0
        d.dot(x, yc - half, rgb('#f2f5fb'))
        if half:
            d.dot(x, yc, rgb('#c4c9d8'))
            d.dot(x, yc + 1, rgb('#6a6e82'))
        else:
            d.dot(x, yc, rgb('#c4c9d8'))
    for x, y in [(8, 19), (9, 19), (8, 20)]:  # the hand round the grip
        d.dot(x, y, rgb('#f1c9b0'))
    m = d.alpha()
    # a dark edge where it lies on the dress -- not over the arm that holds it
    skin = np.all(c.px[:, :, :3] == np.array(rgb('#f1c9b0')), axis=2)
    c.fill(dilate(m) & ~m & c.alpha() & ~skin, rgb('#4a4660'))
    c.px[m] = d.px[m]


def cherub():
    c = Canvas()
    white, shade = rgb('#f8f8fc'), rgb('#bcbfd0')
    # wings first, with an outline of their own so they stay apart from the dress
    for sign in (-1, 1):
        x0 = 16 + sign * 5
        pts = [(x0, 13), (16 + sign * 9, 4), (16 + sign * 14, 6), (16 + sign * 14, 14), (16 + sign * 10, 20), (x0, 19)]
        poly(c, pts, white)
        line(c, [(16 + sign * 9, 8), (16 + sign * 12, 15)], shade)
        line(c, [(16 + sign * 7, 11), (16 + sign * 10, 17)], shade)
    c.outline(rgb('#6a6882'))
    dress = ell(16, 23, 6.6, 7.4) & (YY >= 15)
    c.fill(dress, white)
    c.rim(dress, (255, 255, 255), shade)
    c.fill((YY == 29) & (XX >= 11) & (XX <= 20), shade)  # the hem
    c.fill(((XX >= 12) & (XX <= 14) | (XX >= 18) & (XX <= 20)) & (YY >= 30), rgb('#f1c9b0'))  # feet
    c.fill(ell(8.6, 17.4, 1.6, 3.4) | ell(22.8, 20, 1.5, 3.0), rgb('#f1c9b0'))  # arms: the left one is bent to hold the dagger
    head = ell(16, 9.4, 5.2, 5.2)
    c.fill(head, rgb('#f6d3bc'))
    hair = ell(16, 7.2, 6.0, 4.6) & (YY <= 8)
    c.fill(hair | ell(11.2, 9.6, 1.8, 2.4) | ell(20.8, 9.6, 1.8, 2.4), rgb('#f0c23c'))
    c.fill(ell(16, 5.6, 5.0, 2.6), rgb('#ffe27a'))
    c.dot(14, 10, rgb('#5a6a98'))
    c.dot(18, 10, rgb('#5a6a98'))
    c.dot(16, 12, rgb('#e08878'))
    dagger(c)
    c.outline(rgb('#4a4660'))
    return c


def pen():
    c = Canvas()
    for t in np.linspace(0, 1, 220):
        x, y = 4 + t * 24, 3 + t * 25
        half = 4.6 * (math.sin(math.pi * min(1, t * 1.25)) ** 0.6) if t < 0.8 else 0
        for ox in np.linspace(-half, half, 16):
            c.dot(int(x + ox * 0.7), int(y - ox * 0.7), rgb('#eceef4') if ox < 0.8 else rgb('#aeb2c2'))
    for t in np.linspace(0, 1, 120):
        c.dot(int(4 + t * 24), int(3 + t * 25), rgb('#50505a'))
    c.dot(28, 28, rgb('#15121e'))
    c.dot(27, 27, rgb('#15121e'))
    c.outline(rgb('#2a2836'))
    return c


def paper():
    c = Canvas()
    sheet = (XX >= 7) & (XX <= 24) & (YY >= 4) & (YY <= 27)
    c.fill(sheet, rgb('#f1e2ba'))
    c.fill(sheet & ((XX >= 22) | (YY >= 25)), rgb('#dccb98'))
    # the folded corner, top right: cut away, with the flap in a darker tone
    cut = sheet & (XX >= 19) & (YY <= 9) & ((XX - 19) + (9 - YY) >= 5)
    c.px[cut] = 0
    c.fill(sheet & (XX >= 19) & (YY <= 9) & ((XX - 19) + (9 - YY) < 5) & ((XX - 19) + (9 - YY) >= 3), rgb('#c2ab72'))
    c.outline(rgb('#3a2e1a'))
    return c


def stone():
    """A chunky faceted rock, green."""
    c = Canvas()
    top = [(9, 9), (15, 6), (22, 7), (27, 12), (16, 14)]
    left = [(4, 15), (9, 9), (16, 14), (13, 25), (8, 26), (5, 22)]
    right = [(16, 14), (27, 12), (28, 20), (24, 26), (14, 27), (13, 25)]
    poly(c, left, rgb('#52c46f'))
    poly(c, right, rgb('#2f9a50'))
    poly(c, top, rgb('#9aeaae'))
    for a, b in [((4, 15), (16, 14)), ((16, 14), (27, 12)), ((16, 14), (13, 25))]:
        line(c, [a, b], rgb('#1f7a3c'))
    line(c, [(9, 9), (16, 14)], rgb('#6fd68a'))
    for x, y in [(12, 8), (13, 8), (12, 9), (21, 9)]:
        c.dot(x, y, (255, 255, 255))
    c.dot(8, 17, rgb('#8fe4a4'))
    c.dot(9, 18, rgb('#8fe4a4'))
    c.outline(rgb('#0f3d1d'))
    return c


def wheel(ring, wedge, gap):
    c = Canvas()
    r = np.sqrt((CX - 16) ** 2 + (CY - 16) ** 2)
    ang = (np.degrees(np.arctan2(CY - 16, CX - 16)) + 90) % 360
    disc = r <= 14.2
    c.fill(disc, rgb(gap))
    sector = (ang % 120) < 62
    c.fill(disc & (r <= 9.6) & sector, rgb(wedge))
    c.fill(disc & (r <= 9.6) & sector & (r <= 5), darken(rgb(wedge), 0.25))
    c.fill(disc & (r > 9.6), rgb(ring))
    c.fill(disc & (r > 12.2), darken(rgb(ring), 0.3))
    c.fill(r <= 1.6, rgb('#15121e'))
    c.rim(disc, lighten(rgb(ring), 0.35), darken(rgb(ring), 0.5))
    c.outline(rgb('#15121e'))
    return c


def artifacts_list():
    out = {n: frog(n) for n in FROGS}
    out['cherub_v1'] = cherub()
    out['artifact'] = artifact()
    out['pen'] = pen()
    out['paper'] = paper()
    out['stone'] = stone()
    out['wheel'] = wheel('#1c1cf0', '#e8d020', '#7a1c46')
    out['special-wheel'] = wheel('#8a18ff', '#22e022', '#a0306e')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', help='also write a preview sheet to this path')
    a = ap.parse_args()
    imgs = {}
    for name, canvas in artifacts_list().items():
        imgs[name] = canvas.save(f'{name}.png')
    print(f'wrote {len(imgs)} thumbnails to {os.path.relpath(OUT)}')
    if a.sheet:
        cols = 5
        rows = math.ceil(len(imgs) / cols)
        sheet = Image.new('RGBA', (cols * 264, rows * 264), (36, 36, 48, 255))
        for i, im in enumerate(imgs.values()):
            sheet.alpha_composite(im, ((i % cols) * 264 + 4, (i // cols) * 264 + 4))
        sheet.convert('RGB').save(a.sheet)


if __name__ == '__main__':
    main()
