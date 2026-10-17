/* eslint-disable @next/next/no-img-element -- small static files from public/, shown as they are */
import { PIXEL_GROUPS, pixelUrl } from '@/components/modelling/pixelThumbnails';

/**
 * /modelling/thumbnails -- every 8-bit thumbnail in one place, next to the
 * picture it would replace, at full size and at the size of an emoji in the
 * text match. Dev only (the ".dev." page extension keeps it out of builds,
 * like /modelling). Not linked from anywhere.
 */
export default function PixelThumbnailsPage() {
  return (
    <main className="min-h-screen bg-[#070b15] text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-1">8-bit thumbnails</h1>
      <p className="text-gray-400 mb-6">
        Drawn on a 32x32 grid by scripts/pixel-thumbnails.py. New on the left, today&apos;s picture on the right (where
        there is one), then the new one at 48px and 24px. Frogs are faces only.
      </p>
      {PIXEL_GROUPS.map((group) => (
        <section key={group.title} className="mb-10">
          <h2 className="text-xl font-semibold mb-3">{group.title}</h2>
          <div className="flex flex-wrap gap-4">
            {group.items.map((it) => (
              <figure key={it.id} className="bg-gray-900 border border-white/10 rounded-xl p-3 w-72">
                <div className="flex items-center gap-3">
                  <img
                    src={pixelUrl(it.id)}
                    alt={it.label}
                    width={128}
                    height={128}
                    style={{ imageRendering: 'pixelated' }}
                  />
                  {it.was ? (
                    <img src={it.was} alt={`${it.label}, today`} width={96} height={96} className="opacity-90 object-contain" />
                  ) : (
                    <span className="text-xs text-gray-500">no picture today (3D model)</span>
                  )}
                </div>
                <div className="flex items-end gap-3 mt-2">
                  <img src={pixelUrl(it.id)} alt="" width={48} height={48} style={{ imageRendering: 'pixelated' }} />
                  <img src={pixelUrl(it.id)} alt="" width={24} height={24} style={{ imageRendering: 'pixelated' }} />
                  <figcaption className="text-sm text-gray-300 ml-auto text-right">{it.label}</figcaption>
                </div>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
