module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/editor/src/**/*.test.js', '**/editor/src/**/*.test.ts'],
  rootDir: '.',
  reporters: ['default'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
};
