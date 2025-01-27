export class ContentParser {
  static extractContent(text) {
    const result = {
      plainText: text,
      hasCode: false,
      artifact: null
    };

    // Regular expressions for matching code blocks
    const htmlRegex = /<[^>]*>.*?<\/[^>]*>|<[^/>][^>]*\/>/;
    const cssBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const jsBlockRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const inlineStyleRegex = /style=["'](.*?)["']/gi;
    const inlineJsRegex = /on\w+=['"](.*?)['"]/gi;
    const standaloneCSS = /(\{[^{}]*\})|([^{}]+\{[^{}]*\})/g;

    // Check if the text contains any code
    const hasHTML = htmlRegex.test(text);
    const hasCSS = cssBlockRegex.test(text) || inlineStyleRegex.test(text) || standaloneCSS.test(text);
    const hasJS = jsBlockRegex.test(text) || inlineJsRegex.test(text);

    if (hasHTML || hasCSS || hasJS) {
      result.hasCode = true;
      result.artifact = {
        html: '',
        css: '',
        js: '',
        containerId: `artifact-${Date.now()}`
      };

      // Extract CSS from <style> blocks
      let cssMatches = [];
      let match;
      while ((match = cssBlockRegex.exec(text)) !== null) {
        cssMatches.push(match[1]);
        text = text.replace(match[0], ''); // Remove the style block
      }

      // Extract standalone CSS (curly brace blocks)
      let cssText = text;
      let standaloneMatches = [];
      while ((match = standaloneCSS.exec(cssText)) !== null) {
        // Verify this is actually CSS by checking for common CSS patterns
        const potentialCSS = match[0];
        if (ContentParser.looksLikeCSS(potentialCSS)) {
          standaloneMatches.push(potentialCSS);
          text = text.replace(potentialCSS, ''); // Remove the CSS block
        }
      }

      if (cssMatches.length || standaloneMatches.length) {
        result.artifact.css = [...cssMatches, ...standaloneMatches].join('\n');
      }

      // Extract JavaScript from <script> blocks
      let jsMatches = [];
      while ((match = jsBlockRegex.exec(text)) !== null) {
        jsMatches.push(match[1]);
        text = text.replace(match[0], ''); // Remove the script block
      }
      if (jsMatches.length) {
        result.artifact.js = jsMatches.join('\n');
      }

      // The remaining HTML content
      result.artifact.html = text;

      // Extract plain text by removing all HTML tags and cleaning up
      result.plainText = text
        .replace(/<[^>]*>/g, ' ')           // Remove HTML tags
        .replace(/\{[^{}]*\}/g, '')         // Remove CSS curly brace blocks
        .replace(/\s+/g, ' ')               // Normalize whitespace
        .replace(/\b\w+:\s*[^;]+;/g, '')    // Remove CSS property declarations
        .replace(/^\s+|\s+$/g, '');         // Trim
    }

    return result;
  }

  static looksLikeCSS(text) {
    // Common CSS indicators
    const cssPatterns = [
      /[#.][a-zA-Z-_][a-zA-Z0-9-_]*\s*\{/,  // Class or ID selector
      /\b(margin|padding|border|color|background|font|width|height|display|position):/i,  // Common CSS properties
      /\b(px|em|rem|vh|vw|%)\b/,  // Common CSS units
      /\b(solid|dashed|dotted|none|block|flex|grid|absolute|relative)\b/,  // Common CSS values
      /[@]?(media|keyframes|import|font-face)\b/  // CSS at-rules
    ];

    // Check if the text contains any CSS-like patterns
    return cssPatterns.some(pattern => pattern.test(text));
  }

  static isInteractive(content) {
    // Check for interactive elements
    const interactiveElements = [
      /<button/i,
      /<input/i,
      /<select/i,
      /<textarea/i,
      /<form/i,
      /<canvas/i,
      /onclick/i,
      /addEventListener/i,
      /@keydown/i,
      /@click/i,
      /\.addEventListener/i
    ];

    return interactiveElements.some(regex => regex.test(content));
  }

  static validateArtifact(artifact) {
    // Remove potentially harmful content
    if (artifact.html) {
      // Remove script tags but preserve their content if needed
      artifact.html = artifact.html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Remove inline event handlers
      artifact.html = artifact.html.replace(/\son\w+="[^"]*"/gi, '');
      artifact.html = artifact.html.replace(/\son\w+='[^']*'/gi, '');
    }

    if (artifact.js) {
      // Remove eval and similar dangerous functions
      const dangerousFunctions = ['eval', 'Function', 'setTimeout', 'setInterval'];
      dangerousFunctions.forEach(func => {
        const regex = new RegExp(`\\b${func}\\s*\\(`, 'g');
        artifact.js = artifact.js.replace(regex, `/* ${func} not allowed */(`);
      });
    }

    return artifact;
  }
}