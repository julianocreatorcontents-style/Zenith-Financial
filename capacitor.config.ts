import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zenith.financial',
  appName: 'Zenith Financial',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
  },
  server: {
      url: process.env.CAP_SERVER_URL || "http://127.0.0.1:3000",
      cleartext: true,
    },
    plugins: {
    SplashScreen: {
      backgroundColor: "#0a1a12",
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 1500
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
      webClientId: "856813811351-v2p4g59diffg9p82llkb8nrj05ptftvl.apps.googleusercontent.com",
      useCredentialManager: false
    },
  },
};

export default config;
