import { useEffect, useState } from 'react';

// The iOS shell now allows portrait as well as landscape (ios/App/App/Info.plist).
// A few HUD panels are sized against an assumed landscape width, so they
// branch on this instead of reflowing purely through CSS breakpoints.
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    setOrientation(mq.matches ? 'portrait' : 'landscape');
    const onChange = () => setOrientation(mq.matches ? 'portrait' : 'landscape');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return orientation;
}
