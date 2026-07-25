import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Plain JS/JSX files (App.jsx, Analytics.jsx, mockApi.js) get no type
    // checking from tsc (allowJs + checkJs:false), so ESLint's no-undef is
    // the only static net that catches ReferenceErrors like a re-exported
    // (not imported) binding, or a stray identifier with no declaration.
    // Both classes of bug have shipped here before - keep this rule on.
    files: ["**/*.{js,jsx}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-undef": "error",
      // js.configs.recommended's no-unused-vars is not JSX-aware (that needs
      // eslint-plugin-react's jsx-uses-vars, which isn't installed here) and
      // flags every component that is only ever referenced as <Component />.
      // no-undef above is what actually catches ReferenceError-class bugs;
      // that is the rule this block exists for.
      "no-unused-vars": "off",
    },
  },
);
