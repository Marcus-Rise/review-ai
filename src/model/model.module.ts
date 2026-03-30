import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { ModelService } from './model.service';
import { MODEL_PROVIDER } from './providers/model-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { AmveraProvider } from './providers/amvera.provider';

const logger = new Logger('ModelModule');

@Module({
  providers: [
    ModelService,
    {
      provide: MODEL_PROVIDER,
      useFactory: async (config: ConfigService) => {
        const providerName = config.get<string>('MODEL_PROVIDER', 'openai');

        let apiKey: string | undefined;
        const keyPath = config.get<string>('MODEL_API_KEY_PATH');
        if (keyPath) {
          try {
            apiKey = (await readFile(keyPath, 'utf-8')).trim();
            logger.log('Model API key loaded from secret file');
          } catch (error) {
            logger.error(`Failed to read MODEL_API_KEY_PATH (${keyPath}): ${error}`);
            throw error;
          }
        }

        switch (providerName) {
          case 'amvera':
            if (!apiKey) {
              throw new Error('MODEL_API_KEY_PATH is required for the Amvera provider');
            }
            return new AmveraProvider(config, apiKey);
          case 'openai':
          default:
            if (!config.get('MODEL_ENDPOINT') && !apiKey) {
              throw new Error(
                'MODEL_API_KEY_PATH is required when using the default OpenAI endpoint (api.openai.com). ' +
                  'Set MODEL_ENDPOINT for self-hosted models like Ollama.',
              );
            }
            return new OpenAiProvider(config, apiKey);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [ModelService],
})
export class ModelModule {}
