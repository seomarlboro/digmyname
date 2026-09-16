// Ambient type declarations for deep imports into react-syntax-highlighter.
// The package ships no `exports` map or types; Vite resolves these paths at
// build time, and these declarations satisfy typecheckers (tsc, Deno).
declare module "react-syntax-highlighter/dist/esm/styles/prism/index.js" {
  export const vscDarkPlus: { [key: string]: import("react").CSSProperties };
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/bash" {
  const grammar: unknown;
  export default grammar;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/json" {
  const grammar: unknown;
  export default grammar;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/javascript" {
  const grammar: unknown;
  export default grammar;
}
declare module "react-syntax-highlighter/dist/esm/languages/prism/python" {
  const grammar: unknown;
  export default grammar;
}
