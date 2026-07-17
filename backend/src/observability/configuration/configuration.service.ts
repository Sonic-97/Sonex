import { Injectable, Logger } from '@nestjs/common';

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  readonly REQUIRED_ENV_VARS = [
    { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
    { name: 'JWT_ACCESS_SECRET', description: 'JWT signing secret' },
    { name: 'REDIS_HOST', description: 'Redis host for queues and caching' },
  ];

  readonly CONDITIONAL_ENV_VARS = [
    { name: 'DEEPSEEK_API_KEY', description: 'DeepSeek API key (required when AI mode is enabled)', condition: () => process.env.AI_MODE === 'true' },
    { name: 'REDIS_PASSWORD', description: 'Redis password (required when REDIS_HOST is not localhost)', condition: () => process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost' && process.env.REDIS_HOST !== '127.0.0.1' },
  ];

  validate(): EnvValidationResult {
    const missing: string[] = [];
    const warnings: string[] = [];

    for (const envVar of this.REQUIRED_ENV_VARS) {
      if (!process.env[envVar.name]) {
        missing.push(envVar.name);
        this.logger.error(`Missing required environment variable: ${envVar.name} (${envVar.description})`);
      }
    }

    for (const envVar of this.CONDITIONAL_ENV_VARS) {
      if (envVar.condition() && !process.env[envVar.name]) {
        warnings.push(envVar.name);
        this.logger.warn(`Missing conditional environment variable: ${envVar.name} (${envVar.description})`);
      }
    }

    return { valid: missing.length === 0, missing, warnings };
  }

  validateOrThrow(): void {
    const result = this.validate();
    if (!result.valid) {
      throw new Error(
        `Environment validation failed. Missing variables: ${result.missing.join(', ')}. ` +
        'Application cannot start without required configuration.'
      );
    }
    this.logger.log('All required environment variables are present');
  }
}
