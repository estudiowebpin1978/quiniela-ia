import type { Config } from "jest"

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2020",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          paths: { "@/*": ["./*"] },
          baseUrl: ".",
          strict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/"],
  setupFiles: ["<rootDir>/__tests__/__mocks__/setup.ts"],
}

export default config
