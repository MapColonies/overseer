import path from 'node:path';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import type { IConfig } from '../../common/interfaces';
import { buildUrl } from '../url';

/* eslint-disable @typescript-eslint/naming-convention */
export const ARTIFACTS_EXTENSION = {
  GPKG: '.gpkg',
  JSON: '.json',
};
/* eslint-enable @typescript-eslint/naming-convention */

@injectable()
export class ArtifactPathBuilder {
  private readonly internalMountPath: string;
  private readonly gpkgSubPath: string;
  private readonly downloadServerUrl: string;
  private readonly gpkgPrefix: string;

  public constructor(@inject(SERVICES.CONFIG) config: IConfig) {
    this.internalMountPath = config.get<string>('storage.internalPvc.mountPath');
    this.gpkgSubPath = config.get<string>('storage.internalPvc.gpkgSubPath');
    this.downloadServerUrl = config.get<string>('servicesUrl.downloadServerPublicDNS');
    this.gpkgPrefix = path.posix.basename(this.gpkgSubPath);
  }

  //GPKGs
  public gpkgLocalPath(rel: string): string {
    return path.join(this.internalMountPath, this.gpkgSubPath, rel);
  }

  public gpkgS3Key(rel: string): string {
    return path.posix.join(this.gpkgPrefix, rel);
  }

  public gpkgDownloadUrl(rel: string): string {
    return buildUrl(this.downloadServerUrl, this.gpkgPrefix, rel);
  }

  //JSONs(metadata)
  public jsonLocalPath(rel: string): string {
    return this.gpkgLocalPath(rel).replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON);
  }

  public jsonS3Key(rel: string): string {
    return this.gpkgS3Key(rel).replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON);
  }

  public jsonDownloadUrl(rel: string): string {
    return this.gpkgDownloadUrl(rel).replace(ARTIFACTS_EXTENSION.GPKG, ARTIFACTS_EXTENSION.JSON);
  }
}
