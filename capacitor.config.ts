import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.estudoadaptativo.app',
  appName: 'Estudo Adaptativo',
  webDir: 'public',
  server: {
    hostname: 'localhost',
    androidScheme: 'https'
  }
};

export default config;
