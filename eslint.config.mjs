import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "logs/**",
    ],
    rules: {
      "@next/next/no-page-custom-font": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
