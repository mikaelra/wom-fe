import { useEffect, useState } from 'react';

// Lifted out of WheelSpinModal.tsx so TradeUpModal's golden-arrow pulse
// (docs/TRADE_UP_PLAN.md §8.3) can share it instead of duplicating the
// media-query wiring.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
