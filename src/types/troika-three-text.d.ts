// troika-three-text (drei's <Text> dependency) ships no type declarations.
// Only the one export this codebase calls directly (DamageNumberEffect's
// module-load preloadFont) is declared here -- see TroikaTextRef in
// DamageNumberEffect.tsx for the same "type locally, don't pull in `any`"
// approach applied to the ref shape.
declare module 'troika-three-text' {
  export function preloadFont(
    options: { font?: string; characters?: string; sdfGlyphSize?: number },
    callback: () => void,
  ): void;
}
