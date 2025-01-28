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

    // Add JavaScript
    if (artifact.js) {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'module';
      
      // Wrap the code in an IIFE and add error handling
      const wrappedCode = `
        (async function() {
          try {
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