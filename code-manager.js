export class CodeManager {
  constructor() {
    this.storageKey = 'chatbot_codebase';
    this.codebase = this.loadCodebase();
  }

  loadCodebase() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
    
    // Initialize with default codebase
    return {
      'app.js': this.stripComments(this.getDefaultAppJs()),
      'memory.js': this.stripComments(this.getDefaultMemoryJs()),
      'speech.js': this.stripComments(this.getDefaultSpeechJs()),
      'settings.js': this.stripComments(this.getDefaultSettingsJs()),
      'artifact-renderer.js': this.stripComments(this.getDefaultArtifactRendererJs()),
      'styles.css': this.stripComments(this.getDefaultStyles()),
      'index.html': this.stripComments(this.getDefaultHtml())
    };
  }

  stripComments(code) {
    // Basic comment stripping - you might want to use a more robust solution
    return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  }

  saveCodebase() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.codebase));
  }

  getFile(filename) {
    return this.codebase[filename] || null;
  }

  updateFile(filename, content) {
    this.codebase[filename] = content;
    this.saveCodebase();
  }

  getAllFiles() {
    return Object.keys(this.codebase);
  }

  getFileContents() {
    return this.codebase;
  }

  // Default code getters
  getDefaultAppJs() {
    return document.querySelector('script[src="app.js"]')?.textContent || '';
  }

  getDefaultMemoryJs() {
    return document.querySelector('script[src="memory.js"]')?.textContent || '';
  }

  getDefaultSpeechJs() {
    return document.querySelector('script[src="speech.js"]')?.textContent || '';
  }

  getDefaultSettingsJs() {
    return document.querySelector('script[src="settings.js"]')?.textContent || '';
  }

  getDefaultArtifactRendererJs() {
    return document.querySelector('script[src="artifact-renderer.js"]')?.textContent || '';
  }

  getDefaultStyles() {
    return document.querySelector('link[href="styles.css"]')?.textContent || '';
  }

  getDefaultHtml() {
    return document.documentElement.outerHTML;
  }

  async applyCodeChanges() {
    // Create dynamic script elements for all JS files
    for (const [filename, content] of Object.entries(this.codebase)) {
      if (filename.endsWith('.js')) {
        const blob = new Blob([content], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const script = document.createElement('script');
        script.type = 'module';
        script.src = url;
        document.head.appendChild(script);
      }
    }

    // Apply CSS changes
    if (this.codebase['styles.css']) {
      const style = document.createElement('style');
      style.textContent = this.codebase['styles.css'];
      document.head.appendChild(style);
    }
  }
}