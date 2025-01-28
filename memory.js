export class ChatMemory {
  constructor() {
    this.storageKey = 'chatbot_memories';
    this.memories = this.loadMemories();
    this.pendingDeletion = null;
  }

  loadMemories() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : [];
  }

  saveMemories() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.memories));
  }

  async storeMemory(userMessage, botResponse, category = 'general') {
    const memory = {
      timestamp: Date.now(),
      userMessage,
      botResponse,
      category
    };
    
    this.memories.push(memory);
    this.saveMemories();
  }

  async shouldStoreMemory(userMessage, botResponse, memoryConfig) {
    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Given the memory configuration and the current interaction, determine if this should be stored as a memory.
          Consider the memory mode, any specified keywords, and categories.
          
          Memory Modes:
          - manual-only: Only store when user explicitly requests
          - remember-all: Store all meaningful interactions
          - selective: Store based on keywords and categories
          
          Memory Config:
          ${JSON.stringify(memoryConfig, null, 2)}
          
          User Message: "${userMessage}"
          Bot Response: "${botResponse}"
          
          Rules:
          1. For manual-only: Only return true if user explicitly mentions remembering/storing
          2. For remember-all: Return true unless purely conversational
          3. For selective: Check against keywords and categories
          
          interface Response {
            shouldStore: boolean;
            category?: string;
            reason?: string;
          }
          
          Example:
          {
            "shouldStore": true,
            "category": "preferences",
            "reason": "Contains user preference information about favorite colors"
          }
          `,
          data: {
            userMessage,
            botResponse,
            memoryConfig
          }
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error analyzing memory storage:', error);
      // Default to storing in case of error
      return { shouldStore: true, category: 'general' };
    }
  }

  async getRelevantMemories(userMessage) {
    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Given the user's message, analyze the stored memories and return the most relevant ones.
          Return an empty array if no memories are relevant.
          
          interface Response {
            relevantMemories: {
              userMessage: string;
              botResponse: string;
              timestamp: number;
            }[];
          }
          
          {
            "relevantMemories": [
              {
                "userMessage": "What's your favorite color?",
                "botResponse": "I particularly like blue, it reminds me of the sky and ocean.",
                "timestamp": 1678234567890
              }
            ]
          }
          `,
          data: {
            currentMessage: userMessage,
            memories: this.memories
          }
        }),
      });
      
      const result = await response.json();
      return result.relevantMemories;
    } catch (error) {
      console.error('Error getting relevant memories:', error);
      return [];
    }
  }

  async getMemorySelections(query) {
    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Given the user's query about which memories to delete, analyze the stored memories and identify potential matches.
          If the query is clear about which memory/memories to delete, return those.
          If the query is ambiguous, return multiple potential matches for user selection.
          If the query indicates deleting all memories, return "ALL".
          
          interface Response {
            matches: {
              id: number;
              userMessage: string;
              botResponse: string;
              timestamp: number;
            }[] | "ALL";
            isAmbiguous: boolean;
            suggestedPrompt?: string;
          }
          
          Example:
          {
            "matches": [
              {
                "id": 1,
                "userMessage": "What's your favorite color?",
                "botResponse": "I like blue",
                "timestamp": 1678234567890
              }
            ],
            "isAmbiguous": true,
            "suggestedPrompt": "I found multiple memories about colors. Which one would you like to delete?"
          }
          `,
          data: {
            query: query,
            memories: this.memories
          }
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error analyzing memory deletion request:', error);
      return { matches: [], isAmbiguous: false };
    }
  }

  confirmDeletion(confirmed) {
    if (!this.pendingDeletion) return false;
    
    if (confirmed) {
      if (this.pendingDeletion === 'ALL') {
        this.clearMemories();
      } else if (Array.isArray(this.pendingDeletion)) {
        this.memories = this.memories.filter(memory => 
          !this.pendingDeletion.some(pending => 
            pending.timestamp === memory.timestamp && 
            pending.userMessage === memory.userMessage
          )
        );
        this.saveMemories();
      }
    }
    
    this.pendingDeletion = null;
    return true;
  }

  setPendingDeletion(memories) {
    this.pendingDeletion = memories;
  }

  getMemoryPreview(memory) {
    const date = new Date(memory.timestamp).toLocaleDateString();
    return `[${date}] User: "${memory.userMessage.substring(0, 30)}${memory.userMessage.length > 30 ? '...' : ''}"`;
  }

  // Clear all memories
  clearMemories() {
    this.memories = [];
    this.saveMemories();
  }

  // Clear memories by category
  clearMemoriesByCategory(category) {
    this.memories = this.memories.filter(memory => memory.category !== category);
    this.saveMemories();
  }

  // Get memories by category
  getMemoriesByCategory(category) {
    return this.memories.filter(memory => memory.category === category);
  }
}