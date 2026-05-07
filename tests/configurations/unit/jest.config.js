module.exports = {
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
  coverageReporters: ['text', 'html'],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!*/node_modules/',
    '!/vendor/**',
    '!*/common/**',
    '!**/controllers/**',
    '!**/routes/**',
    '!<rootDir>/src/*',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/src/utils/metrics/taskMetrics.ts',
    '<rootDir>/src/utils/url.ts',
    '<rootDir>/src/task/models/deletionTaskManager.ts', // ignore until tests will be added
    '<rootDir>/src/utils/reportUtil.ts', // ignore until tests will be added
  ],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/utils/metrics/taskMetrics.ts',
    '<rootDir>/src/utils/url.ts',
    '<rootDir>/src/task/models/deletionTaskManager.ts', // ignore until tests will be added
    '<rootDir>/src/utils/reportUtil.ts', // ignore until tests will be added
  ],
  coverageDirectory: '<rootDir>/coverage',
  reporters: [
    'default',
    ['jest-html-reporters', { multipleReportsUnitePath: './reports', pageTitle: 'unit', publicPath: './reports', filename: 'unit.html' }],
  ],
  setupFilesAfterEnv: ['jest-extended/all'],
  rootDir: '../../../.',
  setupFiles: ['<rootDir>/tests/configurations/jest.setup.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -32, //will be reverted to 15 once tests added
    },
  },
};
