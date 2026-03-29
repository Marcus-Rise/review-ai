import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { ClientConfig, ClientsConfigFile } from './clients-config.interface';

@Injectable()
export class ClientsConfigService implements OnModuleInit {
  private readonly logger = new Logger(ClientsConfigService.name);
  private clients = new Map<string, ClientConfig>();
  private loaded = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  async loadConfig() {
    const configPath = this.configService.get<string>('CLIENTS_CONFIG_PATH');
    if (!configPath) {
      this.logger.warn('CLIENTS_CONFIG_PATH not set — no clients configured');
      this.loaded = true;
      return;
    }

    try {
      const raw = await readFile(configPath, 'utf-8');
      const parsed: ClientsConfigFile = JSON.parse(raw);

      if (!parsed.clients || !Array.isArray(parsed.clients)) {
        throw new Error('Invalid clients config: missing "clients" array');
      }

      this.clients.clear();
      for (const client of parsed.clients) {
        this.validateClient(client);
        this.clients.set(client.client_id, client);
      }

      this.loaded = true;
      this.logger.log(`Loaded ${this.clients.size} client(s) from config`);
    } catch (error) {
      this.logger.error(`Failed to load clients config from ${configPath}: ${error}`);
      throw error;
    }
  }

  private validateClient(client: ClientConfig) {
    if (!client.client_id || typeof client.client_id !== 'string') {
      throw new Error('Client config missing valid client_id');
    }
    if (!client.api_key || typeof client.api_key !== 'string') {
      throw new Error(`Client ${client.client_id}: missing valid api_key`);
    }
    if (!client.client_secret || typeof client.client_secret !== 'string') {
      throw new Error(`Client ${client.client_id}: missing valid client_secret`);
    }
    if (!Array.isArray(client.allowed_endpoints)) {
      throw new Error(`Client ${client.client_id}: missing allowed_endpoints array`);
    }
    if (
      !client.rate_limit ||
      typeof client.rate_limit !== 'object' ||
      typeof client.rate_limit.requests !== 'number' ||
      client.rate_limit.requests < 1 ||
      typeof client.rate_limit.per_seconds !== 'number' ||
      client.rate_limit.per_seconds < 1
    ) {
      throw new Error(
        `Client ${client.client_id}: missing or invalid rate_limit (requires requests >= 1, per_seconds >= 1)`,
      );
    }
  }

  getClient(clientId: string): ClientConfig | undefined {
    return this.clients.get(clientId);
  }

  findByApiKey(apiKey: string): ClientConfig | undefined {
    for (const client of this.clients.values()) {
      if (client.api_key === apiKey) {
        return client;
      }
    }
    return undefined;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}
