import type { MetadataRoute } from 'next';

// Lets the Hub be added to a phone's home screen and open like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Upper Assendon Farm Hub',
    short_name: 'Farm Hub',
    description: 'M J Hunt & Son — farm management',
    start_url: '/#myday',
    display: 'standalone',
    background_color: '#fafaf7',
    theme_color: '#2d5a27',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
