export interface ClientRateLimit {
  requests: number;
  per_seconds: number;
}

export interface ClientConfig {
  client_id: string;
  api_key: string;
  client_secret: string;
  gitlab_token: string;
  gitlab_base_url: string;
  enabled: boolean;
  allowed_endpoints: string[];
  rate_limit: ClientRateLimit;
}

export interface ClientsConfigFile {
  clients: ClientConfig[];
}
