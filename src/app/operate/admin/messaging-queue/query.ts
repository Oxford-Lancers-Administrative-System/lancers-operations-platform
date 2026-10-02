import {
  CHANNEL_FILTERS,
  DEFAULT_WINDOW,
  KIND_FAMILY_KEYS,
  parseChoice,
  STATUS_FILTERS,
  WINDOWS,
  type ChannelFilter,
  type KindFamily,
  type QueueWindow,
  type StatusFilter,
} from "@/lib/services/message-queue-vocabulary";

/** The page's URL state. Anything unrecognised reads as its default rather than refusing. */
export interface MessagesQuery {
  readonly window: QueueWindow;
  readonly status: StatusFilter | null;
  readonly channel: ChannelFilter | null;
  readonly kind: KindFamily | null;
  readonly page: number;
}

export function parseMessagesQuery(
  params: Record<string, string | string[] | undefined>,
): MessagesQuery {
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  return {
    window: parseChoice(params.window, WINDOWS) ?? DEFAULT_WINDOW,
    status: parseChoice(params.status, STATUS_FILTERS),
    channel: parseChoice(params.channel, CHANNEL_FILTERS),
    kind: parseChoice(params.kind, KIND_FAMILY_KEYS),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function messagesHref(basePath: string, query: MessagesQuery): string {
  const params = new URLSearchParams();
  if (query.window !== DEFAULT_WINDOW) params.set("window", query.window);
  if (query.status) params.set("status", query.status);
  if (query.channel) params.set("channel", query.channel);
  if (query.kind) params.set("kind", query.kind);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search === "" ? basePath : `${basePath}?${search}`;
}
