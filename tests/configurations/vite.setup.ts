import 'reflect-metadata';
import * as matchers from 'jest-extended';
import { expect } from 'vitest';

expect.extend(matchers);

// Augment vitest's expect types with jest-extended matchers
// CustomMatchers is globally declared by jest-extended
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Assertion<T = any> = CustomMatchers<T>;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers<void> {}
}
