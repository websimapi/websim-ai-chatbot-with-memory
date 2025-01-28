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
    this.toggleInput = document.getElementById('requestModeToggle');
    this.ttsToggle = document.getElementById('ttsToggle');
    
    this.setupEventListeners();
    this.conversationContext = [];
    this.replyingToMessage = null;
    this.confirmationActive = false;
    this.requestQueue = [];
    this.processingRequest = false;
    this.requestMode = this.settings.getSetting('requestMode') || 'single';
    this.lastRequestTime = 0;
    this.REQUEST_DELAY = 3000; // 3 seconds between requests
    this.initializeRequestMode();
  }

  initializeRequestMode() {
    const mode = this.settings.getSetting('requestMode') || 'single';
    this.toggleInput.value = mode;
    this.updateRequestModeIcons(mode);
  }

  updateRequestModeIcons(mode) {
    const container = document.querySelector('.toggle-icons');
    container.innerHTML = '';
    
    const numW = mode === 'single' ? 1 : mode === 'dual' ? 2 : 3;
    
    for (let i = 0; i < numW; i++) {
      const img = document.createElement('img');
      img.src = 'w.png';
      img.alt = `W ${i + 1}`;
      img.className = 'mode-w active';
      container.appendChild(img);
    }
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
    
    this.toggleInput.addEventListener('change', (e) => {
      const mode = e.target.value;
      this.settings.updateSetting('requestMode', mode);
      this.requestMode = mode;
      this.updateRequestModeIcons(mode);
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

  async processRequestQueue() {
    if (this.processingRequest || this.requestQueue.length === 0) return;
    
    this.processingRequest = true;
    const currentTime = Date.now();
    const timeSinceLastRequest = currentTime - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY - timeSinceLastRequest));
    }
    
    const request = this.requestQueue.shift();
    this.lastRequestTime = Date.now();
    
    try {
      const response = await request();
      this.createFallingToken(JSON.stringify(response).length);
    } catch (error) {
      console.error('Error processing request:', error);
    } finally {
      this.processingRequest = false;
      setTimeout(() => this.processRequestQueue(), 100);
    }
  }

  queueRequest(requestFn) {
    this.requestQueue.push(requestFn);
    this.processRequestQueue();
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    // Check if we're waiting for deletion confirmation
    if (this.confirmationActive) {
      if (userMessage.toLowerCase() === 'confirm') {
        this.memory.confirmDeletion(true);
        this.addMessageToChat('Memories deleted successfully.', 'bot');
        this.confirmationActive = false;
      } else {
        this.memory.confirmDeletion(false);
        this.addMessageToChat('Deletion cancelled.', 'bot');
        this.confirmationActive = false;
      }
      this.userInput.value = '';
      return;
    }

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';
    this.userInput.placeholder = 'Type your message...';
    
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

    const mode = this.settings.getSetting('requestMode') || 'single';
    const isTtsEnabled = this.settings.getSetting('ttsEnabled');
    
    try {
      let relevantMemories = [];
      
      if (mode !== 'single') {
        // Queue memory request
        this.queueRequest(async () => {
          relevantMemories = await this.memory.getRelevantMemories(userMessage);
          return relevantMemories;
        });
      }
      
      // Queue main response request
      this.queueRequest(async () => {
        const response = await this.getAIResponse(userMessage, relevantMemories, mode !== 'single');
        
        this.conversationContext.push({ role: 'assistant', content: response.message });
        this.addMessageToChat(response.message, 'bot');
        
        if (isTtsEnabled) {
          await this.speech.speak(response.message);
        }

        if (response.shouldRemember && mode === 'advanced') {
          // Queue memory storage request
          this.queueRequest(async () => {
            const memoryConfig = this.settings.getMemoryConfig();
            const shouldStore = await this.memory.shouldStoreMemory(userMessage, response.message, memoryConfig);
            
            if (shouldStore.shouldStore) {
              await this.memory.storeMemory(userMessage, response.message, shouldStore.category);
            }
            return shouldStore;
          });
        }

        if (response.artifact) {
          const artifactElement = await this.artifactRenderer.render(response.artifact);
          this.addArtifactToChat(artifactElement);
        }

        return response;
      });

    } catch (error) {
      console.error('Error handling user input:', error);
      this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot');
    }
    
    // Add check for memory deletion requests
    if (userMessage.toLowerCase().includes('delete') || 
        userMessage.toLowerCase().includes('remove') || 
        userMessage.toLowerCase().includes('clear')) {
      const memorySelections = await this.memory.getMemorySelections(userMessage);
      
      if (memorySelections.matches === 'ALL') {
        this.memory.setPendingDeletion('ALL');
        this.addMessageToChat('Are you sure you want to delete ALL memories? Type "confirm" to proceed or any other text to cancel.', 'bot');
        this.confirmationActive = true;
        this.userInput.value = '';
        return;
      }
      
      if (memorySelections.matches.length === 0) {
        this.addMessageToChat('I couldn\'t find any memories matching your request.', 'bot');
        this.userInput.value = '';
        return;
      }

      if (memorySelections.isAmbiguous) {
        let message = memorySelections.suggestedPrompt + '\n\n';
        memorySelections.matches.forEach((memory, index) => {
          message += `${index + 1}. ${this.memory.getMemoryPreview(memory)}\n`;
        });
        message += '\nPlease specify which memory to delete by mentioning its number or more specific details.';
        this.addMessageToChat(message, 'bot');
      } else {
        const memoriesPreview = memorySelections.matches.map(memory => 
          this.memory.getMemoryPreview(memory)
        ).join('\n');
        
        this.memory.setPendingDeletion(memorySelections.matches);
        this.addMessageToChat(`Are you sure you want to delete the following memories?\n\n${memoriesPreview}\n\nType "confirm" to proceed or any other text to cancel.`, 'bot');
        this.confirmationActive = true;
      }
      
      this.userInput.value = '';
      return;
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

      // Get all memories if this is a memory-related query
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
          
          ${isMemoryQuery ? `
          Current Memory System Status:
          1. Memory Mode: ${memoryConfig.mode}
          2. Memory Keywords: ${JSON.stringify(memoryConfig.keywords)}
          3. Memory Categories: ${JSON.stringify(memoryConfig.categories)}
          4. Total Stored Memories: ${allMemories.length}
          
          All stored memories:
          ${JSON.stringify(allMemories, null, 2)}
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
            'Dual Request Mode is active: I analyze past memories before responding' : 
            'Dual Request Mode is inactive: I respond directly without checking memories'}

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
        })
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