'use client';

import { forwardRef, ReactNode } from 'react';
import { rem } from '@/lib/uiScale';

const LD_IMAGE = '/models/buttons/rope_button-ld-v2.png';

type RopedInputProps = {
  width?: number;
  height?: number;
  /** Inset of the inner content area from the canvas edges so it sits inside
   *  the rope frame. CSS padding shorthand. */
  innerPadding?: string;
  children: ReactNode;
};

const RopedInput = forwardRef<HTMLDivElement, RopedInputProps>(function RopedInput(
  { width = 220, height = 70, innerPadding = '0.875rem 4.375rem', children },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative inline-block select-none"
      style={{ width: rem(width), height: rem(height) }}
    >
      <img
        src={LD_IMAGE}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ padding: innerPadding }}
      >
        {children}
      </div>
    </div>
  );
});

export default RopedInput;
