export class Settings {
  constructor() {
    this.storageKey = 'chatbot_settings';
    this.settings = this.loadSettings();
  }

  loadSettings() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : {
      voice: null,
      dualRequestMode: true, // Default to using dual requests
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
}