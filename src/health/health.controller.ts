import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ClientsConfigService } from '../auth/clients-config.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly clientsConfig: ClientsConfigService,
  ) {}

  @Get('healthz')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  healthz() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  readyz() {
    const checks: Record<string, boolean> = {
      clients_loaded: this.clientsConfig.isLoaded(),
      model_endpoint_configured: !!this.configService.get<string>('MODEL_ENDPOINT'),
      model_name_configured: !!this.configService.get<string>('MODEL_NAME'),
    };

    const ready = Object.values(checks).every(Boolean);

    return {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
