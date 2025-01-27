import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { Settings } from './settings.js';

class ChatBot {
  constructor() {
    this.settings = new Settings();
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler(this.settings);
    this.artifactRenderer = new ArtifactRenderer();
    this.chatHistory = document.getElementById('chatHistory');
    this.userInput = document.getElementById('userInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.toggleInput = document.getElementById('dualRequestToggle');
    
    this.setupEventListeners();
    this.conversationContext = [];
    this.initializeToggle();
  }

  initializeToggle() {
    const isDualMode = this.settings.getSetting('dualRequestMode');
    this.toggleInput.checked = isDualMode;
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
    this.toggleInput.addEventListener('change', (e) => {
      this.settings.updateSetting('dualRequestMode', e.target.checked);
    });
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';

    this.conversationContext.push({ role: 'user', content: userMessage });

    const isDualMode = this.settings.getSetting('dualRequestMode');
    
    try {
      let relevantMemories = [];
      
      if (isDualMode) {
        relevantMemories = await this.memory.getRelevantMemories(userMessage);
      }
      
      const response = await this.getAIResponse(userMessage, relevantMemories, isDualMode);
      
      this.conversationContext.push({ role: 'assistant', content: response.message });
      
      this.addMessageToChat(response.message, 'bot');
      
      await this.speech.speak(response.message);

      if (response.shouldRemember) {
        const memoryConfig = this.settings.getMemoryConfig();
        const shouldStore = await this.memory.shouldStoreMemory(userMessage, response.message, memoryConfig);
        
        if (shouldStore.shouldStore) {
          await this.memory.storeMemory(userMessage, response.message, shouldStore.category);
        }
      }

      if (response.artifact) {
        const artifactElement = await this.artifactRenderer.render(response.artifact);
        this.addArtifactToChat(artifactElement);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot');
    }
  }

  async getAIResponse(userMessage, relevantMemories, isDualMode) {
    try {
      const voiceRelated = userMessage.toLowerCase().includes('voice') || 
                          userMessage.toLowerCase().includes('speak') ||
                          userMessage.toLowerCase().includes('accent');
      
      const isMemoryQuery = userMessage.toLowerCase().includes('memory') || 
                           userMessage.toLowerCase().includes('remember') ||
                           userMessage.toLowerCase().includes('stored');
      
      const isMemoryConfig = userMessage.toLowerCase().includes('memory mode') ||
                            userMessage.toLowerCase().includes('memory settings') ||
                            userMessage.toLowerCase().includes('how to remember');

      const allMemories = isMemoryQuery ? this.memory.loadMemories() : [];
      const memoryConfig = this.settings.getMemoryConfig();

      const currentSettings = {
        voice: this.settings.getSetting('voice'),
        dualRequestMode: isDualMode,
        availableVoices: voiceRelated ? this.speech.getAllVoices() : null,
        allStoredMemories: allMemories,
        memoryConfig: memoryConfig
      };

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a helpful AI assistant that can generate both text responses and interactive artifacts.

          When generating artifacts, follow these guidelines:
          1. Keep the speaking response and artifact separate
          2. The speaking response should describe or introduce what you're showing
          3. Put any HTML/CSS/JS content in the artifact object, not in the message
          4. Use artifacts for visualizations, interactive elements, or structured data display
          
          ${isMemoryConfig ? `
          You can help users configure how memories are stored. The current memory modes are:
          - selective (default): Store important information based on configured categories and keywords
          - remember-all: Store all meaningful interactions
          - manual-only: Only store memories when explicitly requested
          
          You can suggest and help set up specific keywords or categories to remember.
          ` : ''}

          If displaying stored memories or data, create an artifact with proper formatting and styling.
          
          Remember to explain what Dual Request Mode means if asked:
          ${isDualMode ? 
          `"Dual Request Mode means I make two separate analyses for each response:
          1. First, I analyze your message to find relevant memories from past conversations
          2. Then, I use those memories alongside the current conversation to give you a more informed response"` :
          `"Dual Request Mode is currently disabled. When enabled, it would allow me to check past memories before responding."`}
          
          interface Response {
            message: string; // The text/speech response
            shouldRemember: boolean;
            selectedVoice?: string;
            memoryConfig?: {
              mode?: 'selective' | 'remember-all' | 'manual-only';
              keywords?: string[];
              categories?: string[];
            };
            artifact?: {
              html?: string; // HTML content for visualization/interaction
              css?: string; // Styling for the artifact
              js?: string; // Interactive behavior
              containerId?: string; // Unique ID for the container
            };
          }
          
          Example Response:
          {
            "message": "I've created a visualization of your stored memories. You can see them organized by category below.",
            "shouldRemember": false,
            "artifact": {
              "html": "<div class='memory-display'><h2>Stored Memories</h2><div id='memoryList'></div></div>",
              "css": ".memory-display { padding: 20px; } .memory-item { margin: 10px 0; }",
              "js": "const memories = document.getElementById('memoryList'); memories.innerHTML = 'Memory content here';",
              "containerId": "memory-visualization"
            }
          }`,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            currentSettings: currentSettings
          }
        }),
      });
      
      const result = await response.json();
      
      if (result.memoryConfig) {
        this.settings.updateMemoryConfig(result.memoryConfig);
      }

      if (result.selectedVoice) {
        const success = this.speech.setVoice(result.selectedVoice);
        if (!success) {
          result.message += "\n(Note: I wasn't able to switch to the selected voice. I'll continue using my current voice.)";
        }
      }

      return result;
    } catch (error) {
      throw new Error('Failed to get AI response');
    }
  }

  addMessageToChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.textContent = message;
    this.chatHistory.appendChild(messageDiv);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  addArtifactToChat(artifactElement) {
    const artifactContainer = document.createElement('div');
    artifactContainer.classList.add('message', 'bot-message', 'artifact-container');
    artifactContainer.appendChild(artifactElement);
    this.chatHistory.appendChild(artifactContainer);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }
}

// Initialize the chatbot when the page loads
window.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});