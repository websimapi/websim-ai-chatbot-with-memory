export class ArtifactRenderer {
  constructor() {
    this.artifacts = new Map();
  }

  async render(artifact) {
    if (!artifact) return null;
    
    const container = document.createElement('div');
    container.className = 'artifact-wrapper';
    
    if (artifact.containerId) {
      container.id = artifact.containerId;
    }

    // Create a separate container for the content
    const contentContainer = document.createElement('div');
    contentContainer.className = 'artifact-content';
    container.appendChild(contentContainer);

    // Add HTML content
    if (artifact.html) {
      contentContainer.innerHTML = artifact.html;
    }

    // Add CSS styles
    if (artifact.css) {
      const styleElement = document.createElement('style');
      styleElement.textContent = artifact.css;
      container.appendChild(styleElement);
    }

    // Add JavaScript with error handling and memory access
    if (artifact.js) {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'module';
      
      // Wrap the code in an IIFE and add error handling and memory access helpers
      const wrappedCode = `
        (async function() {
          try {
            // Add helper functions for memory access
            const getMemories = () => {
              try {
                return JSON.parse(localStorage.getItem('chatbot_memories')) || [];
              } catch (e) {
                console.error('Error accessing memories:', e);
                return [];
              }
            };

            const getSettings = () => {
              try {
                return JSON.parse(localStorage.getItem('chatbot_settings')) || {};
              } catch (e) {
                console.error('Error accessing settings:', e);
                return {};
              }
            };

            // Make memories and settings available to artifact code
            const memories = getMemories();
            const settings = getSettings();

            ${artifact.js}
          } catch (error) {
            console.error('Artifact execution error:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'artifact-error';
            errorDiv.textContent = 'Error executing artifact: ' + error.message;
            document.getElementById('${artifact.containerId || ""}').appendChild(errorDiv);
          }
        })();
      `;
      
      scriptElement.textContent = wrappedCode;
      container.appendChild(scriptElement);
    }

    // Store reference to cleanup later if needed
    if (artifact.containerId) {
      this.artifacts.set(artifact.containerId, artifact);
    }

    return container;
  }

  cleanup(containerId) {
    if (this.artifacts.has(containerId)) {
      // Perform any necessary cleanup
      this.artifacts.delete(containerId);
    }
  }
}