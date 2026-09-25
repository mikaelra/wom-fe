import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react-hooks v7's "recommended" preset enables the full
    // React Compiler rule set. This app doesn't use the compiler, and these
    // rules flag the standard react-three-fiber pattern of mutating Three.js
    // objects inside useFrame/useMemo as errors. Keep the two hook rules that
    // catch real bugs regardless of the compiler; drop the compiler-readiness
    // ones.
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/static-components": "off",
      "react-hooks/component-hook-factories": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/globals": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/unsupported-syntax": "off",
      // Stale-closure bugs in the socket effects are this codebase's most
      // likely runtime failure (see docs/CODEBASE_HARDENING_PLAN.md) --
      // was "warn" by default; enforced as an error from Phase 0 on.
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // The Electron shell (docs/MOBILE_AND_STEAM_PLAN.md §10) is a Node
    // CommonJS program, not part of the Next bundle -- require() is the
    // correct module system there, so the repo-wide ban on it doesn't apply.
    files: ["electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Vendored third-party assets (e.g. the Draco decoder), not app source.
      "public/**",
    ],
  },
];

export default eslintConfig;
