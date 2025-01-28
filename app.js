import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { Settings } from './settings.js';
import { CodeManager } from './code-manager.js';

class ChatBot {
  constructor() {
    this.settings = new Settings();
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler(this.settings);
    this.artifactRenderer = new ArtifactRenderer();
    this.codeManager = new CodeManager();
    this.chatHistory = document.getElementById('chatHistory');
    this.userInput = document.getElementById('userInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.toggleInput = document.getElementById('dualRequestToggle');
    this.ttsToggle = document.getElementById('ttsToggle');
    
    this.setupEventListeners();
    this.conversationContext = [];
    this.replyingToMessage = null;
    this.initializeToggles();
  }

  initializeToggles() {
    const isDualMode = this.settings.getSetting('dualRequestMode');
    const isTtsEnabled = this.settings.getSetting('ttsEnabled');
    
    this.toggleInput.checked = isDualMode;
    this.ttsToggle.checked = isTtsEnabled;
    this.updateRequestModeIcons(isDualMode);
  }

  updateRequestModeIcons(isDualMode) {
    const singleW = document.querySelector('.single-w');
    const dualW = document.querySelector('.dual-w');
    
    if (isDualMode) {
      singleW.classList.add('active');
      dualW.classList.add('active');
    } else {
      singleW.classList.add('active');
      dualW.classList.remove('active');
    }
  }

  createFallingToken(charCount) {
    const token = document.createElement('div');
    token.className = 'falling-token';
    
    const img = document.createElement('img');
    img.src = 'w.png';
    token.appendChild(img);
    
    const countDisplay = document.createElement('div');
    countDisplay.className = 'char-count';
    countDisplay.textContent = this.formatCharCount(charCount);
    token.appendChild(countDisplay);
    
    const container = document.getElementById('tokenContainer');
    const startX = Math.random() * 60; 
    token.style.right = `${startX}px`;
    
    container.appendChild(token);
    
    token.addEventListener('animationend', () => {
      container.removeChild(token);
    });
  }

  formatCharCount(count) {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
    
    this.toggleInput.addEventListener('change', (e) => {
      const isDualMode = e.target.checked;
      this.settings.updateSetting('dualRequestMode', isDualMode);
      this.updateRequestModeIcons(isDualMode);
    });
    
    this.ttsToggle.addEventListener('change', (e) => {
      this.settings.updateSetting('ttsEnabled', e.target.checked);
    });

    this.chatHistory.addEventListener('click', (e) => {
      if (e.target.classList.contains('reply-button')) {
        const messageElement = e.target.closest('.message');
        const messageText = messageElement.querySelector('.message-text').textContent;
        this.handleReply(messageText);
      }
    });
  }

  handleReply(messageText) {
    this.replyingToMessage = messageText;
    this.userInput.placeholder = `Replying to: ${messageText.substring(0, 30)}...`;
    this.userInput.focus();
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';
    this.userInput.placeholder = 'Type your message...';
    
    // Create context with just the replied-to message if it exists
    if (this.replyingToMessage) {
      this.conversationContext = [
        { role: 'assistant', content: this.replyingToMessage },
        { role: 'user', content: userMessage }
      ];
    } else {
      this.conversationContext.push({ role: 'user', content: userMessage });
    }
    
    const contextString = JSON.stringify(this.conversationContext);
    this.createFallingToken(contextString.length);

    this.createFallingToken(userMessage.length);

    const isDualMode = this.settings.getSetting('dualRequestMode');
    const isTtsEnabled = this.settings.getSetting('ttsEnabled');
    
    try {
      let relevantMemories = [];
      
      if (isDualMode) {
        const memoryContext = JSON.stringify(this.conversationContext);
        this.createFallingToken(memoryContext.length);
        relevantMemories = await this.memory.getRelevantMemories(userMessage);
      }
      
      const response = await this.getAIResponse(userMessage, relevantMemories, isDualMode);
      
      this.conversationContext.push({ role: 'assistant', content: response.message });
      
      this.addMessageToChat(response.message, 'bot');
      
      if (isTtsEnabled) {
        await this.speech.speak(response.message);
      }

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
    
    // Reset reply state
    this.replyingToMessage = null;
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

      const isCodeQuery = userMessage.toLowerCase().includes('code') ||
                         userMessage.toLowerCase().includes('codebase') ||
                         userMessage.toLowerCase().includes('modify') ||
                         userMessage.toLowerCase().includes('change code');

      const allMemories = isMemoryQuery ? this.memory.loadMemories() : [];
      const memoryConfig = this.settings.getMemoryConfig();
      const codebase = isCodeQuery ? this.codeManager.getFileContents() : null;

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
          
          ${isCodeQuery ? `
          You have access to the full codebase. You can:
          1. Explain how specific parts of the code work
          2. Modify code when requested
          3. Add new features through code changes
          
          If code changes are requested, include them in the codeChanges property.
          
          Current codebase:
          ${JSON.stringify(codebase, null, 2)}
          ` : ''}
          
          IMPORTANT RENDERING INSTRUCTIONS:
          1. When you want to create visual or interactive content, use the artifact property in your response.
          2. Keep your main message focused on conversation - don't include code or HTML there.
          3. Put ALL HTML, CSS, and JavaScript in the artifact property.
          4. If you need to explain what an artifact does, include that in your message property.
          
          Memory System Configuration:
          You can help users configure memory storage behavior with these modes:
          - selective (default): Store important information based on configured categories and keywords
          - remember-all: Store all meaningful interactions
          - manual-only: Only store memories when explicitly requested
          
          Current memory settings:
          ${JSON.stringify(memoryConfig, null, 2)}
          
          If the user asks about changing memory settings, you can:
          1. Set the memory mode
          2. Define keywords to trigger memory storage
          3. Set up categories for organizing memories
          4. Explain current memory settings
          
          When configuring memories, return memoryConfig in the response.
          
          ${isDualMode ? 
            `Dual Request Mode is active: I analyze past memories before responding` : 
            `Dual Request Mode is inactive: I respond directly without checking memories`}

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
            codeChanges?: {
              [filename: string]: string;
            };
          }
          
          Example Response with Artifact:
          {
            "message": "I've created a simple counter button for you to try out.",
            "shouldRemember": false,
            "artifact": {
              "html": "<button id='counterBtn'>Clicks: 0</button>",
              "css": "#counterBtn { padding: 10px; }",
              "js": "const btn = document.getElementById('counterBtn'); let count = 0; btn.onclick = () => { count++; btn.textContent = 'Clicks: ' + count; };",
              "containerId": "counter-demo"
            }
          }`,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            currentSettings: currentSettings,
            codebase: codebase
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

      if (result.codeChanges) {
        Object.entries(result.codeChanges).forEach(([filename, content]) => {
          this.codeManager.updateFile(filename, content);
        });
        await this.codeManager.applyCodeChanges();
      }
      
      return result;
    } catch (error) {
      throw new Error('Failed to get AI response');
    }
  }

  addMessageToChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-text');
    messageContent.textContent = message;
    messageDiv.appendChild(messageContent);
    
    const replyButton = document.createElement('button');
    replyButton.classList.add('reply-button');
    replyButton.innerHTML = '↩️';
    replyButton.title = 'Reply to this message';
    messageDiv.appendChild(replyButton);

    if (this.replyingToMessage) {
      messageDiv.classList.add('replied-to');
      const replyContext = document.createElement('div');
      replyContext.classList.add('reply-context');
      replyContext.textContent = `↩️ ${this.replyingToMessage.substring(0, 50)}...`;
      messageDiv.appendChild(replyContext);
    }

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

window.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});