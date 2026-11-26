export const presets = {
  static: { outputDirectory: '.', buildCommand: '', dynamic: false },
  vite: { outputDirectory: 'dist', buildCommand: 'npm run build', dynamic: false },
  react: { outputDirectory: 'build', buildCommand: 'npm run build', dynamic: false },
  vue: { outputDirectory: 'dist', buildCommand: 'npm run build', dynamic: false },
  angular: { outputDirectory: 'dist', buildCommand: 'npm run build', dynamic: false },
  astro: { outputDirectory: 'dist', buildCommand: 'npm run build', dynamic: false },
  svelte: { outputDirectory: 'build', buildCommand: 'npm run build', dynamic: false },
  'next-static': { outputDirectory: 'out', buildCommand: 'npm run build', dynamic: false },
  next: { outputDirectory: '.next', buildCommand: 'npm run build', dynamic: true },
  nuxt: { outputDirectory: '.output', buildCommand: 'npm run build', dynamic: true },
  node: { outputDirectory: '.', buildCommand: '', dynamic: true },
} as const;
export type Framework = keyof typeof presets;
export { detectFramework } from './plan.js';
export type { FrameworkPlan, DatabasePlan, PackageManager } from './plan.js';
