import path from 'path';
import { faker } from '@faker-js/faker';
import { ArtifactPathBuilder, ARTIFACTS_EXTENSION } from '../../../src/utils/storage/artifactPathBuilder';
import { configMock, registerDefaultConfig } from '../mocks/configMock';

describe('ArtifactPathBuilder', () => {
  let internalMountPath: string;
  let gpkgSubPath: string;
  let downloadServerPublicDNS: string;
  let gpkgPrefix: string;

  beforeEach(() => {
    registerDefaultConfig();
    internalMountPath = configMock.get('storage.internalPvc.mountPath');
    gpkgSubPath = configMock.get('storage.internalPvc.gpkgSubPath');
    downloadServerPublicDNS = configMock.get('servicesUrl.downloadServerPublicDNS');
    gpkgPrefix = path.posix.basename(gpkgSubPath);
  });

  const rel = `${faker.string.uuid()}/package.gpkg`;

  describe('gpkg paths', () => {
    it('builds the local FS path under mountPath + gpkgSubPath', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.gpkgLocalPath(rel)).toBe(`${internalMountPath}/${gpkgSubPath}/${rel}`);
    });

    it('builds the S3 key relative to the artifacts anchor', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.gpkgS3Key(rel)).toBe(`${gpkgPrefix}/${rel}`);
    });

    it('builds the public download URL', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.gpkgDownloadUrl(rel)).toBe(`${downloadServerPublicDNS}/${gpkgPrefix}/${rel}`);
    });
  });

  describe('json sidecar paths', () => {
    it('swaps .gpkg → .json in the local path', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.jsonLocalPath(rel)).toBe(
        `${internalMountPath}/${gpkgSubPath}/${rel.replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON)}`
      );
    });

    it('swaps .gpkg → .json in the S3 key', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.jsonS3Key(rel)).toBe(`${gpkgPrefix}/${rel.replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON)}`);
    });

    it('swaps .gpkg → .json in the download URL', () => {
      const builder = new ArtifactPathBuilder(configMock);
      expect(builder.jsonDownloadUrl(rel)).toBe(
        `${downloadServerPublicDNS}/${gpkgPrefix}/${rel.replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON)}`
      );
    });
  });
});
