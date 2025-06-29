# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.2.0](https://github.com/MapColonies/overseer/compare/v2.1.1...v2.2.0) (2025-06-24)


### Features

* support single responsibility instance deployment (MAPCO-7967) ([#59](https://github.com/MapColonies/overseer/issues/59)) ([d4a4444](https://github.com/MapColonies/overseer/commit/d4a4444ba1600df01a2cddc77d62e193e0a43c71))

### [2.1.1](https://github.com-personal/MapColonies/overseer/compare/v2.1.0...v2.1.1) (2025-06-22)


### Bug Fixes

* productName in seed job ([88391ec](https://github.com-personal/MapColonies/overseer/commit/88391ec677f8ea950009d780a1c5e302bf80742c))

## [2.1.0](https://github.com-personal/MapColonies/overseer/compare/v2.0.3...v2.1.0) (2025-06-19)


### Features

* add clean mod to update and separate zoom levels ([2a4e817](https://github.com-personal/MapColonies/overseer/commit/2a4e81705e7df86235981706be54d9401edf2eb7))
* add seperation to clean tasks ([7e56207](https://github.com-personal/MapColonies/overseer/commit/7e56207bdb5959d3f05e2ec5d028583df56510f9))
* added tests ([d428a54](https://github.com-personal/MapColonies/overseer/commit/d428a5438dbab47d8e5fc6d165b7f4a05d3a2c06))


### Bug Fixes

* pr ([a5aa57d](https://github.com-personal/MapColonies/overseer/commit/a5aa57da52704b4eaf2ea52f1c674cbf8667f837))
* pr changes ([defaf7a](https://github.com-personal/MapColonies/overseer/commit/defaf7af240bb4ffe9d0a3adbe5787fa57c64298))
* pr changes ([1bd5f84](https://github.com-personal/MapColonies/overseer/commit/1bd5f841cac34ccf5cf852a01486bce80c05816a))
* pr changes ([abb92db](https://github.com-personal/MapColonies/overseer/commit/abb92db5bd2291d7fe2b2057eacafb7dddce0f11))
* remove ternary ([4cd053c](https://github.com-personal/MapColonies/overseer/commit/4cd053caa79aa1ece86c05fba388816fd9d2d0d8))
* return type never ([8b4f7b2](https://github.com-personal/MapColonies/overseer/commit/8b4f7b2ad31562ce7a932611014c5bf074f7624b))
* revert to one clean task ([f3c019d](https://github.com-personal/MapColonies/overseer/commit/f3c019db71ea49d329efeca1205ece1537938c38))
* tests ([2ace7e6](https://github.com-personal/MapColonies/overseer/commit/2ace7e6b42161e0c7ed1f5f74a30419bdf7d4fbd))

### [2.0.3](https://github.com/MapColonies/overseer/compare/v2.0.2...v2.0.3) (2025-06-05)


### Bug Fixes

* Send ingestion date on request (MAPCO-7846) ([#57](https://github.com/MapColonies/overseer/issues/57)) ([bf7e94e](https://github.com/MapColonies/overseer/commit/bf7e94e263b32a7fcaaae0e6e9abd7fec5d19ba8))

### [2.0.2](https://github.com/MapColonies/overseer/compare/v2.0.1...v2.0.2) (2025-05-18)


### Bug Fixes

* callbacks sending in export finalize ([#56](https://github.com/MapColonies/overseer/issues/56)) ([48194d5](https://github.com/MapColonies/overseer/commit/48194d5d7e9f5accc6762127ea7d6ced4b1ee8ad))

### [2.0.1](https://github.com/MapColonies/overseer/compare/v2.0.0...v2.0.1) (2025-05-14)


### Bug Fixes

* **seeding-job:** reverted producer name to check for undefinied if null value ([#55](https://github.com/MapColonies/overseer/issues/55)) ([3536c3a](https://github.com/MapColonies/overseer/commit/3536c3a81737004bf3c1009b8673eb6f08920ce6))

## [2.0.0](https://github.com/MapColonies/overseer/compare/v1.9.0...v2.0.0) (2025-05-13)


### ⚠ BREAKING CHANGES

* JSON file handling and multi-file upload support (#54)

### Features

* JSON file handling and multi-file upload support ([#54](https://github.com/MapColonies/overseer/issues/54)) ([f385533](https://github.com/MapColonies/overseer/commit/f3855337d1e2fbd713716c9be942dc7a65588575))

## [1.9.0](https://github.com/MapColonies/overseer/compare/v1.8.1...v1.9.0) (2025-05-07)


### Features

* add featureCollection filter to aggregation and getAggregation metadata in export process ([#51](https://github.com/MapColonies/overseer/issues/51)) ([6dea8f7](https://github.com/MapColonies/overseer/commit/6dea8f7d9c32f37ab4efbe4ed926e83c5e35db68))
* implement multi ‘tilesSeeding’ tasks creation upon ingestion updates(MAPCO-5747) ([#52](https://github.com/MapColonies/overseer/issues/52)) ([8a7bd85](https://github.com/MapColonies/overseer/commit/8a7bd853fd6fbdcafc4f262c8754129a900d304a))

### [1.8.1](https://github.com/MapColonies/overseer/compare/v1.8.0...v1.8.1) (2025-03-30)


### Bug Fixes

* update @map-colonies/raster-shared to version 1.9.1 ([#50](https://github.com/MapColonies/overseer/issues/50)) ([45dcd78](https://github.com/MapColonies/overseer/commit/45dcd78862974d04881f54beb7c5276692a6ae7a))

## [1.8.0](https://github.com/MapColonies/overseer/compare/v1.7.4...v1.8.0) (2025-03-27)


### Features

* Add Export Job Type Support to Polling Worker(MAPCO-5959) ([#43](https://github.com/MapColonies/overseer/issues/43)) ([554b419](https://github.com/MapColonies/overseer/commit/554b4195d34f649d362da16f088cff6cb1c4dc14)), closes [#44](https://github.com/MapColonies/overseer/issues/44)
* export finalize ([#49](https://github.com/MapColonies/overseer/issues/49)) ([d93a97e](https://github.com/MapColonies/overseer/commit/d93a97e4fc311d9661d496db7667a5c5931c2d44)), closes [#45](https://github.com/MapColonies/overseer/issues/45) [#46](https://github.com/MapColonies/overseer/issues/46) [#48](https://github.com/MapColonies/overseer/issues/48)

### [1.7.4](https://github.com/MapColonies/overseer/compare/v1.7.3...v1.7.4) (2025-02-20)


### Bug Fixes

* remove -max_old_space_size from Dockerfile ([#44](https://github.com/MapColonies/overseer/issues/44)) ([e4e902c](https://github.com/MapColonies/overseer/commit/e4e902cc04b4f08e98a4a55dd484b99d1e2b73c6))

### [1.7.3](https://github.com/MapColonies/overseer/compare/v1.7.2...v1.7.3) (2025-02-05)

### [1.7.2](https://github.com/MapColonies/overseer/compare/v1.7.1...v1.7.2) (2025-02-05)

### [1.7.1](https://github.com/MapColonies/overseer/compare/v1.7.0...v1.7.1) (2025-01-28)


### Bug Fixes

* taskBatch leftovers condition (MAPCO-6587) ([#41](https://github.com/MapColonies/overseer/issues/41)) ([1eb8b5b](https://github.com/MapColonies/overseer/commit/1eb8b5be0c77f9dea1db928d1da3ad655b722349))
* taskBatch leftovers condition fix ([46be4c6](https://github.com/MapColonies/overseer/commit/46be4c6deab2e5bf793fe0bc137d9fb340e1848a))

## [1.7.0](https://github.com/MapColonies/overseer/compare/v1.6.0...v1.7.0) (2025-01-22)


### Features

* add OpenTelemetry tracing to overseer worker(MAPCO-5642) ([#39](https://github.com/MapColonies/overseer/issues/39)) ([0e5ad52](https://github.com/MapColonies/overseer/commit/0e5ad52a5ac38017ce937734435de1a970be9ea8))


### Bug Fixes

* added truncate for feature collection before union due to floating point number turf bug ([084fcde](https://github.com/MapColonies/overseer/commit/084fcdee2f40cefe084571209afdad0b69df7bc6))

## [1.6.0](https://github.com/MapColonies/overseer/compare/v1.5.0...v1.6.0) (2024-12-25)


### Features

* **tileMergeTaskManager:** create buffered version of the unified parts ([#36](https://github.com/MapColonies/overseer/issues/36)) ([763d95d](https://github.com/MapColonies/overseer/commit/763d95df56c9b16994629edd287090a1371db996))

## [1.5.0](https://github.com/MapColonies/overseer/compare/v1.4.2...v1.5.0) (2024-12-15)


### Features

* add metrics support(MAPCO-5641) ([#34](https://github.com/MapColonies/overseer/issues/34)) ([513a959](https://github.com/MapColonies/overseer/commit/513a959deb014800ab4f34ca122501a1c0006a23))

### [1.4.2](https://github.com/MapColonies/overseer/compare/v1.4.1...v1.4.2) (2024-12-04)


### Bug Fixes

* job seeding creation logic change ([#33](https://github.com/MapColonies/overseer/issues/33)) ([ad465c7](https://github.com/MapColonies/overseer/commit/ad465c733623ad53942dd564aa46e3b6b47c1a33))

### [1.4.1](https://github.com/MapColonies/overseer/compare/v1.4.0...v1.4.1) (2024-12-02)


### Bug Fixes

* const convention ([6b2af01](https://github.com/MapColonies/overseer/commit/6b2af01884d5c60f8acbd70372b0f423bc27980e))
* handle displayPath in different updates ([69ef6a2](https://github.com/MapColonies/overseer/commit/69ef6a20a7252955c7faacaca94c48db0c3c90b7))
* remove unnecessary schema ([94de9a8](https://github.com/MapColonies/overseer/commit/94de9a89637e92eb5e62addfcfc1a76477795552))
* tiles seeding hierarchy ([#31](https://github.com/MapColonies/overseer/issues/31)) ([de960d9](https://github.com/MapColonies/overseer/commit/de960d9d681db6e46a4c8821699b658a32237ed4))
* validated catalogAdditionalParams according to jobType ([8d2b1f2](https://github.com/MapColonies/overseer/commit/8d2b1f277bfa4de0978c4d5889fee9ba5e4fe560))

## [1.4.0](https://github.com/MapColonies/overseer/compare/v1.3.3...v1.4.0) (2024-11-26)


### Features

* Aggregation support ([#30](https://github.com/MapColonies/overseer/issues/30)) ([ace5572](https://github.com/MapColonies/overseer/commit/ace55724ecc9ce9bc3e21c303111fdcbca948c3b))


### Bug Fixes

* prevent duplicate tiles in task creation ([#29](https://github.com/MapColonies/overseer/issues/29)) ([e8fed18](https://github.com/MapColonies/overseer/commit/e8fed18b25dab3b921a904c59ae1f3c86fb625d9))

### [1.3.3](https://github.com/MapColonies/overseer/compare/v1.3.2...v1.3.3) (2024-11-19)


### Bug Fixes

* chnage to the right MAPPROXY_DNS ([#27](https://github.com/MapColonies/overseer/issues/27)) ([e8a30cd](https://github.com/MapColonies/overseer/commit/e8a30cdff3669d73978d43688052c52edcbbb9fa))

### [1.3.2](https://github.com/MapColonies/overseer/compare/v1.3.0...v1.3.2) (2024-11-19)

### [1.3.1](https://github.com/MapColonies/overseer/compare/v1.3.0...v1.3.1) (2024-11-19)

## [1.3.0](https://github.com/MapColonies/overseer/compare/v1.2.5...v1.3.0) (2024-11-17)


### Features

* Ingestion swap update init(MAPCO-5073) ([#25](https://github.com/MapColonies/overseer/issues/25)) ([71b0558](https://github.com/MapColonies/overseer/commit/71b0558b30f83b0de1e47a495a09fa81044d3fe6))
* Ingestion update finalize(MAPCO-4442) ([#24](https://github.com/MapColonies/overseer/issues/24)) ([c7efd4e](https://github.com/MapColonies/overseer/commit/c7efd4ef73021865cc65eecc97de085e9645937c))
* update job init task hanling ([#20](https://github.com/MapColonies/overseer/issues/20)) ([ff6b868](https://github.com/MapColonies/overseer/commit/ff6b868e256c71efb65f905ba6d4af7387e66cf9))

### [1.2.5](https://github.com/MapColonies/overseer/compare/v1.2.4...v1.2.5) (2024-10-22)


### Bug Fixes

* serviceUrl hierarchy in custom-environment-variables.json fixed ([#23](https://github.com/MapColonies/overseer/issues/23)) ([92f0f41](https://github.com/MapColonies/overseer/commit/92f0f418cad5c11d31811afc12184eab1b5d42d0))
* update job internalId with catalogId(MAPCO-5057) ([#22](https://github.com/MapColonies/overseer/issues/22)) ([ac23baf](https://github.com/MapColonies/overseer/commit/ac23baf11927853c8d573f25aebe7442dd9e9910))

### [1.2.4](https://github.com/MapColonies/overseer/compare/v1.2.3...v1.2.4) (2024-10-21)


### Bug Fixes

* move jobDefinitions outside from env ([#21](https://github.com/MapColonies/overseer/issues/21)) ([ca27efb](https://github.com/MapColonies/overseer/commit/ca27efbf80daa15cbe9d7f42c01cf1876b25160f))

### [1.2.3](https://github.com/MapColonies/overseer/compare/v1.2.2...v1.2.3) (2024-10-14)


### Bug Fixes

* handlebars missing npm i ([6fb3133](https://github.com/MapColonies/overseer/commit/6fb3133cef81cbdd08a6e34795c63c157664f093))

### [1.2.2](https://github.com/MapColonies/overseer/compare/v1.2.1...v1.2.2) (2024-10-14)

### [1.2.1](https://github.com/MapColonies/overseer/compare/v1.2.0...v1.2.1) (2024-10-14)

## [1.2.0](https://github.com/MapColonies/overseer/compare/v1.1.3...v1.2.0) (2024-10-14)


### Features

* Ingestion new finalize (MAPCO-4785) ([#15](https://github.com/MapColonies/overseer/issues/15)) ([1296b9b](https://github.com/MapColonies/overseer/commit/1296b9bce5dcca279c4976886fb3df80780d7265))


### Bug Fixes

* change geometry to footprint (supporitng only polygon) ([#14](https://github.com/MapColonies/overseer/issues/14)) ([8cadff8](https://github.com/MapColonies/overseer/commit/8cadff80fa8093801fc521cc98fc3c570df570cf))

### [1.1.3](https://github.com/MapColonies/overseer/compare/v1.1.2...v1.1.3) (2024-09-19)


### Bug Fixes

* remove serviceUrls values ([a6a52d3](https://github.com/MapColonies/overseer/commit/a6a52d35f66ff2be91ef661c2479b2a42173abef))
* remove tilesStorageProvider default value ([b3e286d](https://github.com/MapColonies/overseer/commit/b3e286dcaa9fa0d43d21fa84367a727cc8c57136))

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
