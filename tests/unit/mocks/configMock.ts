/* eslint-disable @typescript-eslint/no-magic-numbers */

import config, { IConfig, IUtil } from 'config';
import get from 'lodash.get';
import set from 'lodash.set';
import has from 'lodash.has';

// The single source of truth for our mock configuration
let mockConfig: Record<string, unknown> = {};

const getMock = jest.fn();
const hasMock = jest.fn();
const utiMock = jest.fn() as unknown as IUtil;

const configMock: IConfig = {
  get: getMock,
  has: hasMock,
  util: utiMock,
};

const init = (): void => {
  getMock.mockImplementation((key: string): unknown => {
    return get(mockConfig, key) ?? config.get(key);
  });

  hasMock.mockImplementation((key: string): boolean => {
    return has(mockConfig, key) || config.has(key);
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
    // When key is an object, iterate through it and set each key-value pair
    // This preserves potential nested paths in object keys
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
        pinoCaller: false,
      },
      tracing: {
        enabled: true,
        url: 'http://localhost:4318/v1/traces',
      },
      metrics: {
        enabled: false,
        url: 'http://localhost:4318/v1/metrics',
        interval: 5,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 50, 250, 500],
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
    tilesStorageProvider: 'FS',
    gpkgStorageProvider: 'FS',
    disableHttpClientLogs: true,
    linkTemplatesPath: 'config/linkTemplates.template',
    servicesUrl: {
      mapproxyApi: 'http://mapproxy-api',
      geoserverApi: 'http://geoserver-api',
      catalogManager: 'http://catalog-manager',
      mapproxyDns: 'http://mapproxy',
      polygonPartsManager: 'http://polygon-parts-manager',
      geoserverDns: 'http://geoserver',
      jobTracker: 'http://job-tracker',
    },
    geoserver: {
      workspace: 'testWorkspace',
      dataStore: 'testDataStore',
    },
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
          init: 'init',
          finalize: 'finalize',
        },
        jobs: {
          new: {
            type: 'Ingestion_New',
          },
          update: {
            type: 'Ingestion_Update',
          },
          swapUpdate: {
            type: 'Ingestion_Swap_Update',
          },
          export: {
            type: 'Export',
            gpkgsPath: '/gpkgs',
          },
        },
      },
      ingestion: {
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

export { getMock, hasMock, configMock, setValue, clear, init, setConfigValues, registerDefaultConfig, SetValueParams };
