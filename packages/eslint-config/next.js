import { globalIgnores } from "eslint/config";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import pluginNext from "@next/eslint-plugin-next";
import { config as baseConfig } from "./base.js";

/**
 * A custom ESLint configuration for libraries that use Next.js.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nextJsConfig = [
  ...baseConfig,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
  pluginReactHooks.configs.flat.recommended,
  {
    rules: {
      // Our pages load data in an effect and set loading/data state there --
      // the standard pattern for client-fetched pages; this React 19 rule
      // flags every one of them without finding real bugs.
      "react-hooks/set-state-in-effect": "off",
      // The socket hooks keep the latest handlers in a ref on purpose
      // ("latest ref" pattern) so re-renders never reconnect the socket.
      "react-hooks/refs": "off",
      // Date.now() in render is only used for "N days left" labels.
      "react-hooks/purity": "off",
      // Images are user uploads served by the API (logos, menu photos);
      // next/image would need every API host configured at build time.
      "@next/next/no-img-element": "off",
    },
  },
];
