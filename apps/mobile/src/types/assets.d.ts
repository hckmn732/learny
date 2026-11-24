// Static asset modules understood by Metro (fonts, images). TypeScript needs the declarations so
// that `import font from '…ttf'` is a number (an asset identifier), not an error.
declare module '*.ttf' {
  const asset: number;
  export default asset;
}

declare module '*.otf' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}
