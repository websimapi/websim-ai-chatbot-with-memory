export class Settings {
  constructor() {
    this.storageKey = 'chatbot_settings';
    const stored = localStorage.getItem(this.storageKey);
    const defaultSettings = {
      voice: null,
      requestMode: 'single',
      ttsEnabled: true,
      memoryMode: 'selective',
      memoryKeywords: [],
      memoryCategories: [],
    };
    this.settings = stored ? JSON.parse(stored) : defaultSettings;
  }

  loadSettings() {
    const stored = localStorage.getItem(this.storageKey);
    const defaultSettings = {
      voice: null,
      requestMode: 'single',
      ttsEnabled: true,
      memoryMode: 'selective',
      memoryKeywords: [],
      memoryCategories: [],
    };
    return stored ? JSON.parse(stored) : defaultSettings;
  }

  saveSettings() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
  }

  getSetting(key) {
    return this.settings[key];
  }

  updateMemoryConfig(config) {
    if (config.mode) this.settings.memoryMode = config.mode;
    if (config.keywords) this.settings.memoryKeywords = config.keywords;
    if (config.categories) this.settings.memoryCategories = config.categories;
    this.saveSettings();
  }

  getMemoryConfig() {
    return {
      mode: this.settings.memoryMode,
      keywords: this.settings.memoryKeywords,
      categories: this.settings.memoryCategories
    };
  }
}