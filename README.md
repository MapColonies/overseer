# Map Colonies Overseer Worker Service

----------------------------------

A worker service designed for geospatial data management. Overseer handles a series of complex workflows including initialization, merge, and finalization tasks for geospatial layers. Features include polling for initialization and finalization tasks, processing merge tasks (new, update, swap), and resilient error handling with capabilities to resume tasks post-failure. It integrates with various APIs like mapproxy-API and GeoServer-API to insert and update layers, and enhances WFS links. The service listens to an ingestion queue, intelligently decides task creation, and commits updates upon successful task completions, ensuring data integrity and seamless workflow execution.

### Template Features:

- eslint configuration by [@map-colonies/eslint-config](https://github.com/MapColonies/eslint-config)

- prettier configuration by [@map-colonies/prettier-config](https://github.com/MapColonies/prettier-config)

- jest

- .nvmrc

- Multi stage production-ready Dockerfile

- commitlint

- git hooks

- logging by [@map-colonies/js-logger](https://github.com/MapColonies/js-logger)

- config load with [node-config](https://www.npmjs.com/package/node-config)

- Tracing and metrics by [@map-colonies/telemetry](https://github.com/MapColonies/telemetry)

- github templates

- bug report

- feature request

- pull request

- github actions

- on pull_request

- LGTM

- test

- lint

- snyk

## Installation

Install deps with npm

```bash
npm install
```
### Install Git Hooks
```bash
npx husky install
```

## Run Locally

Clone the project

```bash

git clone https://link-to-project

```

Go to the project directory

```bash

cd my-project

```

Install dependencies

```bash

npm install

```

Start the server

```bash

npm run start

```

## Running Tests

To run tests, run the following command

```bash

npm run test

```

To only run unit tests:
```bash
npm run test:unit
```

To only run integration tests:
```bash
npm run test:integration
```
