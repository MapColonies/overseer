import { z } from 'zod';
import { INSTANCE_TYPES } from '../../../common/constants';

export const instanceTypeSchema = z.enum(INSTANCE_TYPES);

export type InstanceType = z.infer<typeof instanceTypeSchema>;
