interface Container {
  kind: '{' | '[';
  expectKey: boolean;
  key: string;
}

/**
 * Reads a JSON document that arrives in fragments and returns the decoded text of
 * string values whose key is in `keys`. Separate values are joined with "; ".
 */
export class JsonTextExtractor {
  private readonly stack: Container[] = [];
  private inString = false;
  private isKey = false;
  private emitting = false;
  private emitted = 0;
  private pendingSeparator = false;
  private keyText = '';
  private escape: '' | '\\' | 'u' = '';
  private hex = '';

  constructor(private readonly keys: ReadonlySet<string>) {}

  push(chunk: string): string {
    let out = '';
    for (const ch of chunk) {
      if (this.inString) out += this.inStringChar(ch);
      else this.outsideChar(ch);
    }
    return out;
  }

  private top(): Container | undefined {
    return this.stack[this.stack.length - 1];
  }

  private outsideChar(ch: string): void {
    const top = this.top();
    if (ch === '"') {
      this.inString = true;
      this.isKey = top?.kind === '{' && top.expectKey;
      this.keyText = '';
      this.emitting = !this.isKey && top?.kind === '{' && this.keys.has(top.key);
      if (this.emitting) {
        this.pendingSeparator = this.emitted > 0;
        this.emitted += 1;
      }
    } else if (ch === '{' || ch === '[') {
      this.stack.push({ kind: ch, expectKey: ch === '{', key: '' });
    } else if (ch === '}' || ch === ']') {
      this.stack.pop();
    } else if (ch === ':' && top) {
      top.expectKey = false;
    } else if (ch === ',' && top?.kind === '{') {
      top.expectKey = true;
    }
  }

  private inStringChar(ch: string): string {
    if (this.escape === 'u') {
      this.hex += ch;
      if (this.hex.length < 4) return '';
      const decoded = String.fromCharCode(parseInt(this.hex, 16) || 0xfffd);
      this.escape = '';
      this.hex = '';
      return this.take(decoded);
    }
    if (this.escape === '\\') {
      this.escape = '';
      if (ch === 'u') {
        this.escape = 'u';
        return '';
      }
      const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
      return this.take(map[ch] ?? ch);
    }
    if (ch === '\\') {
      this.escape = '\\';
      return '';
    }
    if (ch === '"') {
      this.inString = false;
      const top = this.top();
      if (this.isKey && top) top.key = this.keyText;
      this.emitting = false;
      return '';
    }
    return this.take(ch);
  }

  private take(text: string): string {
    if (this.isKey) {
      this.keyText += text;
      return '';
    }
    if (!this.emitting) return '';
    const separator = this.pendingSeparator ? '; ' : '';
    this.pendingSeparator = false;
    return separator + text;
  }
}
