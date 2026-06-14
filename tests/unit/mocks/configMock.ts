import { vi } from 'vitest';
import get from 'lodash.get';
import set from 'lodash.set';
import has from 'lodash.has';
import type { IConfig } from '../../../src/common/interfaces';

// The single source of truth for our mock configuration
let mockConfig: Record<string, unknown> = {};

const getMock = vi.fn();
const hasMock = vi.fn();

const configMock: IConfig = {
  get: getMock,
  has: hasMock,
};

const init = (): void => {
  getMock.mockImplementation((key: string): unknown => {
    return get(mockConfig, key);
  });

  hasMock.mockImplementation((key: string): boolean => {
    return has(mockConfig, key);
  });
};

interface SetValueParams {
  key: string | Record<string, unknown>;
  value?: unknown;
}

const setValue = (key: string | Record<string, unknown>, value?: unknown): void => {
  if (typeof key === 'string') {
    set(mockConfig, key, value);
  } else {
    Object.entries(key).forEach(([objKey, objValue]) => {
      set(mockConfig, objKey, objValue);
    });
  }
};

const clear = (): void => {
  mockConfig = {};
  init();
};

const setConfigValues = (values: Record<string, unknown>): void => {
  mockConfig = { ...values };
  init();
};

const registerDefaultConfig = (): void => {
  const config = {
    telemetry: {
      logger: {
        level: 'info',
        prettyPrint: false,
      },
      tracing: {
        isEnabled: false,
        url: 'http://localhost:4318/v1/traces',
      },
    },
    server: {
      port: 8080,
      request: {
        payload: {
          limit: '1mb',
        },
      },
      response: {
        compression: {
          enabled: true,
          options: null,
        },
      },
    },
    httpRetry: {
      attempts: 5,
      delay: 'exponential',
      shouldResetTimeout: true,
    },
    shapefileReader: {
      maxVerticesPerChunk: 2500,
    },
    ingestionSourcesDirPath: '/layerSources',
    tilesStorageProvider: 'FS',
    gpkgStorageProvider: 'FS',
    storage: {
      internalPvc: {
        mountPath: '/outputs',
        gpkgSubPath: 'raster/artifacts/gpkgs',
      },
    },
    disableHttpClientLogs: true,
    linkTemplatesPath: 'config/linkTemplates.template',
    servicesUrl: {
      mapproxyApi: 'http://mapproxy-api',
      geoserverApi: 'http://geoserver-api',
      catalogManager: 'http://catalog-manager',
      mapproxyDns: 'http://mapproxy',
      polygonPartsManager: 'http://polygon-parts-manager',
      geoserverDns: 'http://geoserver',
      downloadServerPublicDNS: 'http://download-server',
      jobTracker: 'http://job-tracker',
    },
    geoserver: {
      workspace: 'testWorkspace',
      dataStore: 'testDataStore',
    },
    instanceType: 'ingestion',
    jobManagement: {
      config: {
        jobManagerBaseUrl: 'http://job-manager',
        heartbeat: {
          baseUrl: 'http://heart-beat',
          intervalMs: 3000,
        },
        dequeueIntervalMs: 3000,
      },
      polling: {
        maxTaskAttempts: 3,
        tasks: {
          createTasks: 'create-tasks',
          init: 'init',
          finalize: 'finalize',
        },
      },
      ingestion: {
        pollingJobs: {
          new: {
            type: 'Ingestion_New',
          },
          update: {
            type: 'Ingestion_Update',
          },
          swapUpdate: {
            type: 'Ingestion_Swap_Update',
          },
        },
        jobs: {
          seed: {
            type: 'Ingestion_Seed',
          },
        },
        tasks: {
          tilesMerging: {
            type: 'tilesMerging',
            tileBatchSize: 10000,
            taskBatchSize: 2,
          },
          tilesSeeding: {
            type: 'tilesSeeding',
            grid: 'WorldCRS84',
            maxZoom: 21,
            skipUncached: true,
            zoomThreshold: 16,
            maxTilesPerSeedTask: 500000,
          },
        },
      },
      export: {
        pollingJobs: {
          export: {
            type: 'Export',
          },
        },
        tasks: {
          tilesExporting: {
            type: 'tilesExporting',
          },
        },
      },
    },
  };

  setConfigValues(config);
};

export { getMock, hasMock, configMock, setValue, clear, init, setConfigValues, registerDefaultConfig };
export type { SetValueParams };
