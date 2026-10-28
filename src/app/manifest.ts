import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Readfox',
    short_name: 'Readfox',
    description:
      'Read books and articles in the language you are learning. Tap a sentence and AI explains it.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    // Matches --background in globals.css (light theme).
    background_color: '#f3eee3',
    theme_color: '#f3eee3',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
