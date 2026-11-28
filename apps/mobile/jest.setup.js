// In-memory AsyncStorage for tests (the official mock from the package).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native modules with no JS fallback — stub them for the Node test environment.
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: jest.fn(), remove: jest.fn() }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    uri: 'file:///clip.m4a',
  }),
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

// 100ms video SDK is native-only; tests use the fake/none video providers.
jest.mock('@100mslive/react-native-hms', () => ({}));

// Web view is native; video screens render without it in tests.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
