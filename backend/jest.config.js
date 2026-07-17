module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        ...require('./tsconfig.json').compilerOptions,
        types: ['node', 'jest'],
        skipLibCheck: true,
      },
      diagnostics: false,
    }],
  },
  testEnvironment: 'node',
};
