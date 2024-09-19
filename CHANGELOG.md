# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.1.2](https://github.com/MapColonies/overseer/compare/v1.1.1...v1.1.2) (2024-09-19)


### Bug Fixes

* change mapServerCacheType to tilesStorageProvider ([5e9e3f9](https://github.com/MapColonies/overseer/commit/5e9e3f92e983478ae8a2149a21613aae361b290c))
* chnage tilesStorageProvider Hierarchy ([6691544](https://github.com/MapColonies/overseer/commit/6691544913b61684b92cc7498ffbdb742e2df442))

### [1.1.1](https://github.com/MapColonies/overseer/compare/v1.1.0...v1.1.1) (2024-09-18)


### Bug Fixes

* remove empty lines ([2c6ffb7](https://github.com/MapColonies/overseer/commit/2c6ffb774e0a73b5d9dc0cfcf25a9738a0af117e))
* remove empty spaces ([0f60133](https://github.com/MapColonies/overseer/commit/0f6013313a3775da0e1c0f489a9087a3db9ca522))

## 1.1.0 (2024-09-18)


### Features

* adding maxAttempts config and validation ([35b027c](https://github.com/MapColonies/overseer/commit/35b027c968e679aa1b485daa3b111d3875ca04ca))
* adding support of finalize task ([b09b28b](https://github.com/MapColonies/overseer/commit/b09b28b3b9a6dd5bef46d8e5d75cac82cfcfe5fd))
* change overlap logic to feat old overseer ([b77eecd](https://github.com/MapColonies/overseer/commit/b77eecd161f8cde9a9673912052dcca06178395a))
* implementing new job init (merge tiles tasks creation) ([eee98de](https://github.com/MapColonies/overseer/commit/eee98de54efdd4abb78a010e1a7b1b0e21538a5f))
* polling loop using generator, manging job flow with jobHandler ([b2ee65f](https://github.com/MapColonies/overseer/commit/b2ee65f7d1dada54d6b7af4ff0fc037a0341a6a4))
* supporitng pino-caller ([a99e3c2](https://github.com/MapColonies/overseer/commit/a99e3c2e929c06fe9dc7d0a1600698d9c9d2ec62))
* support multiple zoom levels per part ([6aca96e](https://github.com/MapColonies/overseer/commit/6aca96e53ae3d06f9655b7275328df2506b0ba9b))


### Bug Fixes

* add types to all mock data, delete duplicate containerConfig ([d1b2ab0](https://github.com/MapColonies/overseer/commit/d1b2ab0052cde39ca20829ec308f9188813febff))
* adding tasks missing configuration ([cd1d5b9](https://github.com/MapColonies/overseer/commit/cd1d5b98c1d803e1cdb23c2c0f3c1c24e504ccc2))
* additional parameters to logs ([0a6977e](https://github.com/MapColonies/overseer/commit/0a6977e009924ac7d0a9cbefb76073afc83c94fe))
* adjust part geometry to type Polygon ([e263f56](https://github.com/MapColonies/overseer/commit/e263f56641b3ee8a1ea78f75bb026820bb48382b))
* better validation to ingestion-config ([28db713](https://github.com/MapColonies/overseer/commit/28db71397a19ffa3c3baddde8027f1e479260c8d))
* diable pr openapi check ([06fab6f](https://github.com/MapColonies/overseer/commit/06fab6fdf229e7c54258741a50d3d7aef41990aa))
* eof ([bf64d9a](https://github.com/MapColonies/overseer/commit/bf64d9a023a8ed6a15a790889411ac82a5afe308))
* eol ([eae97ae](https://github.com/MapColonies/overseer/commit/eae97aeefc63f2d4d3f12a738efa69bbf6000462))
* lint error ([ad745af](https://github.com/MapColonies/overseer/commit/ad745af6bf5d6a85e7f376261f5e070665023fd3))
* lint errors ([c1c7b9f](https://github.com/MapColonies/overseer/commit/c1c7b9f19cac54d8bf5a1dd6b3511868a4125868))
* lint errors, prittier ([66ee5c1](https://github.com/MapColonies/overseer/commit/66ee5c140c5ce40dcbf450831484f6ef6a9d7921))
* pacage-lock.json ([d79a335](https://github.com/MapColonies/overseer/commit/d79a335e61696d55d534e5cbe0b78cb37e476da4))
* pacage-lock.json ([97db0b1](https://github.com/MapColonies/overseer/commit/97db0b1f6e9704916578fa799600e5aec95b46cb))
* pr comments ([f20f81c](https://github.com/MapColonies/overseer/commit/f20f81c284e5382c75c2461aff029888452cd814))
* pr comments ([5edb019](https://github.com/MapColonies/overseer/commit/5edb019a63d2a56c107db13897f5655da4cda5e2))
* pr comments ([b777b4a](https://github.com/MapColonies/overseer/commit/b777b4adbc48d2bf11de87631d1ba3d447a3fed9))
* pr issues ([693a043](https://github.com/MapColonies/overseer/commit/693a0431c49b97d2291921f055ab5e639192cd92))
* remove pino, add additional check in test ([a29f374](https://github.com/MapColonies/overseer/commit/a29f374e9086e3accae428bb6ea687284f060d7d))
* restore catalog-info.yaml ([3dc58cf](https://github.com/MapColonies/overseer/commit/3dc58cf4bd6c7499e21c3af9e04bbd357a5a3bb2))
* service description, unnecessary server builder code,services type defenition removed ([16ba7fb](https://github.com/MapColonies/overseer/commit/16ba7fb03e649a4df3c090dcc303b6a283004808))