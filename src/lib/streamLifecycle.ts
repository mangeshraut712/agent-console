export type ActiveAssistantStream = {
  streamId: string;
  messageIdx: number;
};

export type StreamingMessage = {
  isStreaming: boolean;
};

export type StreamCompletionManager = {
  markStreamComplete(streamId: string): boolean;
};

export function completeActiveStream<T extends StreamingMessage>(
  activeStream: ActiveAssistantStream | null,
  streamId: string,
  messages: T[],
  manager: StreamCompletionManager | null,
): ActiveAssistantStream | null {
  if (!activeStream || activeStream.streamId !== streamId) return activeStream;
  if (manager && !manager.markStreamComplete(streamId)) return activeStream;

  const message = messages[activeStream.messageIdx];
  if (message) message.isStreaming = false;
  return null;
}

export function abandonUnconfirmedStream<T extends StreamingMessage>(
  activeStream: ActiveAssistantStream | null,
  messages: T[],
): ActiveAssistantStream | null {
  if (!activeStream) return null;
  const message = messages[activeStream.messageIdx];
  if (message) message.isStreaming = false;
  return null;
}
