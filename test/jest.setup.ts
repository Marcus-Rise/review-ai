import { Logger } from '@nestjs/common';

// Silence NestJS Logger output in unit tests.
// Tests that need to assert on logger calls can spy on Logger.prototype
// directly — the spy will wrap this mock and record invocations.
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});
