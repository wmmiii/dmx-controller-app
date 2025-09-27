module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/src/**/*.test.js', '**/src/**/*.test.ts'],
  rootDir: '.',
  reporters: ['default'],
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@dmx-controller/proto/(.*)$': '<rootDir>/proto/generated/proto/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@dmx-controller|@bufbuild))'],
  extensionsToTreatAsEsm: ['.ts'],
};
