// Global configuration module
// Provides a centralized place for configuration that needs to be set before module initialization

interface GlobalConfig {
  mimoHome?: string;
}

const config: GlobalConfig = {};

export function setMimoHome(path: string): void {
  config.mimoHome = path;
}

export function getMimoHome(): string | undefined {
  return config.mimoHome;
}

export function clearConfig(): void {
  config.mimoHome = undefined;
}
