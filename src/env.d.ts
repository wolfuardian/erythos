/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __GIT_HASH__: string;
declare const __BUILD_DATE__: string;

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
