/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        strict: false,
        noImplicitAny: false,
      },
      diagnostics: false,
    }],
  },
  moduleNameMapper: {
    // .cjs rule must be BEFORE .js to take precedence for CJS files in node_modules
    '^(.*)\.cjs$': '$1.cjs',
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  cache: false,
};
module.exports = config;
