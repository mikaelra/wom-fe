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

    def rim_adaptive(self, base_mask, lit_t=0.35, shade_t=0.22):
        """Like rim(), but each edge pixel is the colour already there, lightened
        or darkened -- for a skin of several colours."""
        lit = base_mask & ~shift(base_mask, 1, 1)
        shade = base_mask & ~shift(base_mask, -1, -1)
        rgbs = self.px[:, :, :3].astype(float)
        rgbs[shade] = rgbs[shade] * (1 - shade_t)
        rgbs[lit] = rgbs[lit] + (255 - rgbs[lit]) * lit_t
        self.px[:, :, :3] = np.clip(rgbs, 0, 255).astype(np.uint8)

    def save(self, name):
        os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
        im = Image.fromarray(self.px).resize((N * SCALE, N * SCALE), Image.NEAREST)
        im.save(os.path.join(OUT, name))
        return im


# ---------------------------------------------------------------- frogs ----
# Only the face (Mikael, 2026-10-17): the head and its two eyes fill the
# whole grid, no body.

EYE_L, EYE_R = (7.5, 8.5), (24.5, 8.5)  # on pixel centres, mirrored

def bling_mouth(x):
    """Bling's mouth: the middle smiles (it sags a little), and from each side
    of it the ends slope down gently towards the cheeks (Mikael, 2026-10-17)."""
    t = abs(x - 16) / 12.6
    if t <= 0.5:
        return 20.4 + 2.4 * (1 - (t / 0.5) ** 2)
    return 20.4 + 2.4 * ((t - 0.5) / 0.5)  # a gentle, straight ramp down


# skin, belly (the lower face): sampled from the 3D thumbnails. sclera / iris
# / pupil: the eye as it looks there. pr: pupil radius, ir: iris radius, in
# the units of the old body drawing (the face scales them up).
FROGS = {
    'frog_green_v1': dict(mouth=(20.8, 2.3), curl=True, skin='#86f23e', belly='#f1ece2', sclera='#f4f4ea', iris='#9a1233', pupil='#150003', ir=2.7, pr=1.5),
    'frog_blue_v1': dict(skin='#a8e0ee', belly='#f0f0f0', sclera='#f4f4f4', iris='#000000', pupil='#000000', ir=2.9, pr=2.9),
    'frog_orange_cursed_v1': dict(skin='#f8be3c', belly='#f6d878', sclera='#c98a2c', iris='#4a3a34', iris_edge='#8a6a56', speck='#b09a86', pupil='#0b0807', ir=2.95, pr=0, diamond=4),
    'frog_pink_v1': dict(gloss=True, no_glint=True, skin='#f4bfd0', belly='#fbe0e8', sclera='#ffffff', iris='#111111', pupil='#000000', py=0, ir=2.65, pr=2.65),
    'frog_purple_v1': dict(gloss=True, no_glint=True, skin='#cfa0ea', belly='#f0e6f0', sclera='#ffffff', iris='#111111', pupil='#000000', py=0, ir=2.65, pr=2.65),
    'frog_red_v1': dict(skin='#ff4a2e', belly='#ecd8d8', sclera='#eef0dc', iris='#000000', pupil='#000000', py=0, ir=2.95, pr=2.95),
    'frog_yellow_v1': dict(skin='#f4e060', belly='#f3e8b8', sclera='#b98650', iris='#b98650', pupil='#0a0502', ir=2.95, pr=0, diamond=4),
    'frog_gold_v1': dict(skin='#a66f12', belly='#dcb888', sclera='#a81426', iris='#a81426', pupil='#0c0002', ir=2.95, pr=0, diamond=4, hi='#e2b04a'),
    'frog_silver_v1': dict(skin='#62646e', belly='#52545e', sclera='#16161a', iris='#000000', pupil='#000000', ir=2.8, pr=2.8, hi='#dce0ea'),
    'frog_bling_v1': dict(mouth=bling_mouth, skin='#55cc34', belly='#d6e8c0', sclera='#2f9c8c', iris='#46c4b8', iris_edge='#7040b0', crescent=True, pupil='#2a1860', bar='#000000', py=0, ir=3.0, pr=1.75, sparkle=True),
    'frog_robot_v1': dict(mouth=(20.6, 2.6), smile_thick=2, plates=True, seam_x=7, no_glint=True, center_dot=True, skin='#80838a', belly='#8d9098', sclera='#000000', iris='#000000', pupil='#000000', py=0, ir=2.95, pr=2.95, hi='#cfd2da'),
    'frog_rainbow_v2': dict(skin='#ff6a30', belly='#f4ec96', sclera='#ff9a2c', iris='#000000', pupil='#000000', ir=2.8, pr=2.8, rainbow=True, adaptive_rim=True),
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
    if callable(mouth):
        return int(round(mouth(x)))
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
        lime = ((np.abs(CX - 16) <= 6.6) & (CY <= 16.5)) | ell(16, 15.5, 4.6, 3.0)
        c.fill(lime & s['skin'], rgb('#c4ee8c'))  # the lime stripe: nose to the top of the skull, a little onto the eyes
        c.fill(s['belly'] & (YY >= 26), rgb('#c4ee8c'))
        c.fill(s['head'] & (CX < 5) & (YY >= 16), rgb('#ff3a2c'))
        c.fill(s['head'] & (CX > 27) & (YY >= 16), rgb('#ff3a2c'))
    if p.get('adaptive_rim'):
        c.rim_adaptive(s['skin'])
    else:
        c.rim(s['skin'], hi, lo)
    if p.get('sparkle'):
        # under the mouth: fine glitter (seeded: the same every run)
        grain = np.random.default_rng(7).random((N, N)) * 100
        for y in range(N):
            for x in range(N):
                if not s['belly'][y, x]:
                    continue
                h = grain[y, x]
                if h < 22:
                    c.dot(x, y, (255, 255, 255))
                elif h < 34:
                    c.dot(x, y, rgb('#c8f4ff'))
                elif h < 40:
                    c.dot(x, y, rgb('#9fe6c0'))
        # above it: diamonds in arcs round each eye, as on the 3D model, ending
        # a clear gap before the mouth
        keep = s['skin'] & ~s['belly']
        for y in range(N):
            for x in range(N):
                if y > mouth_y(x, mouth) - 3:
                    keep[y, x] = False
        for cx, cy in (EYE_L, EYE_R):
            for ring, r in enumerate((6.3, 8.3, 10.3)):
                n = int(2 * math.pi * r / 2.2)
                for k in range(n):
                    ang = 2 * math.pi * k / n  # the dots line up radially, ring to ring
                    x, y = int(math.floor(cx + r * math.cos(ang))), int(math.floor(cy + r * math.sin(ang)))
                    if 0 <= x < N and 0 <= y < N and keep[y, x]:
                        c.dot(x, y, (255, 255, 255) if (k + ring) % 3 else rgb('#c8f4ff'))
    outline = rgb(dark_outline)
    line_col = darken(skin, 0.7) if sum(skin) > 150 else outline
    for x in range(4, 29):
        for row in range(p.get('smile_thick', 1)):  # a thicker smile repeats the curve a row lower
            y = mouth_y(x, mouth) + row
            if s['skin'][y, x]:
                c.dot(x, y, line_col)
    if p.get('curl'):  # the corners of a real smile curl up
        c.dot(3, mouth_y(4, mouth) - 1, line_col)
        c.dot(28, mouth_y(28, mouth) - 1, line_col)
    for rx, ry in p.get('rivets', []):  # rivets at the corners of the mouth: a dark 2x2 with a glint
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            c.dot(rx + dx, ry + dy, darken(skin, 0.5))
        c.dot(rx, ry, lighten(skin, 0.45))
    if p.get('seam'):  # a panel seam arching over the mouth between the rivets
        for x in range(6, 26):
            y = int(round(17.2 - 3.6 * (1 - ((x - 15.5) / 10.0) ** 2)))
            if s['skin'][y, x] and not c.px[y, x, :3].tolist() == list(rgb(p['sclera'])):
                c.dot(x, y, darken(skin, 0.38))
    if p.get('panels'):  # more plating: seams between and under the eyes, down each cheek, across the jaw
        seam_col = darken(skin, 0.4)
        seams = [
            [(15, 9), (15, 13)], [(16, 9), (16, 13)],            # down the middle, between the eyes
            [(13, 12), (18, 12)],                                 # across the brow
            [(3, 15), (3, 19), (4, 22), (7, 25)],                 # the left cheek plate
            [(28, 15), (28, 19), (27, 22), (24, 25)],             # the right cheek plate
            [(9, 26), (22, 26)],                                  # under the jaw
        ]
        for pts in seams:
            m = Image.new('L', (N, N), 0)
            ImageDraw.Draw(m).line(pts, fill=255, width=1)
            hit = (np.array(m) > 0) & s['skin']
            keep = hit & ~np.all(c.px[:, :, :3] == np.array(rgb(p['sclera'])), axis=2)
            c.fill(keep, seam_col)
        # bolts on either side: a dark head with a glint, at the temples, cheeks and jaw corners
        for bx, by in [(2, 13), (29, 13), (5, 21), (26, 21), (9, 24), (22, 24), (6, 28), (25, 28)]:
            if s['skin'][by, bx]:
                c.dot(bx, by, darken(skin, 0.55))
                if s['skin'][by - 1, bx - 1]:
                    c.dot(bx - 1, by - 1, lighten(skin, 0.4))
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
        if not p.get('no_glint'):
            c.dot(int(cx - 2), int(cy - 2), (255, 255, 255))
            c.dot(int(cx - 1), int(cy - 2), (255, 255, 255))
        if p.get('center_dot'):  # no reflection: one white pixel in the middle of the black eye
            c.dot(int(cx - 0.5), int(cy - 0.5), (255, 255, 255))
        if p.get('gloss'):  # a little white at the lower left of the pupil, as on the 3D model,
            # kept two pixels or more from the pupil's edge
            ax, ay = int(cx - 0.5), int(cy - 0.5)
            c.dot(ax - 1, ay + 1, (255, 255, 255))
            c.dot(ax, ay + 1, (255, 255, 255))
    # a gloss mark on the forehead
    for x in (14, 15, 16):
        c.dot(x, 11, hi)
    c.dot(14, 12, hi)
    if p.get('plates'):
        # The head is built of metal pieces: one black pixel seam down from the top middle
        # of the head and one across the face between the nose and the mouth, with
        # rivets in parallel to them, a gap apart, wherever there is room.
        black = (0, 0, 0)
        rivet = darken(skin, 0.5)
        plain = {tuple(skin), tuple(belly)}

        def is_plain(x, y):
            return 0 <= x < N and 0 <= y < N and tuple(int(v) for v in c.px[y, x, :3]) in plain and c.px[y, x, 3] > 0

        def seam(x, y):
            # a black seam through a black eye is invisible, so it is left to the eye (and its white dot)
            in_eye = any(math.hypot(x + 0.5 - ex, y + 0.5 - ey) <= 4.95 for ex, ey in (EYE_L, EYE_R))
            if s['skin'][y, x] and not in_eye and int(c.px[y, x, :3].sum()) > 90:   # not over the outline
                c.dot(x, y, black)

        vx, hy = p.get('seam_x', 16), 18   # the vertical seam: down the middle, or through an eye
        top = next(y for y in range(N) if s['skin'][y, vx])
        bottom = max(y for y in range(N) if s['skin'][y, vx])        # the chin
        for y in range(top, bottom + 1):                              # right through the smile
            seam(vx, y)
        for x in range(2, 30):
            seam(x, hy)
        def room(x, y):  # the rivet's own pixel and the four around it are plain metal
            return all(is_plain(x + dx, y + dy) for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)))
        gap = 5   # a pin every 5th pixel
        spots = [(vx + side * 2, y) for side in (-1, 1) for y in range(top + 2, bottom - 1, gap)]  # beside the vertical
        spots += [(x, hy + side * 2) for side in (-1, 1) for x in range(4, 29, gap)]               # along the horizontal
        for x, y in spots:
            if room(x, y):
                c.dot(x, y, rivet)
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
    """The quill: a feather's vane, then a long bare quill (the calamus -- the end
    you write with) running on to a dark nib (Mikael, 2026-10-17: it was too short)."""
    c = Canvas()
    x0, y0, x1, y1 = 3.0, 2.0, 30.0, 30.0       # the whole length, corner to corner
    vane_end = 0.60                              # the vane is the first 60%; the rest is quill
    for t in np.linspace(0, 1, 260):
        x, y = x0 + t * (x1 - x0), y0 + t * (y1 - y0)
        if t < vane_end:
            half = 4.6 * (math.sin(math.pi * t / vane_end) ** 0.6)
            for ox in np.linspace(-half, half, 16):
                c.dot(int(x + ox * 0.7), int(y - ox * 0.7), rgb('#eceef4') if ox < 0.8 else rgb('#aeb2c2'))
    for t in np.linspace(0, 1, 200):
        x, y = int(x0 + t * (x1 - x0)), int(y0 + t * (y1 - y0))
        # the shaft: dark through the vane, then the pale bare quill, then the nib
        if t < vane_end:
            c.dot(x, y, rgb('#50505a'))
        elif t < 0.90:
            c.dot(x, y, rgb('#d4d8e4'))
            c.dot(x + 1, y, rgb('#a9aebd'))          # its shaded side
        else:
            c.dot(x, y, rgb('#15121e'))              # the nib
    c.outline(rgb('#2a2836'))
    return c


def paper():
    """The Paper relic (v2): a crumpled gold-tan sheet with wavy edges and four curled
    corners, in the colours sampled from paper_v2.thumbnail.png."""
    c = Canvas()
    base, lit, shade = rgb('#9c8655'), rgb('#d1aa57'), rgb('#7d6433')
    hi, pale, mid = rgb('#f4d98c'), rgb('#feeaa2'), rgb('#c69e51')
    x0, x1, y0, y1 = 6, 25, 3, 28
    sheet = np.zeros((N, N), dtype=bool)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            wl, wr = round(1.2 * math.sin(y * 0.38 + 0.4)), round(1.2 * math.sin(y * 0.31 + 2.1))   # the edges are not straight
            wt, wb = round(1.1 * math.sin(x * 0.34 + 1.0)), round(1.1 * math.sin(x * 0.29 + 3.0))
            if x0 + wl <= x <= x1 - wr and y0 + wt <= y <= y1 - wb:
                sheet[y, x] = True
    c.fill(sheet, mix(base, lit, 0.22))
    c.fill(sheet & (CX + CY < 22), mix(base, lit, 0.55))           # lit from the upper left
    c.fill(sheet & (CX + CY > 41), mix(base, shade, 0.55))         # shaded lower right
    c.rim(sheet, lit, shade)
    for x, y in [(11, 11), (12, 11), (17, 17), (18, 17), (13, 22), (14, 22), (20, 9), (9, 18)]:   # creases
        c.dot(x, y, shade)
    for x, y in [(15, 7), (10, 14), (19, 21), (16, 14)]:
        c.dot(x, y, mix(base, hi, 0.5))
    # the four corners curl up towards you: a pale flap with a dark fold under it
    curls = [
        ([(6, 3), (7, 3), (8, 3), (9, 3), (6, 4), (7, 4), (8, 4), (6, 5), (7, 5), (6, 6)], pale, [(9, 4), (8, 5), (7, 6), (6, 7)]),
        ([(25, 3), (24, 3), (23, 3), (22, 3), (25, 4), (24, 4), (23, 4), (25, 5), (24, 5), (25, 6)], mix(mid, pale, 0.4), [(22, 4), (23, 5), (24, 6), (25, 7)]),
        ([(6, 28), (7, 28), (8, 28), (9, 28), (6, 27), (7, 27), (8, 27), (6, 26), (7, 26), (6, 25)], mix(mid, pale, 0.6), [(9, 27), (8, 26), (7, 25), (6, 24)]),
        ([(25, 28), (24, 28), (23, 28), (22, 28), (25, 27), (24, 27), (23, 27), (25, 26), (24, 26), (25, 25)], mid, [(22, 27), (23, 26), (24, 25), (25, 24)]),
    ]
    for flap, color, fold in curls:
        for x, y in fold:
            c.dot(x, y, shade)
        for x, y in flap:
            c.dot(x, y, color)
    c.outline(rgb('#3a2c10'))
    return c


def stone():
    """The Stone of Vitality (v2): a round, glossy green ball made of patches
    in several greens, as the model's texture is -- its patches are a Voronoi
    scatter here, lit from the upper left."""
    c = Canvas()
    # the greens of the model's base-colour texture (mean #118218, up to #3db83e), dark to light
    ramp = [rgb(h) for h in ('#06450c', '#0a6411', '#118218', '#1ea524', '#3db83e', '#86e592')]
    cx, cy, r = 16.0, 16.4, 13.4
    inside = ((CX - cx) ** 2 + (CY - cy) ** 2) <= r**2
    rng = np.random.default_rng(11)
    seeds = []
    while len(seeds) < 13:
        sx, sy = rng.uniform(cx - r, cx + r), rng.uniform(cy - r, cy + r)
        if (sx - cx) ** 2 + (sy - cy) ** 2 <= (r * 0.95) ** 2:
            seeds.append((sx, sy))
    seeds = np.array(seeds)
    cell = np.argmin((CX[..., None] - seeds[:, 0]) ** 2 + (CY[..., None] - seeds[:, 1]) ** 2, axis=2)
    tone = rng.choice([2, 3, 3, 4], size=len(seeds))  # each patch's own green
    # a ball lit from the upper left, in bands
    nx, ny = (CX - cx) / r, (CY - cy) / r
    nz = np.sqrt(np.clip(1 - nx**2 - ny**2, 0, 1))
    light = -0.55 * nx - 0.65 * ny + 0.55 * nz
    shift = np.where(light > 0.62, 1, np.where(light < 0.05, -1, 0))  # lit, mid, shade: three wide bands
    lit_side = light > 0.12
    level = np.clip(np.where(lit_side, tone[cell], 3) + shift, 0, 5)  # patches differ only on the lit side
    for lv in range(6):
        c.fill(inside & (level == lv), ramp[lv])
    # a seam where two patches of different greens meet, one step darker
    other_x, other_y = np.roll(cell, -1, axis=1), np.roll(cell, -1, axis=0)
    seam = ((cell != other_x) & (tone[cell] != tone[other_x])) | ((cell != other_y) & (tone[cell] != tone[other_y]))
    for y, x in zip(*np.nonzero(inside & seam & lit_side)):
        lv = max(int(level[y, x]) - 1, 0)
        c.dot(x, y, ramp[lv])
    # the glossy window reflection, and a small glint
    for x, y in [(10, 8), (11, 8), (12, 8), (9, 9), (10, 9), (9, 10)]:
        c.dot(x, y, (255, 255, 255) if (x, y) in [(10, 8), (11, 8), (9, 9)] else rgb('#c9f7d0'))
    c.dot(21, 7, rgb('#c9f7d0'))
    c.outline(rgb('#04290a'))
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


ROBE, ROBE_LIT, ROBE_DARK = '#7b4a22', '#9c6632', '#4f2d10'
SKIN_TONE, CHEEK, NOSE = '#f1c6a2', '#f3a493', '#ee9a86'
HAIR, HAIR_LO, HAIR_HI = '#dcd8d4', '#aaa6a8', '#f6f4f2'
INK = '#2a180e'
FACE = (16, 14.6, 8.4, 8.2)  # centre x, y and radii of the face


def merchant_base(c):
    """What the two merchants share: the brown hooded robe sloping off the
    shoulders, the head with its ears, the rosy nose and cheeks, and closed
    smiling eyes."""
    hood = ell(16, 31.5, 13.2, 8.0) | ell(16, 26.4, 9.6, 3.6)
    c.fill(hood, rgb(ROBE))
    c.fill(hood & (CX < 11) & (CY > 26), rgb(ROBE_LIT))
    c.fill(hood & (CX > 21) & (CY > 26), rgb(ROBE_DARK))
    c.fill(ell(16, 25.8, 9.0, 2.2) & (CY >= 24), rgb(ROBE_DARK))  # the hood's shadow behind the neck
    c.fill(ell(7.4, 15.2, 1.5, 2.0) | ell(24.6, 15.2, 1.5, 2.0), rgb(NOSE))  # ears
    face = ell(*FACE) & (CY >= 8.5)
    c.fill(face, rgb(SKIN_TONE))
    return face


def merchant_eyes(c, y=13, color=INK):
    for x0 in (10, 18):  # closed, smiling eyes
        for dx, dy in [(0, 1), (1, 0), (2, 0), (3, 0), (4, 1)]:
            c.dot(x0 + dx, y + dy, rgb(color))


def merchant_face(c):
    c.fill(ell(10.4, 17.4, 2.0, 1.5) | ell(21.6, 17.4, 2.0, 1.5), rgb(CHEEK))
    c.fill(ell(16, 16.8, 2.2, 2.0), rgb(NOSE))
    c.dot(15, 15, rgb('#f8bfae'))
    merchant_eyes(c)


def merchant_man():
    c = Canvas()
    face = merchant_base(c)
    hair = ell(16, 7.6, 11.4, 6.8) & ~(face & (CY >= 9.5))
    hair |= ell(6.2, 13.2, 2.4, 4.4) | ell(25.8, 13.2, 2.4, 4.4)  # the tufts over the ears
    hair |= ell(8.0, 6.6, 4.0, 3.4)  # swept up and to the side, as the model's is
    c.fill(hair, rgb(HAIR))
    c.fill(hair & (CX + CY < 22), rgb(HAIR_HI))
    c.fill(hair & (CX - CY > 15), rgb(HAIR_LO))
    for x, y in [(12, 3), (15, 4), (19, 4), (9, 8), (23, 6), (14, 7)]:  # strands
        c.dot(x, y, rgb(HAIR_LO))
    merchant_face(c)
    for x0 in (9, 18):  # bushy eyebrows
        c.fill((YY == 11) & (XX >= x0) & (XX <= x0 + 5), rgb(HAIR))
        c.fill((YY == 10) & (XX >= x0 + 1) & (XX <= x0 + 4), rgb(HAIR_HI))
    beard = ell(16, 22.2, 8.8, 5.6) & (CY >= 18.6)
    c.fill(beard, rgb(HAIR))
    c.fill(beard & (CY >= 25), rgb(HAIR_LO))
    c.fill(beard & (CX + CY < 33) & (CY < 25), rgb(HAIR_HI))
    c.fill(ell(16, 19.4, 5.6, 1.6), rgb(HAIR_HI))  # the moustache
    c.fill((YY == 20) & (XX >= 15) & (XX <= 16), rgb('#c8786a'))  # a hint of smile
    c.outline(rgb(INK))
    return c


def merchant_lady():
    c = Canvas()
    face = merchant_base(c)
    hair = ell(16, 9.6, 11.2, 5.6) & ~(face & (CY >= 9.5))  # lower than the man's, so the bun stands clear
    hair |= ell(6.4, 14.0, 2.2, 4.6) | ell(25.6, 14.0, 2.2, 4.6)
    bun = ell(10.6, 3.2, 4.2, 3.2)
    c.fill(hair | bun, rgb(HAIR))
    c.fill((hair | bun) & (CX + CY < 21), rgb(HAIR_HI))
    c.fill(hair & (CX - CY > 15), rgb(HAIR_LO))
    c.fill(bun & (CY > 4.4), rgb(HAIR_LO))
    c.dot(9, 2, rgb(HAIR_HI))
    for x, y in [(15, 4), (18, 5), (21, 6), (9, 9), (23, 9), (13, 7)]:
        c.dot(x, y, rgb(HAIR_LO))
    merchant_face(c)
    c.fill((YY == 20) & (XX >= 14) & (XX <= 18), rgb('#cf6f60'))  # her smile
    c.dot(13, 19, rgb('#cf6f60'))
    c.dot(19, 19, rgb('#cf6f60'))
    c.outline(rgb(INK))
    return c


def coin(c, rim, rim_hi, rim_lo, face_lo, face_hi, line, tick, outline):
    """A coin seen face-on: a raised rim with a ridged edge round a concave face,
    lit from the upper left (so the dish is shadowed there and bright opposite)."""
    cx = cy = 16.0
    r = np.sqrt((CX - cx) ** 2 + (CY - cy) ** 2)
    ang = (np.degrees(np.arctan2(CY - cy, CX - cx)) + 360) % 360
    disc = r <= 14.6
    c.fill(disc, rgb(rim))
    c.fill(disc & (r > 12.4) & (CX + CY < 31), rgb(rim_hi))     # the rim, lit
    c.fill(disc & (r > 12.4) & (CX + CY > 33), rgb(rim_lo))     # the rim, shaded
    for k in range(0, 360, 15):                                  # the ridges
        x = int(cx + 13.7 * np.cos(np.radians(k)))
        y = int(cy + 13.7 * np.sin(np.radians(k)))
        c.dot(x, y, rgb(tick))
    dish = r <= 10.8
    c.fill(dish, rgb(face_lo))                                   # the concave face
    c.fill(dish & (CX + CY > 31), rgb(face_hi))                  # bright opposite the light
    c.fill(dish & (CX + CY > 36), rgb(rim_hi))
    c.fill((r > 10.2) & (r <= 11.2) & (CX + CY < 30), rgb(line)) # the lip's inner shadow, upper left
    c.outline(rgb(outline))


def hades_coin():
    """Hades' Coin: the plain gold coin (public/models/well/rewards/gold-ld.glb)."""
    c = Canvas()
    coin(c, '#d99f38', '#f0c866', '#a8701f', '#b7822c', '#d3a04a', '#8c5c18', '#8a5a18', '#5a3608')
    for x, y in [(8, 9), (9, 8)]:
        c.dot(x, y, rgb('#fbe6a0'))
    return c


def my_ai_coin():
    """The My AI coin: a silver coin with a robot's head (public/images/my-ai-coin.png)."""
    c = Canvas()
    coin(c, '#c9ced8', '#eef1f6', '#8d94a2', '#dfe3ea', '#f6f8fb', '#9aa1ae', '#7c8493', '#3c424f')
    ink, white, grey = rgb('#14161c'), (255, 255, 255), rgb('#c4c9d4')
    c.fill((YY >= 12) & (YY <= 19) & (XX >= 11) & (XX <= 20), ink)       # the head
    c.fill((YY >= 14) & (YY <= 16) & ((XX == 9) | (XX == 10) | (XX == 21) | (XX == 22)), ink)  # the ears
    c.fill((YY >= 14) & (YY <= 15) & ((XX == 13) | (XX == 14) | (XX == 17) | (XX == 18)), white)  # the eyes
    c.fill((YY == 17) & (XX >= 13) & (XX <= 18), grey)                   # the mouth
    c.fill((YY >= 10) & (YY <= 11) & ((XX == 15) | (XX == 16)), ink)     # the antenna
    c.fill((YY == 9) & ((XX == 15) | (XX == 16)), ink)
    return c


BLIM, BLIM_LIT, BLIM_DARK, BLIM_INK, BLIM_EYE = '#ffd214', '#ffe97a', '#e1a500', '#1a1204', '#e61e28'


def blimkin():
    """Blimkin as a short, fat banana standing on end with a spike at its tip
    (Mikael, 2026-10-17): the statusline gremlin's yellow, red eyes in black
    sockets looking right, a flat black mouth, an amber underside, arms hanging
    out from the sides and two thin legs. A second try, to refine."""
    c = Canvas()
    ts = np.linspace(0, 1, 90)
    body = np.zeros((N, N), dtype=bool)
    for t in ts:  # the banana: a fat crescent, bulging to the left, leaning right at the top
        cx = 18.0 + 7.0 * (t - 0.56) - 2.0 * math.sin(math.pi * t)
        cy = 25.5 - 17.0 * t
        r = 3.4 + 4.8 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.8
        body |= ell(cx, cy, r, r * 0.95)
    c.fill(body, rgb(BLIM))
    poly(c, [(20.5, 0.5), (16.0, 9.0), (23.0, 8.0)], rgb(BLIM))      # the spike at the tip, leaning right
    line(c, [(19, 9), (21, 3)], rgb(BLIM))
    c.fill(body & (CY >= 22.5), rgb(BLIM_DARK))                      # the amber underside
    c.fill(body & (CX + CY < 21) & (CX < 14), rgb(BLIM_LIT))         # the lit left
    c.fill(body & (CX < 9.6) & (CY > 12), rgb(BLIM_LIT))
    for x0 in (10, 17):                                              # eyes: black sockets, red looking right
        c.fill((YY >= 13) & (YY <= 17) & (XX >= x0) & (XX <= x0 + 4), rgb(BLIM_INK))
        c.fill((YY >= 14) & (YY <= 16) & (XX >= x0 + 2) & (XX <= x0 + 3), rgb(BLIM_EYE))
    c.fill((YY >= 20) & (YY <= 21) & (XX >= 12) & (XX <= 20), rgb(BLIM_INK))   # the mouth
    def edge(y, left):  # the body's outermost pixel on row y
        xs = np.nonzero(body[y])[0]
        return int(xs.min() if left else xs.max())

    lx, rx = edge(20, True), edge(19, False)
    for dy in (0, 1):                                                # arms hanging out from the sides
        line(c, [(lx + 1, 20 + dy), (lx - 3, 24 + dy)], rgb(BLIM))
        line(c, [(rx - 1, 19 + dy), (rx + 3, 23 + dy)], rgb(BLIM))
    bottom = max(y for y in range(N) if body[y].any())
    bl, br = edge(bottom, True), edge(bottom, False)
    line(c, [(bl + 3, bottom - 1), (bl + 1, 31)], rgb(BLIM))         # legs
    line(c, [(br - 2, bottom - 1), (br, 31)], rgb(BLIM))
    c.outline(rgb(BLIM_INK))
    return c


def artifacts_list():
    out = {n: frog(n) for n in FROGS}
    out['cherub_v1'] = cherub()
    out['hades_coin'] = hades_coin()
    out['my_ai_coin'] = my_ai_coin()
    out['merchant_v1'] = merchant_man()
    out['lady_merchant_v1'] = merchant_lady()
    out['artifact'] = artifact()
    out['blimkin_v1'] = blimkin()
    out['pen'] = pen()
    out['paper'] = paper()
    out['stone'] = stone()
    out['wheel'] = wheel('#1c1cf0', '#e8d020', '#7a1c46')
    out['special-wheel'] = wheel('#8a18ff', '#22e022', '#a0306e')
    return out


# ------------------------------------------------------------------ v2: auras ----
# Thumbnails v2 (Mikael, 2026-10-17): every picture sits on a faint aura in its
# predominant colour, on a 40x40 canvas (the 32x32 sprite untouched in the
# middle, AURA_PAD pixels of room all round), written to public/pixel2/.

AURA_PAD = 4
V2_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'pixel2')
RAINBOW = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2']  # red lowest, purple highest

# The aura's colour: what the picture mostly is (not always the skin: silver and
# gold are shown as silver and gold; bling is ice blue; the rainbow is a rainbow).
AURA = {
    'frog_green_v1': '#86f23e', 'frog_blue_v1': '#8fd8ee', 'frog_orange_cursed_v1': '#f8be3c',
    'frog_pink_v1': '#f4a8c0', 'frog_purple_v1': '#b88cea', 'frog_red_v1': '#ff4a2e',
    'frog_yellow_v1': '#f4e060', 'frog_gold_v1': '#f2c14e', 'frog_silver_v1': '#c8ccd6',
    'frog_bling_v1': '#8fdcff', 'frog_rainbow_v2': 'rainbow', 'cherub_v1': '#fff0c0',
    'frog_robot_v1': '#9aa1ad', 'merchant_v1': '#a8682c', 'lady_merchant_v1': '#a8682c',
    'blimkin_v1': '#ffd214', 'stone': '#2fb84a', 'pen': '#dfe3ec', 'paper': '#d1aa57', 'hades_coin': '#f0b84a',
    'my_ai_coin': '#c9ced8', 'artifact': '#dcc38c', 'wheel': '#3a3af5', 'special-wheel': '#a040ff',
}


def _shift_pad(mask, dx, dy):
    """`mask` moved by (dx, dy) on a canvas, nothing wrapping round."""
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, xs = slice(max(dy, 0), h + min(dy, 0)), slice(max(dx, 0), w + min(dx, 0))
    yd, xd = slice(max(-dy, 0), h + min(-dy, 0)), slice(max(-dx, 0), w + min(-dx, 0))
    out[ys, xs] = mask[yd, xd]
    return out


def with_aura(sprite, key):
    """The 32x32 `sprite` on a faint aura: stepped rings round its outline, the last
    one a checkerboard, like a soft glow in 8 bits. Returns an RGBA array."""
    n2 = N + 2 * AURA_PAD
    arr = np.zeros((n2, n2, 4), dtype=np.uint8)
    arr[AURA_PAD : AURA_PAD + N, AURA_PAD : AURA_PAD + N] = sprite.px
    solid = arr[:, :, 3] > 0
    dist = np.full(solid.shape, np.inf)
    reach = AURA_PAD + 1
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            r = math.hypot(dx, dy)
            if 0 < r <= reach + 0.5:
                dist = np.where(_shift_pad(solid, dx, dy), np.minimum(dist, r), dist)
    yy, xx = np.mgrid[0:n2, 0:n2]
    alpha = np.zeros(solid.shape)
    alpha[dist <= 1.5] = 0.46
    alpha[(dist > 1.5) & (dist <= 2.9)] = 0.30
    alpha[(dist > 2.9) & (dist <= 4.2)] = 0.17
    alpha[(dist > 4.2) & (dist <= reach + 0.5) & ((xx + yy) % 2 == 0)] = 0.10   # the soft edge
    alpha[solid] = 0
    if AURA[key] == 'rainbow':
        alpha = np.where(alpha > 0, np.minimum(alpha * 1.7 + 0.08, 0.8), 0)  # a rainbow has to read as one
        # bands at a slight angle, rising to the right: red at the bottom, purple at the top
        height = (n2 - 1 - yy) + 0.3 * (xx - n2 / 2)
        t = (height - height.min()) / (height.max() - height.min())
        band = np.clip((t * len(RAINBOW)).astype(int), 0, len(RAINBOW) - 1)
        colour = np.array([rgb(h) for h in RAINBOW])[band]
    else:
        colour = np.broadcast_to(np.array(rgb(AURA[key])), (n2, n2, 3))
    glow = alpha > 0
    arr[glow, :3] = colour[glow]
    arr[glow, 3] = (alpha[glow] * 255).astype(np.uint8)
    if key == 'frog_bling_v1':
        # small stars and diamonds in the aura
        rng = np.random.default_rng(5)
        free = (dist > 1.5) & ~solid
        placed = 0
        for _ in range(400):
            x, y = int(rng.integers(1, n2 - 1)), int(rng.integers(1, n2 - 1))
            if placed >= 9:
                break
            cells = [(y, x), (y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)]
            if not all(free[cy, cx] for cy, cx in cells):
                continue
            # keep the stars apart
            if any(abs(x - px) + abs(y - py) < 7 for px, py in getattr(with_aura, '_stars', [])):
                continue
            with_aura._stars = getattr(with_aura, '_stars', []) + [(x, y)]
            arr[y, x] = (255, 255, 255, 235)
            tip = (200, 244, 255, 150)
            if placed % 2 == 0:       # a four-point star
                for cy, cx in cells[1:]:
                    arr[cy, cx] = tip
            placed += 1
        with_aura._stars = []
    return arr


def save_v2(arr, name):
    os.makedirs(V2_DIR, exist_ok=True)
    scale = 6
    im = Image.fromarray(arr).resize((arr.shape[1] * scale, arr.shape[0] * scale), Image.NEAREST)
    im.save(os.path.join(V2_DIR, f'{name}.png'))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', help='also write a preview sheet to this path')
    a = ap.parse_args()
    imgs = {}
    for name, canvas in artifacts_list().items():
        imgs[name] = canvas.save(f'{name}.png')
    print(f'wrote {len(imgs)} thumbnails to {os.path.relpath(OUT)}')
    with_auras = artifacts_list()
    for name, canvas in with_auras.items():
        save_v2(with_aura(canvas, name), name)
    print(f'wrote {len(with_auras)} thumbnails with auras to {os.path.relpath(V2_DIR)}')
    if a.sheet:
        cols = 5
        rows = math.ceil(len(imgs) / cols)
        sheet = Image.new('RGBA', (cols * 264, rows * 264), (36, 36, 48, 255))
        for i, im in enumerate(imgs.values()):
            sheet.alpha_composite(im, ((i % cols) * 264 + 4, (i // cols) * 264 + 4))
        sheet.convert('RGB').save(a.sheet)


if __name__ == '__main__':
    main()
