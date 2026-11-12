import type { ConnectionLike } from './index.js';

/** Admin-only history; notification data and configured endpoints never reach the panel. */
export interface CommunicationMessage {
  id: string;
  notification_id: string;
  recipient: string;
  message: string;
  title: string;
  priority: 'info' | 'normal' | 'high' | 'critical';
  at: string;
  channel: string;
  status: 'sent' | 'skipped' | 'failed' | 'queued' | 'duplicate' | 'acknowledged' | 'digested';
  reason: string;
  ack: boolean;
}

export async function getRecentMessages(
  connection: ConnectionLike,
): Promise<CommunicationMessage[]> {
  const response = await connection.sendMessagePromise<{ messages: CommunicationMessage[] }>({
    type: 'homebrain/communication/recent',
  });
  return response.messages;
}
