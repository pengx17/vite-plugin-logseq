# vite-plugin-logseq

A Vite plugin that is essential for developing Vite plugins locally. 

It should fix the follow HMR issues for you:
- a valid index.html for local development
- reload the plugin and Logseq page on HMR update

## Install

`npm install vite-plugin-logseq`

## Change your vite.config.ts

```ts
import logseqPlugin from "vite-plugin-logseq";

// in the plugins session:

plugins: [
  ...,
  logseqDevPlugin({
    entry: 'src/main.ts' // the main entrypoint file which imports everything and loads the plugin
  }),
]
```

[MIT](/LICENSE) @pengx17
