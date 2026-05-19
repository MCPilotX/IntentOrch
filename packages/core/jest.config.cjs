/** @type {import('jest').Config} */
const path = require('path');
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/../../tests/core'],
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
    '^(.*)\.cjs$': '$1.cjs',
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  cache: false,
};
module.exports = config;
