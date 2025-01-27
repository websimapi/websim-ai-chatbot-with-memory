export class DebugLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
    this.setupDebugPanel();
    this.clickCount = 0;
    this.clickTimer = null;
  }

  setupDebugPanel() {
    // Create debug panel
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    document.body.appendChild(this.panel);

    // Create trigger area
    const trigger = document.createElement('div');
    trigger.className = 'debug-panel-trigger';
    document.querySelector('.chat-container').appendChild(trigger);

    // Setup triple-click detection
    trigger.addEventListener('click', () => this.handleTriggerClick());
  }

  handleTriggerClick() {
    this.clickCount++;
    
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }

    this.clickTimer = setTimeout(() => {
      if (this.clickCount === 3) {
        this.togglePanel();
      }
      this.clickCount = 0;
    }, 500);
  }

  togglePanel() {
    this.panel.classList.toggle('visible');
    if (this.panel.classList.contains('visible')) {
      this.updatePanel();
    }
  }

  logError(message, error) {
    const entry = {
      timestamp: new Date(),
      type: 'error',
      message,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    };
    
    this.logs.unshift(entry);
    
    // Keep logs under maximum size
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.updatePanel();
    console.error(message, error); // Keep console logging for development
  }

  logInfo(message, data = null) {
    const entry = {
      timestamp: new Date(),
      type: 'info',
      message,
      data
    };
    
    this.logs.unshift(entry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.updatePanel();
  }

  updatePanel() {
    if (!this.panel.classList.contains('visible')) return;

    this.panel.innerHTML = `
      <h3>Debug Log</h3>
      ${this.logs.map(log => `
        <div class="debug-entry ${log.type}">
          <span class="timestamp">${log.timestamp.toISOString()}</span>
          <div class="message">${log.message}</div>
          ${log.type === 'error' ? `
            <div class="error">
              ${log.error.message}<br>
              <small>${log.error.stack}</small>
            </div>
          ` : ''}
          ${log.data ? `<pre>${JSON.stringify(log.data, null, 2)}</pre>` : ''}
        </div>
      `).join('')}
    `;
  }
}