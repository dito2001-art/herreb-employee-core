import { handleEMP001Configuration, type ConfigurationEnv } from './emp001-configuration';
import { handleRegistryRequest } from './registry';

interface Env extends ConfigurationEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const configurationResponse = await handleEMP001Configuration(request, env);
    if (configurationResponse) return configurationResponse;
    const registryResponse = await handleRegistryRequest(request, env);
    if (registryResponse) return registryResponse;

    const url = new URL(request.url);
    if (url.pathname === '/') {
      url.pathname = '/empresas.html';
      return env.ASSETS.fetch(new Request(url.toString(), request));
    }
    return env.ASSETS.fetch(request);
  }
};

