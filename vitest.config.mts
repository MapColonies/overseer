import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@map-colonies/raster-shared': '@map-colonies/raster-shared/dist/index.js',
      '@map-colonies/shapefile-reader': '@map-colonies/shapefile-reader/dist/index.js',
    },
    conditions: ['require'],
  },
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          setupFiles: ['./tests/configurations/vite.setup.ts'],
          include: ['tests/unit/**/*.spec.ts'],
          environment: 'node',
          server: {
            deps: {
              inline: ['@map-colonies/raster-shared', '@map-colonies/shapefile-reader', '@map-colonies/mc-priority-queue', 'ogr2ogr', 'config'],
            },
          },
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          setupFiles: ['./tests/configurations/vite.setup.ts'],
          include: ['tests/integration/**/*.spec.ts'],
          environment: 'node',
          server: {
            deps: {
              inline: ['@map-colonies/raster-shared', '@map-colonies/shapefile-reader', '@map-colonies/mc-priority-queue', 'ogr2ogr', 'config'],
            },
          },
        },
      },
    ],
    coverage: {
      enabled: true,
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/vendor/**',
        'node_modules/**',
        'src/utils/metrics/taskMetrics.ts',
        'src/utils/url.ts',
        'src/task/models/deletionTaskManager.ts',
        'src/utils/reportUtil.ts',
      ],
      reportOnFailure: true,
      thresholds: {
        global: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
