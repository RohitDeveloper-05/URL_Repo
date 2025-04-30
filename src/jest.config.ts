module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    coverageThreshold: {
        global: {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95,
        },
    },
    moduleFileExtensions: ['ts', 'mts', 'js', 'json'],
    testMatch: ['**/__tests__/**/*.+(ts|mts|js)', '**/?(*.)+(spec|test).+(ts|mts|js)'],
    transformIgnorePatterns: ['/node_modules/(?!(nanoid)/)'],
};
