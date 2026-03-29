import { Module, Global } from '@nestjs/common';
import { ClientsConfigService } from './clients-config.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  providers: [ClientsConfigService, AuthGuard],
  exports: [ClientsConfigService, AuthGuard],
})
export class AuthModule {}
