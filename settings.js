export class Settings {
  constructor() {
    this.storageKey = 'chatbot_settings';
    this.settings = this.loadSettings();
  }

  loadSettings() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : {
      voice: null,
      dualRequestMode: true,
      ttsEnabled: true,
      memoryMode: 'selective', 
      memoryKeywords: [], 
      memoryCategories: [], 
    };
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