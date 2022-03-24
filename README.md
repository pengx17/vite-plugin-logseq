# vite-plugin-logseq

A Vite plugin that is essential for developing Vite plugins locally. 

It should fix the follow HMR issues for you:
- a valid index.html for local development
- reload the plugin if update is outside of your UI framework's HMR boundary 

## Install

`npm install vite-plugin-logseq`

## Change your vite.config.ts

```ts
import logseqPlugin from "vite-plugin-logseq";

// in the plugins session

plugins: [
  ...,
  logseqPlugin()
]
```

[MIT](/LICENSE) @pengx17
