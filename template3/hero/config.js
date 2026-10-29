// Identity, media paths and expression timing for the intro hero.
// Edit here; no build step is required for personal copy or motion settings.
export const config = {
  person: {
    name: 'Aloysius Ting Zi Heng',
    title: 'Developer · Curious maker',
    description: 'Machine Learning · AI Engineer · Computer Vision · NLP Architecture · AI Tools Developer · Deep Learning',
    about: 'I turn practical problems into AI-powered prototypes, connecting data, models and interfaces through experimentation and iteration.',
    github: 'https://github.com/Aloysius8895',
  },
  media: {
    // Every source frame is predecoded; pointer interaction never seeks a video.
    heroPoster: '/hero/assets/final-atlas/poster.webp',
    atlasManifest: '/hero/assets/final-atlas/manifest.json',
    fps: 24,
  },
  motion: {
    followSmoothingMs: 180,
    followMaxFramesPerSecond: 72,
    // Eye/face center in the cropped, contained 640px square portrait.
    expressionArea: { centerX: .45, centerY: .58, width: .9, height: .9,
      frameWidth: 640, frameHeight: 640, fit: 'contain' },
    // Scroll distance, in screen heights, from the intro to the discs.
    // A gesture that stops part-way settles at the end it was heading for.
    scrollScreens: 1.1,
  },
  expressionMap: {
    center: { label: 'Wink', icon: '☺', start: 0, time: .5, sample: '/hero/assets/final-atlas/poster.webp' },
    left: { label: 'Laughing', icon: '↙', start: 39 / 24, time: 2.5, sample: '/hero/assets/final/left-end.webp' },
    down: { label: 'Sleepy', icon: 'z', start: 77 / 24, time: 4.5, sample: '/hero/assets/final/down-end.webp' },
    right: { label: 'Dizzy', icon: '✲', start: 136 / 24, time: 6.7, sample: '/hero/assets/final/right-end.webp' },
    up: { label: 'Playful', icon: '↗', start: 196 / 24, time: 9.4, sample: '/hero/assets/final/up-end.webp' },
  },
};
