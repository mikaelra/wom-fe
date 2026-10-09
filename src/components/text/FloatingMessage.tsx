'use client';

import { useEffect, useState } from 'react';

/** A round's messages, shown big over the page for a moment before they
 *  settle into the Round Messages list -- Tjuvpakk's, as it was. */
export default function FloatingMessage({ message, onDone }: { message: string; onDone: () => void }) {
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
      <div className="bg-white text-gray-700 px-6 py-6 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 text-center font-sans space-y-6 border-2 border-gray-300">
        <h3 className="font-semibold text-2xl text-gray-800">Round Messages</h3>
        <div className="text-lg sm:text-xl whitespace-pre-line">{message}</div>
      </div>
    </div>
  );
}
