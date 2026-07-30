// Wraps any JSON-serializable value as an MCP tool result content block.
// Centralized so tool handlers stay one line and we never drift on shape.
export function json(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Same shape, but for short literal strings (success acknowledgements etc.).
export function text(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
  };
}
