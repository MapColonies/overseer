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
- Handles exporting of geospatial data to geopackage (GPKG) format

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

| Variable Name | Type | Description | Default | Supported Values |
|--------------|------|-------------|---------|------------------|
| TILES_STORAGE_PROVIDER | string | Storage provider for tiles | `"FS"` | "FS" (Filesystem), "S3" |
| GPKG_STORAGE_PROVIDER | string | Storage provider for geopackages | `"FS"` | "FS" (Filesystem), "S3" |

## S3 Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| S3_ACCESS_KEY_ID | string | S3 access key ID | |
| S3_SECRET_ACCESS_KEY | string | S3 secret access key | |
| S3_ENDPOINT_URL | string | S3 endpoint URL | |
| S3_ARTIFACTS_BUCKET | string | S3 bucket for artifacts | |
| S3_SSL_ENABLED | boolean | Enable SSL for S3 connections | `true` |

## Service URLs

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| MAPPROXY_API_URL | string | MapProxy API URL | `"http://localhost:8083"` |
| GEOSERVER_API_URL | string | GeoServer API URL | `"http://localhost:8084"` |
| GEOSERVER_DNS | string | GeoServer DNS | `"http://localhost:8088"` |
| CATALOG_MANAGER_URL | string | Catalog Manager URL | `"http://localhost:8085"` |
| MAPPROXY_DNS | string | MapProxy DNS | `"http://localhost:8086"` |
| POLYGON_PART_MANAGER_URL | string | Polygon Part Manager URL | `"http://localhost:8087"` |
| DOWNLOAD_SERVER_PUBLIC_DNS | string | Public DNS for download server | `"http://localhost:8088"` |
| JOB_TRACKER_URL | string | Job tracker URL | `"http://localhost:8089"` |

## Job Management

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| JOB_MANAGER_BASE_URL | string | Job Manager base URL | `"http://localhost:8081"` |
| HEARTBEAT_BASE_URL | string | Heartbeat service base URL | `"http://localhost:8082"` |
| HEARTBEAT_INTERVAL_MS | number | Heartbeat interval in milliseconds | `3000` |
| DEQUEUE_INTERVAL_MS | number | Dequeue polling interval in milliseconds | `3000` |
| GEOSERVER_WORKSPACE | string | GeoServer workspace name | `"polygonParts"` |
| GEOSERVER_DATASTORE | string | GeoServer datastore name | `"polygonParts"` |
| MAX_TASK_ATTEMPTS | number | Maximum number of task execution attempts | `3` |
| POLLING_INIT_TASK | string | Init task type for polling | `"init"` |
| POLLING_FINALIZE_TASK | string | Finalize task type for polling | `"finalize"` |

## Ingestion Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| INGESTION_NEW_JOB_TYPE | string | New ingestion job type | `"Ingestion_New"` |
| INGESTION_UPDATE_JOB_TYPE | string | Update ingestion job type | `"Ingestion_Update"` |
| INGESTION_SWAP_UPDATE_JOB_TYPE | string | Swap update job type | `"Ingestion_Swap_Update"` |
| INGESTION_SEED_JOB_TYPE | string | Seed job type | `"Ingestion_Seed"` |
| TILES_MERGING_TASK_TYPE | string | Tiles merging task type | `"tiles-merging"` |
| TILES_MERGING_TILE_BATCH_SIZE | number | Batch size for tile merging | `10000` |
| TILES_MERGING_TASK_BATCH_SIZE | number | Batch size for task merging | `5` |
| TILES_MERGING_RADIUS_BUFFER | number | Radius buffer for merging | `0` |
| TILES_MERGING_RADIUS_BUFFER_UNITS | string | Units for radius buffer | `"meters"` |
| TILES_MERGING_TRUNCATE_PRECISION | number | Precision for truncating | `6` |
| TILES_MERGING_TRUNCATE_COORDINATES | number | Coordinates for truncating | `6` |
| TILES_SEEDING_TASK_TYPE | string | Tiles seeding task type | `"tiles-seeding"` |
| TILES_SEEDING_GRID | string | Grid configuration for tiles seeding | `"WorldCRS84"` |
| TILES_SEEDING_MAX_ZOOM | number | Maximum zoom level for seeding | `21` |
| TILES_SEEDING_SKIP_UNCACHED | boolean | Skip uncached tiles during seeding | `true` |

## Export Configuration

| Variable Name | Type | Description | Default |
|--------------|------|-------------|---------|
| EXPORT_JOB_TYPE | string | Export job type | `"Export"` |
| EXPORT_CLEANUP_EXPIRATION_DAYS | number | Days until exported files are cleaned up | `7` |
| EXPORT_GPKGS_PATH | string | Path to store geopackage files | `"/tmp/gpkgs"` |
| EXPORT_DOWNLOAD_PATH | string | Download path for exported files | `"/downloads"` |
| TILES_EXPORTING_TASK_TYPE | string | Tiles exporting task type | `"tiles-exporting"` |

# Core Functionality

The Overseer worker service handles two main types of geospatial data processing:
1. Ingestion of geospatial data
2. Export of geospatial data to geopackage (GPKG) format

For both processing types, the service handles two primary task phases:
- **Init Task**: Sets up and prepares the job, creating necessary subtasks
- **Finalize Task**: Handles post-processing and finalizes the job

## Task Processing Overview
- Implements polling-based task acquisition via mc-priority-queue
- Supports task resumption capabilities for failure recovery
- Provides telemetry and monitoring for all processing steps
- Manages error handling and task retries

## Ingestion Processing

### Ingestion Init Task
- Creates merge tasks for different ingestion job types (New, Update, Swap-Update)
- Processes job parameters and polygon part metadata
- Manages task status transitions
- Creates merge tasks for ingestion job types using @map-colonies/mc-utils

### Ingestion Finalize Task
- **For New Ingestion:**
  - Handles layer naming convention:
    - nativeName:{productId}_{productType} for GeoServer use
    - name:{productId}-{productType} for MapProxy use
  - Manages layer insertion across:
    1. Inserts layer to MapProxy
    2. Inserts layer to GeoServer
    3. Inserts layer to Catalog
  - Processes aggregated part data
  - Manages job completion

- **For Update Ingestion:**
  - Updates catalog layers
  - Creates seed jobs and tasks

- **For Swap Update Ingestion:**
  - Updates catalog layers
  - Handles layer updates in MapProxy when required
  - Creates seed jobs and tasks

## Export Processing

### Export Init Task
- Retrieves layer aggregated metadata from the pp-manager
- Generates tile range batches based on the region of interest (ROI)
- Creates appropriate data sources for the export process
- Sets export parameters including target format and output format strategy
- Creates and enqueues export tasks with the Job Manager
- Tracks task metrics and provides detailed telemetry

### Export Finalize Task
- Checks task status and handles failed export tasks appropriately
- Processes the generated geopackage (GPKG) file:
  - Modifies the GPKG file with additional metadata and optimizations
  - Tracks GPKG modification status through task parameters
- Manages storage of exported files:
  - For S3 storage: Uploads the modified GPKG to S3 and tracks upload status
  - For filesystem storage: Manages files in the configured export directory
- Sends notification callbacks once GPKG processing is complete
- Updates job status and parameters in the job management system
- Provides comprehensive telemetry with span events for each processing step
- Handles path resolution between relative and absolute file paths

### Job Types Support

- **Ingestion Types:**
  - Ingestion_New
  - Ingestion_Update
  - Ingestion_Swap_Update
  
- **Export Type:**
  - Export

Each job type supports both init and finalize task phases.

## Architecture

The service is part of a larger system that includes:
- Job Manager
- Ingestion Trigger
- MapProxy API
- GeoServer API
- Raster Catalog Manager
- Polygon Parts Manager
- Tiles Merger
- Job Tracker
- Download Server

## Dependencies

Key dependencies include:
- @map-colonies/raster-shared
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