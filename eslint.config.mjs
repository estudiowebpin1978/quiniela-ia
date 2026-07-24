import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "logs/**",
      "modelos_exportados/**",
      "ml-backend/**",
    ],
    rules: {
      "@next/next/no-page-custom-font": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
