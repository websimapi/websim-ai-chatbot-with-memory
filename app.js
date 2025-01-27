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

    // Add user message to conversation context
    this.conversationContext.push({ role: 'user', content: userMessage });

    const isDualMode = this.settings.getSetting('dualRequestMode');
    
    try {
      let relevantMemories = [];
      
      // Only fetch memories in dual request mode
      if (isDualMode) {
        relevantMemories = await this.memory.getRelevantMemories(userMessage);
      }
      
      // Get AI response
      const response = await this.getAIResponse(userMessage, relevantMemories, isDualMode);
      
      // Add bot response to conversation context
      this.conversationContext.push({ role: 'assistant', content: response.message });
      
      // Add message to chat
      this.addMessageToChat(response.message, 'bot');
      
      // Speak the response
      await this.speech.speak(response.message);

      // If the AI determined this should be remembered, store it
      if (response.shouldRemember) {
        const memoryConfig = this.settings.getMemoryConfig();
        const shouldStore = await this.memory.shouldStoreMemory(userMessage, response.message, memoryConfig);
        
        if (shouldStore.shouldStore) {
          await this.memory.storeMemory(userMessage, response.message, shouldStore.category);
        }
      }

      // Handle artifact rendering if present
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

      const prompt = isDualMode ? 
        `You are a helpful AI assistant with memory configuration capabilities.
        ${isMemoryConfig ? `
        You can help users configure how memories are stored. The current memory modes are:
        - selective (default): Store important information based on configured categories and keywords
        - remember-all: Store all meaningful interactions
        - manual-only: Only store memories when explicitly requested
        
        You can suggest and help set up specific keywords or categories to remember.
        ` : ''}
        Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
        If the response should be stored as a long-term memory, set shouldRemember to true.
        Use the relevant memories provided if they help inform your response.
        
        If the user asks about memory or stored data, you have access to allStoredMemories which contains
        all memories stored in localStorage. You can create an artifact to display this data in a nice format,
        or include it in your response.
        
        If the user asks about Dual Request Mode or what it means, explain that:
        "Dual Request Mode means the AI makes two separate analyses for each response:
        1. First, it analyzes your message to find relevant memories from past conversations
        2. Then, it uses those memories alongside the current conversation to give you a more informed response
        
        When disabled, the AI responds using only the current conversation context without checking past memories.
        This mode is useful when you want the AI to have a better memory of past interactions and provide more contextually aware responses."` :
        `You are a helpful AI assistant with the ability to create interactive content and manage memory.
        Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
        Analyze the conversation context to determine if this interaction should be remembered for future reference.
        
        If the user asks about memory or stored data, you have access to allStoredMemories which contains
        all memories stored in localStorage. You can create an artifact to display this data in a nice format,
        or include it in your response.
        
        If you think this interaction contains important information that could be relevant later,
        set shouldRemember to true.
        
        If the user asks about Dual Request Mode or what it means, explain that:
        "Dual Request Mode is currently disabled. When enabled, it allows me to make two separate analyses:
        1. First, I analyze your message to find relevant memories from past conversations
        2. Then, I use those memories alongside the current conversation to give you a more informed response
        
        Currently, I'm operating in single request mode, which means I'm using only our current conversation context
        without checking past memories. You can enable Dual Request Mode using the toggle in the top-right corner
        if you'd like me to include relevant past memories in my responses."`;

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt + `
          
          If the user asks about changing voices or mentions anything related to voice/speaking,
          use the currentSettings.availableVoices list to suggest appropriate voices and set selectedVoice
          to the best matching voice name. The current voice is marked with "current: true" in the list.
          
          If the user is configuring memory settings, provide guidance and update the memory configuration.
          You can set memory mode, define keywords that should trigger memory storage, and specify categories
          of information to remember.
          
          When responding to memory-related queries, you can create an artifact to display the memory data
          in a table or other visual format. Make it easy to read and understand.
          
          If the user requests or would benefit from visual/interactive content, create an appropriate artifact.
          
          interface Response {
            message: string;
            shouldRemember: boolean;
            selectedVoice?: string;
            memoryConfig?: {
              mode?: 'selective' | 'remember-all' | 'manual-only';
              keywords?: string[];
              categories?: string[];
            };
            artifact?: {
              html?: string;
              css?: string;
              js?: string;
              containerId?: string;
            };
          }
          `,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            currentSettings: currentSettings
          }
        }),
      });
      
      const result = await response.json();
      
      // Handle memory configuration updates
      if (result.memoryConfig) {
        this.settings.updateMemoryConfig(result.memoryConfig);
      }

      // Handle voice selection
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
```
Note that I have removed the redundant `// ... rest of existing class ...` comments and the redundant code in the `handleUserInput` method. Also, I have moved the artifact rendering code to the `handleUserInput` method as per the plan.