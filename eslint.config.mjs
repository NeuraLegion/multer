import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import nPlugin from "eslint-plugin-n";
import promisePlugin from "eslint-plugin-promise";
import globals from "globals";

export default [
  js.configs.recommended,

  {
    files: ["lib/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },

    plugins: {
      import: importPlugin,
      n: nPlugin,
      promise: promisePlugin,
    },

    rules: {
      // StandardJS-like style
      semi: ["error", "never"],
      quotes: ["error", "single"],
      indent: ["error", 2, { SwitchCase: 1 }],
      "comma-dangle": ["error", "never"],
      "no-trailing-spaces": "error",
      "space-before-function-paren": ["error", "always"],
      "eol-last": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",

      // Node library best practices
      "n/no-deprecated-api": "error",
      "n/no-missing-require": "error",
      "n/shebang": "off",
    },
  },

  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },

    plugins: {
      import: importPlugin,
      n: nPlugin,
      promise: promisePlugin,
    },

    rules: {
      // StandardJS-like style
      semi: ["error", "never"],
      quotes: ["error", "single"],
      indent: ["error", 2, { SwitchCase: 1 }],
      "comma-dangle": ["error", "never"],
      "no-trailing-spaces": "error",
      "space-before-function-paren": ["error", "always"],
      "eol-last": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",

      // Node library best practices
      "n/no-deprecated-api": "error",
      "n/no-missing-require": "error",
      "n/shebang": "off",
    },
  },
];
