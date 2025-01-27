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

    // Check if the text contains any code
    const hasHTML = htmlRegex.test(text);
    const hasCSS = cssBlockRegex.test(text) || inlineStyleRegex.test(text);
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
      if (cssMatches.length) {
        result.artifact.css = cssMatches.join('\n');
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

      // Extract plain text by removing all HTML tags
      result.plainText = text.replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
    }

    return result;
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