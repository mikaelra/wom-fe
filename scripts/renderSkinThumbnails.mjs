#!/usr/bin/env node
/**
 * Regenerates public/skins/thumbnails/<skin>.png -- the head-and-shoulders
 * icon shown on each inventory skin card (src/lib/frogSkins.ts's
 * skinThumbnailUrl()). Re-run this after adding a new skin or changing a
 * model, then commit the updated PNGs.
 *
 * Renders through a temporary Next.js page (this app's own react-three-fiber
 * setup, same lighting/fitting approach as SpinningModelViewer) rather than
 * a standalone three.js script, so the thumbnail matches how the model
 * actually looks elsewhere in the app -- material/texture handling is
 * R3F's, not hand-rolled. The page is written to src/app/dev/skin-thumbnail/
 * for the duration of this run and deleted again at the end; nothing is
 * left behind in src/ between runs.
 *
 * Requires:
 *   - The dev server running and reachable at http://localhost:3000
 *     (docker-compose's game_frontend, or `npm run dev` locally).
 *   - A Chromium binary Playwright can drive. Tries Playwright's own
 *     bundled browser first; if that isn't installed (common in a minimal
 *     container -- `npx playwright install chromium --with-deps` needs
 *     apt, which isn't available on Alpine), falls back to a system
 *     `chromium` binary (`apk add chromium` on Alpine) launched with the
 *     software-GL flags this environment needed to get WebGL working at
 *     all in headless mode (see the flags below -- ANGLE's default
 *     Vulkan/SwiftShader path fails without a real display; `gl-egl` +
 *     `--ignore-gpu-blocklist` is what actually renders here).
 *
 *   node scripts/renderSkinThumbnails.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SKINS = [
  'frog_green_v1', 'frog_blue_v1', 'frog_orange_cursed_v1', 'frog_pink_v1',
  'frog_purple_v1', 'frog_red_v1', 'frog_yellow_v1',
  'frog_silver_v1', 'frog_gold_v1', 'frog_rainbow_v2', 'frog_bling_v1',
  'cherub_v1',
];

const OUT_DIR = 'public/skins/thumbnails';
const FINAL_SIZE = 256;
// Tuned by eye against every skin above (see PR description for a contact
// sheet) -- a single shared framing, not per-skin, so a newly added skin
// needs no manual tuning to get a reasonable result.
const FRAME_PARAMS = { distance: '1.7', camY: '0', lookY: '0.2', yaw: '0' };
const DEV_PAGE_DIR = 'src/app/dev/skin-thumbnail';
const DEV_PAGE_PATH = path.join(DEV_PAGE_DIR, 'page.tsx');

const DEV_PAGE_SOURCE = `'use client';

// Generated temporarily by scripts/renderSkinThumbnails.mjs -- deleted
// again once that script finishes. If you're seeing this file at rest,
// a previous run was interrupted; it's safe to delete src/app/dev/.
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSearchParams } from 'next/navigation';
import { skinUrl } from '@/lib/frogSkins';

const FOV = 35;

function FittedHead({ url, targetSize, lookY, yawDeg }) {
  const { scene } = useGLTF(url);

  const fittedScene = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    clone.scale.setScalar(scale);
    // Shift the model down by lookY instead of moving the camera's look
    // target -- R3F resets an imperatively-set camera.lookAt() back to the
    // origin on re-render (its default target with no controls attached),
    // so the camera always effectively looks at (0,0,0); moving the model
    // is what actually re-frames it.
    clone.position.set(-center.x * scale, -center.y * scale - lookY, -center.z * scale);
    clone.rotation.y = (yawDeg * Math.PI) / 180;
    return clone;
  }, [scene, targetSize, yawDeg, lookY]);

  return <primitive object={fittedScene} />;
}

export default function SkinThumbnailPage() {
  const params = useSearchParams();
  const skin = params.get('skin') ?? 'frog_green_v1';
  const targetSize = Number(params.get('targetSize') ?? '1.1');
  const lookY = Number(params.get('lookY') ?? '0.3');
  const camY = Number(params.get('camY') ?? '0.3');
  const distance = Number(params.get('distance') ?? '1.2');
  const yawDeg = Number(params.get('yaw') ?? '20');
  const url = skinUrl(skin);

  return (
    <div style={{ width: '512px', height: '512px' }}>
      <Canvas
        camera={{ position: [0, camY, distance], fov: FOV }}
        dpr={1}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        {/* Boosted well past SpinningModelViewer's ambient=0.5/directional=2.4 --
            metallic skins (silver, gold) render almost black under that lighting
            with no environment map to reflect (confirmed: SpinningModelViewer
            itself renders them just as dark, so this isn't a regression, just
            not good enough for a small at-a-glance icon that needs to read as
            "silver" or "gold" from color alone). */}
        <ambientLight intensity={2.6} />
        <directionalLight position={[3, 1, 1.5]} intensity={2.4} />
        <directionalLight position={[-3, 2, 1.5]} intensity={1.6} />
        <directionalLight position={[0, -1, 2]} intensity={1} />
        <directionalLight position={[0, 3, -2]} intensity={1.2} />
        <Suspense fallback={null}>
          <FittedHead url={url} targetSize={targetSize} lookY={lookY} yawDeg={yawDeg} />
        </Suspense>
      </Canvas>
    </div>
  );
}
`;

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const executablePath = candidates.find((p) => fs.existsSync(p));
    if (!executablePath) {
      throw new Error(
        'No usable Chromium found. Run `npx playwright install chromium`, or ' +
        '(Alpine) `apk add chromium` so one of ' + candidates.join(', ') + ' exists.',
      );
    }
    return chromium.launch({
      executablePath,
      headless: true,
      args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--ignore-gpu-blacklist', '--no-sandbox'],
    });
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DEV_PAGE_DIR, { recursive: true });
fs.writeFileSync(DEV_PAGE_PATH, DEV_PAGE_SOURCE);

// Give the dev server a moment to notice and compile the new page before
// the first navigation -- otherwise the first render can race a still-in-
// flight Fast Refresh compile and come back blank (confirmed empirically:
// networkidle + a fixed timeout both proved unreliable against the dev
// server's always-in-flight HMR websocket).
await new Promise((r) => setTimeout(r, 3000));

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

  for (const skin of SKINS) {
    const params = new URLSearchParams({ skin, ...FRAME_PARAMS });
    const url = `http://localhost:3000/dev/skin-thumbnail?${params.toString()}`;

    let dataLen = 0;
    for (let attempt = 0; attempt < 5 && dataLen < 20000; attempt++) {
      await page.goto(url, { waitUntil: 'load' });
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(300);
        dataLen = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          return c ? c.toDataURL('image/png').length : 0;
        });
        if (dataLen > 20000) break;
      }
    }
    if (dataLen < 20000) {
      throw new Error(`${skin}: canvas never produced real content (got ${dataLen} bytes) -- is the dev server up?`);
    }

    // Read the canvas's raw pixel buffer directly, rather than a Playwright
    // element screenshot -- that composites over the page's opaque white
    // background, silently flattening the alpha channel the WebGL context
    // actually has (gl: { alpha: true }), which we want to keep so the
    // existing skinColor() circle shows through any transparent margin.
    const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    const rawPng = Buffer.from(dataUrl.split(',')[1], 'base64');

    const outPath = path.join(OUT_DIR, `${skin}.png`);
    await sharp(rawPng).resize(FINAL_SIZE, FINAL_SIZE).toFile(outPath);
    console.log(`${skin} -> ${outPath}`);
  }
} finally {
  await browser.close();
  fs.rmSync(DEV_PAGE_DIR, { recursive: true, force: true });
  // Drop the now-empty src/app/dev/ too, but only if nothing else is using
  // it -- this script owns skin-thumbnail/, not the whole dev/ directory.
  const devDir = path.dirname(DEV_PAGE_DIR);
  if (fs.existsSync(devDir) && fs.readdirSync(devDir).length === 0) fs.rmdirSync(devDir);
}
