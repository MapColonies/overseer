import { degreesPerPixelToZoomLevel } from '@map-colonies/mc-utils';
import { IngestionUpdateFinalizeJob, IngestionSwapUpdateFinalizeJob } from './zod/schemas/job.schema';

export const extractMaximalUpdatedResolution = (ingestionJob: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob): number => {
  const partsData = ingestionJob.parameters.partsData;
  const maxResolutionDeg = Math.min(...partsData.map((p) => p.resolutionDegree)); // best resolution
  const maxZoomLevel = degreesPerPixelToZoomLevel(maxResolutionDeg);
  return maxZoomLevel;
};
