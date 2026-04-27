/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        strict: false,
        noImplicitAny: false,
      },
    }],
  },
  moduleNameMapper: {
    '^sqlite-vss$': '<rootDir>/src/__mocks__/sqlite-vss.ts',
    '^better-sqlite3$': '<rootDir>/src/__mocks__/better-sqlite3.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(sqlite-vss|better-sqlite3)/)',
  ],
  cache: false,
};

module.exports = config;
