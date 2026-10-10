'use client';

import { useEffect, useState } from 'react';

/** A round's messages, shown big over the page for a moment before they
 *  settle into the Round Messages list -- Tjuvpakk's, as it was. A tap on
 *  it sends it there at once (onTap). */
export default function FloatingMessage({
  message,
  onDone,
  onTap,
}: {
  message: string;
  onDone: () => void;
  onTap?: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let done: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      setVisible(false);
      done = setTimeout(onDone, 800);
    }, 2500);
    return () => {
      clearTimeout(t);
      if (done) clearTimeout(done);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per message

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-700 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
    >
      <div
        onClick={onTap}
        // Tappable only while showing: fading out, it must not catch taps
        // meant for the buttons under it.
        className={`${visible ? 'pointer-events-auto cursor-pointer' : ''} bg-gray-900 text-gray-100 px-6 py-6 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 text-center font-sans space-y-6 border-2 border-gray-600`}>
        <h3 className="font-semibold text-2xl text-gray-100">Round Messages</h3>
        <div className="text-lg sm:text-xl whitespace-pre-line">{message}</div>
      </div>
    </div>
  );
}
