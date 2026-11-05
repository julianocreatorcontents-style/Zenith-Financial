import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zenith.financial',
  appName: 'Zenith Financial',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
      webClientId: "856813811351-v2p4g59diffg9p82llkb8nrj05ptftvl.apps.googleusercontent.com",
      useCredentialManager: false
    },
  },
};

export default config;
