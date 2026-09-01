import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  AVATAR_RENDER_ORDER,
  DEAD_OPACITY,
  GHOST_OPACITY,
  applyFade,
} from '@/lib/avatarFade';

function meshTree() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: '#ff0000' }),
  );
  root.add(mesh);
  return { root, mesh };
}

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.Material;

describe('applyFade', () => {
  it('leaves a living player untouched', () => {
    const { root, mesh } = meshTree();
    const before = materialOf(mesh);

    applyFade(root, { isDead: false, isGhost: false });

    expect(materialOf(mesh)).toBe(before);
    expect(materialOf(mesh).transparent).toBe(false);
  });

  it('fades and greys a dead player', () => {
    const { root, mesh } = meshTree();

    applyFade(root, { isDead: true });

    expect(materialOf(mesh).opacity).toBe(DEAD_OPACITY);
    expect(materialOf(mesh).transparent).toBe(true);
    expect(materialOf(mesh).depthWrite).toBe(false);
    // The grey wash is a shader hook, not a colour swap -- it must keep the
    // player's own texture rather than flattening it.
    expect(materialOf(mesh).onBeforeCompile).toBeTypeOf('function');
  });

  it('fades a spectator thinner, and does NOT grey them', () => {
    const { root, mesh } = meshTree();

    applyFade(root, { isGhost: true });

    expect(materialOf(mesh).opacity).toBe(GHOST_OPACITY);
    expect(GHOST_OPACITY).toBeLessThan(DEAD_OPACITY);
    // A spectator is not dead, so no death treatment. An untouched
    // onBeforeCompile is three's own no-op default.
    expect(materialOf(mesh).onBeforeCompile.toString()).not.toContain('mix(');
  });

  it('treats a spectator as a ghost even if isDead is also set', () => {
    const { root, mesh } = meshTree();

    applyFade(root, { isDead: true, isGhost: true });

    expect(materialOf(mesh).opacity).toBe(GHOST_OPACITY);
  });

  it('clones the material instead of mutating the shared one', () => {
    // scene.clone() shares materials between instances, so fading one player
    // would otherwise fade every player wearing the same skin.
    const { root, mesh } = meshTree();
    const shared = materialOf(mesh);

    applyFade(root, { isDead: true });

    expect(materialOf(mesh)).not.toBe(shared);
    expect(shared.opacity).toBe(1);
    expect(shared.transparent).toBe(false);
  });

  it('restores the original material when a player comes back', () => {
    const { root, mesh } = meshTree();
    const original = materialOf(mesh);

    applyFade(root, { isDead: true });
    applyFade(root, { isDead: false });

    expect(materialOf(mesh)).toBe(original);
  });

  it('reapplying the fade never stacks clones off an already-faded material', () => {
    const { root, mesh } = meshTree();
    const original = materialOf(mesh);

    applyFade(root, { isDead: true });
    applyFade(root, { isGhost: true });

    // The second pass must derive from the stashed original, not from the
    // faded clone -- otherwise opacity would compound toward invisible.
    expect(materialOf(mesh).opacity).toBe(GHOST_OPACITY);
    expect(mesh.userData.origMaterial).toBe(original);
  });

  it('ignores non-mesh objects in the tree', () => {
    const root = new THREE.Group();
    root.add(new THREE.Object3D());

    expect(() => applyFade(root, { isDead: true })).not.toThrow();
  });
});

describe('AVATAR_RENDER_ORDER', () => {
  it('is shared so a cosmetic sorts with the body it stands beside', () => {
    expect(AVATAR_RENDER_ORDER).toBe(10);
  });
});
