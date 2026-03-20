import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore build output and dependencies
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "tailwind.config.ts",
      "dist/**",
      "build/**",
      "coverage/**",
      ".turbo/**",
      "public/**",
      "supabase/migrations/**",
    ],
  },
  // Base Next.js + TypeScript config
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Downgrade pervasive Supabase-related any types to warnings
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-vars": ["error", {
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "destructuredArrayIgnorePattern": "^_",
      }],
    },
  },
];

export default eslintConfig;
