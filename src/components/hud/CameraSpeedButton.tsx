'use client';

import { CAMERA_SPEEDS, setCameraSpeed, useCameraSpeed } from '@/lib/cameraSpeed';
import ExpandingChoice from '@/components/hud/ExpandingChoice';

// With the sound buttons on the Earth scene (Mikael, 2026-10-11): how fast
// the camera turns round the Earth (lib/cameraSpeed.ts). A round button
// showing the speed -- "1x" -- that widens to 1x, 2x, 4x and 8x
// (ExpandingChoice), as the graphics quality button does.

export default function CameraSpeedButton() {
  const speed = useCameraSpeed();
  return (
    <ExpandingChoice
      label="Camera speed"
      value={speed}
      choices={CAMERA_SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
      onChoose={setCameraSpeed}
      className="bg-black/30 hover:bg-black/50 backdrop-blur-sm border border-white/15"
    />
  );
}
