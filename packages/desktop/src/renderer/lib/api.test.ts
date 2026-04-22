import { describe, it, expect } from 'vitest';
import { createMessage } from '../lib/api';

describe('API Utilities', () => {
  it('should create a user message', () => {
    const message = createMessage('user', 'Hello, world!');

    expect(message.type).toBe('user');
    expect(message.content).toBe('Hello, world!');
    expect(message.id).toBeDefined();
    expect(message.timestamp).toBeInstanceOf(Date);
  });

  it('should create an assistant message', () => {
    const message = createMessage('assistant', 'Hi there!');

    expect(message.type).toBe('assistant');
    expect(message.content).toBe('Hi there!');
  });

  it('should create an error message', () => {
    const message = createMessage('error', 'Something went wrong');

    expect(message.type).toBe('error');
    expect(message.content).toBe('Something went wrong');
  });
});
