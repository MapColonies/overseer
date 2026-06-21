import 'reflect-metadata';
import * as matchers from 'jest-extended';
import { expect } from 'vitest';

expect.extend(matchers);

// Augment vitest's expect types with jest-extended matchers
// CustomMatchers is globally declared by jest-extended
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface AsymmetricMatchersContaining extends CustomMatchers<any> {}
}
