import { degreesPerPixelToZoomLevel } from '@map-colonies/mc-utils';
import { IngestionUpdateFinalizeJob, IngestionSwapUpdateFinalizeJob } from './zod/schemas/job.schema';

export const extractMaxUpdateZoomLevel = (ingestionJob: IngestionUpdateFinalizeJob | IngestionSwapUpdateFinalizeJob): number => {
  const partsData = ingestionJob.parameters.partsData;
  const maxResolutionDeg = Math.min(...partsData.map((partData) => partData.resolutionDegree)); // best resolution
  const maxZoomLevel = degreesPerPixelToZoomLevel(maxResolutionDeg);
  return maxZoomLevel;
};
