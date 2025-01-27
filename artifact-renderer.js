export class ArtifactRenderer {
  constructor() {
    this.artifacts = new Map();
  }

  async render(artifact) {
    const container = document.createElement('div');
    container.className = 'artifact-wrapper';
    
    if (artifact.containerId) {
      container.id = artifact.containerId;
    }

    // Add HTML content
    if (artifact.html) {
      container.innerHTML = artifact.html;
    }

    // Add CSS styles
    if (artifact.css) {
      const styleElement = document.createElement('style');
      styleElement.textContent = artifact.css;
      container.appendChild(styleElement);
    }

    // Add JavaScript
    if (artifact.js) {
      // Create a safe scope for the artifact's JavaScript
      const scriptElement = document.createElement('script');
      scriptElement.type = 'module';
      
      // Wrap the code in an IIFE to avoid global scope pollution
      const wrappedCode = `
        (function() {
          try {
            ${artifact.js}
          } catch (error) {
            console.error('Artifact execution error:', error);
          }
        })();
      `;
      
      scriptElement.textContent = wrappedCode;
      container.appendChild(scriptElement);
    }

    return container;
  }

  // Clean up artifacts if needed
  cleanup(containerId) {
    const artifact = this.artifacts.get(containerId);
    if (artifact) {
      // Perform any necessary cleanup
      this.artifacts.delete(containerId);
    }
  }
}