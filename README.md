# Overseer

[![Release](https://img.shields.io/github/v/release/MapColonies/overseer)](https://github.com/MapColonies/overseer/releases)


A geospatial data management worker service that handles initialization, merge, and finalization of geospatial jobs & tasks.

## Overview

Overseer is a worker service that communicates with the Job-Manager service using a polling strategy to handle initial & finalize tasks created by the Ingestion-Trigger service. It manages various aspects of geospatial data ingestion, including layer management in MapProxy, GeoServer, and catalog system.

### Key Features

- Infinite polling for specific tasks using mc-priority-queue
- Handles multiple ingestion job types (new, update, swap-update)
- Manages layer publication across multiple services
- Supports task resumption on failure

## Installation

```bash
npm install
```

## Running the Service

### In Development Mode
```bash
npm run start:dev
```

### In Production Mode
```bash
npm run start
```

## Scripts

- **Tests**
  - `npm test` - Run unit tests
  - `npm run test:unit` - Run unit tests with specific configuration
  - `npm run test:integration` - Run integration tests

- **Linting & Formatting**
  - `npm run format` - Check code formatting
  - `npm run format:fix` - Fix code formatting
  - `npm run lint` - Run linter
  - `npm run lint:fix` - Fix linting issues

- **Build**
  - `npm run build` - Build the project
  - `npm run clean` - Clean build directory

# Configuration

The service can be configured using environment variables or a configuration file local.json(based on default.json)

# Environment Variables

## Telemetry Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| TELEMETRY_SERVICE_NAME | string | Name of the service for telemetry | |
| TELEMETRY_HOST_NAME | string | Host name for telemetry | |
| TELEMETRY_SERVICE_VERSION | string | Service version for telemetry | |
| LOG_LEVEL | string | Logging level | `"info"` |
| LOG_PRETTY_PRINT_ENABLED | boolean | Enable pretty printing of logs | `false` |
| LOG_PINO_CALLER_ENABLED | boolean | Enable pino-caller for logging | `false` |
| TELEMETRY_TRACING_ENABLED | boolean | Enable tracing | `"true"` |
| TELEMETRY_TRACING_URL | string | URL for tracing service | `"http://localhost:4318/v1/traces"` |
| TELEMETRY_METRICS_ENABLED | boolean | Enable metrics collection | `false` |
| TELEMETRY_METRICS_URL | string | URL for metrics service | `"http://localhost:4318/v1/metrics"` |
| TELEMETRY_METRICS_INTERVAL | string | Metrics collection interval | `5` |
| TELEMETRY_METRICS_BUCKETS | json | Metrics buckets configuration | `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 50, 250, 500]` |

## Server Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| SERVER_PORT | number | Server port | `"8080"` |
| REQUEST_PAYLOAD_LIMIT | string | Request payload size limit | `"1mb"` |
| RESPONSE_COMPRESSION_ENABLED | boolean | Enable response compression | `true` |

## HTTP Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| HTTP_RETRY_ATTEMPTS | number | Number of retry attempts | `5` |
| HTTP_RETRY_DELAY | number | Delay between retries | `"exponential"` |
| HTTP_RETRY_RESET_TIMEOUT | boolean | Reset timeout on retry | `true` |
| DISABLE_HTTP_CLIENT_LOGS | boolean | Disable HTTP client logging | `true` |

## Storage Configuration

| Variable Name | Type | Default | Description | Supported Values |
|--------------|------|-----------------|-------------|---------|
| TILES_STORAGE_PROVIDER | string | Storage provider for tiles | `"FS"` | "FS" (Filesystem), "S3" |

## Service URLs

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| MAPPROXY_API_URL | string | MapProxy API URL | `"http://localhost:8083"` |
| GEOSERVER_API_URL | string | GeoServer API URL | `"http://localhost:8084"` |
| GEOSERVER_DNS | string | GeoServer DNS | `"http://localhost:8088"` |
| CATALOG_MANAGER_URL | string | Catalog Manager URL | `"http://localhost:8085"` |
| MAPPROXY_DNS | string | MapProxy DNS | `"http://localhost:8086"` |
| POLYGON_PART_MANAGER_URL | string | Polygon Part Manager URL | `"http://localhost:8087"` |

## Job Management

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| JOB_MANAGER_BASE_URL | string | Job Manager base URL | `"http://localhost:8081"` |
| HEARTBEAT_BASE_URL | string | Heartbeat service base URL | `"http://localhost:8082"` |
| HEARTBEAT_INTERVAL_MS | number | Heartbeat interval in milliseconds | `3000` |
| DEQUEUE_INTERVAL_MS | number | Dequeue polling interval in milliseconds | `3000` |
| GEOSERVER_WORKSPACE | string | GeoServer workspace name | `"polygonParts"` |
| GEOSERVER_DATASTORE | string | GeoServer datastore name | `"polygonParts"` |

## Ingestion Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| INGESTION_POLLING_INIT_TASK | string | Init task type for polling | `"init"` |
| INGESTION_POLLING_FINALIZE_TASK | string | Finalize task type for polling | `"finalize"` |
| INGESTION_NEW_JOB_TYPE | string | New ingestion job type | `"Ingestion_New"` |
| INGESTION_UPDATE_JOB_TYPE | string | Update ingestion job type | `"Ingestion_Update"` |
| INGESTION_SWAP_UPDATE_JOB_TYPE | string | Swap update job type | `"Ingestion_Swap_Update"` |
| INGESTION_SEED_JOB_TYPE | string | Seed job type | `"Ingestion_Seed"` |
| TILES_MERGING_TASK_TYPE | string | Tiles merging task type | `"tiles-merging"` |
| TILES_MERGING_TILE_BATCH_SIZE | number | Batch size for tile merging | `10000` |
| TILES_MERGING_TASK_BATCH_SIZE | number | Batch size for task merging | `5` |
| TILES_SEEDING_TASK_TYPE | string | Tiles seeding task type | `"tiles-seeding"` |
| TILES_SEEDING_GRID | string | Grid configuration for tiles seeding | `"WorldCRS84"` |
| TILES_SEEDING_MAX_ZOOM | string | Maximum zoom level for seeding | `21` |
| TILES_SEEDING_SKIP_UNCACHED | boolean | Skip uncached tiles during seeding | `true` |


# Core Functionality

- **Task Processing:**
  - Handles two primary task types: "init" and "finalize"
  - Supports multiple ingestion scenarios: new ingestion, update, and swap-update
  - Implements task resumption capabilities for failure recovery

- **Init Task:**
  - Creates merge tasks for different ingestion job types
  - Processes job parameters and polygon part metadata
  - Manages task status transitions
  - Creates merge tasks for ingestion job types using @map-colonies/mc-utils

- **Finalize Task:**
  - For New Ingestion:
    - Handles layer naming convention:
    	-nativeName:{productId}_{productType} for geoserver use
    	-name:{productId}-{productType} for mapproxy use
    - Manages layer insertion across:
    	1. Inserts layer to MapProxy
  	2. Inserts layer to GeoServer
  	3. Inserts layer to Catalog
    - Processes aggregated part data
    - Manages job completion
  - For Update Ingestion:
    - Updates catalog layers
    - Creates seed jobs and tasks
  - For Swap Update Ingestion:
    - Updates catalog layers
    - Handles layer updates in MapProxy when required
    - Creates seed jobs and tasks

### Job Types Support

- Ingestion_New
- Ingestion_Update
- Ingestion_Swap_Update

Each job type supports both init and finalize task phases, with specialized handling for tiles merging operations through the tiles-merger consumer.

## Architecture

The service is part of a larger system that includes:
- Job Manager
- Ingestion Trigger
- MapProxy API
- GeoServer API
- Raster Catalog Manager
- Polygon Parts Manager
- Tiles Merger

## Dependencies

Key dependencies include:
- @map-colonies/mc-priority-queue
- @map-colonies/mc-utils
- @map-colonies/telemetry
- express
- typescript

## Contributing

1. Create a new branch
2. Commit your changes
3. Create a Pull Request

## License

MIT

## Contact

Owned by Almogk Kusayev

---

For more detailed information about specific features or integrations, please consult the service documentation or contact the development team.