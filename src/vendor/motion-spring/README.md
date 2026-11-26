# Motion spring generator

Source: [Motion](https://github.com/motiondivision/motion), distributed under the attached MIT license.

This bundle exposes only the upstream spring generator. It was built with esbuild 0.25.12 from motion-dom 14.14.0 and motion-utils 14.7.0, whose npm release integrity hashes were verified.

To reproduce it, install those exact packages in a temporary project, set the entry point to `export { spring } from "./node_modules/motion-dom/dist/es/animation/generators/spring.mjs";`, then bundle it as browser ESM with esbuild, target ES2022 and define `process.env.NODE_ENV` as `"production"`.
