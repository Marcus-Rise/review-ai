import { HealthController } from '../../src/health/health.controller';
import { ConfigService } from '@nestjs/config';
import { ClientsConfigService } from '../../src/auth/clients-config.service';

describe('HealthController', () => {
  let controller: HealthController;
  let configService: { get: jest.Mock };
  let clientsConfig: { isLoaded: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn() };
    clientsConfig = { isLoaded: jest.fn() };
    controller = new HealthController(
      configService as unknown as ConfigService,
      clientsConfig as unknown as ClientsConfigService,
    );
  });

  describe('healthz', () => {
    it('should return ok status with timestamp', () => {
      const result = controller.healthz();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('readyz', () => {
    function createMockReply() {
      const send = jest.fn();
      const status = jest.fn().mockReturnValue({ send });
      return { status, send };
    }

    it('should return 200 when all checks pass', () => {
      clientsConfig.isLoaded.mockReturnValue(true);
      configService.get.mockImplementation((key: string) => {
        if (key === 'MODEL_PROVIDER') return 'openai';
        if (key === 'MODEL_NAME') return 'gpt-4';
        return undefined;
      });

      const reply = createMockReply();
      controller.readyz(reply as any);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
    });

    it('should return 503 when clients are not loaded', () => {
      clientsConfig.isLoaded.mockReturnValue(false);
      configService.get.mockReturnValue('some-value');

      const reply = createMockReply();
      controller.readyz(reply as any);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'not_ready' }));
    });

    it('should return 503 when MODEL_PROVIDER is not configured', () => {
      clientsConfig.isLoaded.mockReturnValue(true);
      configService.get.mockImplementation((key: string) => {
        if (key === 'MODEL_PROVIDER') return undefined;
        if (key === 'MODEL_NAME') return 'gpt-4';
        return undefined;
      });

      const reply = createMockReply();
      controller.readyz(reply as any);

      expect(reply.status).toHaveBeenCalledWith(503);
    });

    it('should return 503 when MODEL_NAME is not configured', () => {
      clientsConfig.isLoaded.mockReturnValue(true);
      configService.get.mockImplementation((key: string) => {
        if (key === 'MODEL_PROVIDER') return 'openai';
        if (key === 'MODEL_NAME') return undefined;
        return undefined;
      });

      const reply = createMockReply();
      controller.readyz(reply as any);

      expect(reply.status).toHaveBeenCalledWith(503);
    });

    it('should include checks object in response', () => {
      clientsConfig.isLoaded.mockReturnValue(true);
      configService.get.mockReturnValue('value');

      const reply = createMockReply();
      controller.readyz(reply as any);

      const body = reply.send.mock.calls[0][0];
      expect(body.checks).toHaveProperty('clients_loaded');
      expect(body.checks).toHaveProperty('model_provider_configured');
      expect(body.checks).toHaveProperty('model_name_configured');
      expect(body.timestamp).toBeDefined();
    });
  });
});
