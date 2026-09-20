"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BadgePlusIcon,
  BotIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { FAKE_CHAT, FAKE_CHAT_SOURCES } from "@/lib/fake-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useChatProviders,
  useChatSessions,
  useChatThread,
  useCreateChatSession,
  useDeleteChatSession,
  useSendChatMessage,
} from "@/hooks/use-vault";

export function ChatPanel({ noteId }: { noteId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        data-tour="chat-open"
        variant="gradient_primary"
        size="icon-lg"
        aria-label="Open AI chat"
        title="AI chat"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 size-11 rounded-full shadow-lg"
      >
        <SparklesIcon />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md p-0">
          <ChatPanelBody noteId={noteId} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function ChatPanelBody({ noteId }: { noteId?: string }) {
  const providers = useChatProviders();
  const sessions = useChatSessions({ noteId });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const thread = useChatThread(sessionId);
  const demo = sessionId === null;
  const [providerChoice, setProviderChoice] = useState<string | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const [sources, setSources] = useState<string[] | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Demo replays when the panel opens: user turns pop in, assistant turns type out.
  const [demoIndex, setDemoIndex] = useState(0);
  const [demoChars, setDemoChars] = useState(0);

  const create = useCreateChatSession();
  const send = useSendChatMessage();
  const remove = useDeleteChatSession();

  const available = useMemo(
    () => (providers.data?.providers ?? []).filter((p) => p.available),
    [providers.data],
  );
  // Provider and model fall back to the first detected option instead of cascading in effects.
  const provider =
    providerChoice && available.some((p) => p.id === providerChoice)
      ? providerChoice
      : (available[0]?.id ?? "ollama");
  const models = available.find((p) => p.id === provider)?.models ?? [];
  const model =
    modelChoice && models.includes(modelChoice)
      ? modelChoice
      : (models[0] ?? null);

  useEffect(() => {
    if (!demo || demoIndex >= FAKE_CHAT.messages.length) return;
    const message = FAKE_CHAT.messages[demoIndex];
    function advance(delay: number, nextIndex: number) {
      const timer = window.setTimeout(() => {
        setDemoIndex(nextIndex);
        setDemoChars(0);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (message.role !== "assistant") return advance(700, demoIndex + 1);
    if (demoChars === 0) {
      const timer = window.setTimeout(() => setDemoChars(1), 600);
      return () => window.clearTimeout(timer);
    }
    if (demoChars >= message.content.length) return advance(500, demoIndex + 1);
    const timer = window.setInterval(
      () =>
        setDemoChars((chars) => Math.min(chars + 5, message.content.length)),
      20,
    );
    return () => window.clearInterval(timer);
  }, [demo, demoIndex, demoChars]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    demo,
    demoChars,
    demoIndex,
    thread.data?.messages.length,
    send.isPending,
  ]);

  async function submit() {
    const content = input.trim();
    if (!content || send.isPending || create.isPending) return;
    setInput("");
    setSources(null);
    try {
      let id = sessionId;
      if (!id) {
        const session = await create.mutateAsync({
          note_id: noteId,
          provider,
          model,
        });
        id = session.id;
      }
      if (!id) throw new Error("Could not start a chat session.");
      if (id !== sessionId) setSessionId(id);
      const reply = await send.mutateAsync({
        sessionId: id,
        content,
        provider,
        model,
      });
      setSources(reply.context_notes.length ? reply.context_notes : null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The chat request failed.",
      );
    }
  }

  function pickSession(value: string) {
    setSessionId(value === "new" ? null : value);
    setSources(null);
  }

  const messages = useMemo(() => {
    if (!demo) return thread.data?.messages ?? [];
    return FAKE_CHAT.messages
      .slice(0, Math.min(demoIndex + 1, FAKE_CHAT.messages.length))
      .map((message, index) =>
        index === demoIndex && message.role === "assistant"
          ? { ...message, content: message.content.slice(0, demoChars) }
          : message,
      );
  }, [demo, thread.data, demoIndex, demoChars]);
  const demoThinking =
    demo &&
    FAKE_CHAT.messages[demoIndex]?.role === "assistant" &&
    demoChars <= 1;
  const pending = demoThinking || send.isPending || create.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-linear-to-b from-primary/6 via-transparent to-transparent">
      <SheetHeader className="gap-1 pb-3 pt-4">
        <div className="flex items-center gap-2.5 pr-9">
          <SparklesIcon className="size-4" />

          <div className="min-w-0">
            <SheetTitle className="leading-tight">Ask your library</SheetTitle>
            {/* <SheetDescription className="text-[11px] leading-tight">
              {noteId
                ? "Grounded in this note's markdown and its connections."
                : "Grounded in your notes, embeddings, and graph connections."}
            </SheetDescription> */}
          </div>
          {/* <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            title="New chat"
            onClick={() => pickSession("new")}
          >
            <PlusIcon />
          </Button> */}
        </div>
      </SheetHeader>
      <div className="flex items-center gap-1.5 px-4 pb-3">
        <Select value={sessionId ?? "new"} onValueChange={pickSession}>
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1 rounded-full border-border/60 bg-background/70 shadow-none"
          >
            <SelectValue placeholder="New chat" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="new">New chat</SelectItem>
              {(sessions.data ?? []).map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  className="max-w-full"
                >
                  <span className="truncate">{item.title}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 py-4">
          {messages.length === 0 && !pending && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <SparklesIcon className="size-5" />
              </span>
              <p className="max-w-56 text-sm leading-6 text-muted-foreground">
                Ask anything about your notes. Answers come from your own
                library.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
            />
          ))}
          {pending && (
            <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border bg-background px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm">
              <span className="flex items-center gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:120ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:240ms]" />
              </span>
              Thinking…
            </div>
          )}
          {demo &&
            !pending &&
            sources === null &&
            FAKE_CHAT_SOURCES.length > 0 && (
              <SourceChips titles={FAKE_CHAT_SOURCES} />
            )}
          {sources && !pending && <SourceChips titles={sources} />}
          <div ref={bottom} />
        </div>
      </ScrollArea>
      <div className="bg-background/80 p-3 backdrop-blur-sm">
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-background p-1.5 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask your notes…"
            className="min-h-9 max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            rows={1}
          />
          <div className="flex items-center gap-1">
            <Select
              value={provider}
              onValueChange={(value) => {
                setProviderChoice(value);
                setModelChoice(
                  available.find((p) => p.id === value)?.models[0] ?? null,
                );
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 shrink-0 gap-1 rounded-full border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted focus-visible:ring-1"
              >
                <BotIcon className="size-3.5 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>AI provider</SelectLabel>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {provider === "ollama" && available.find((p) => p.id === "ollama") && (
              <Select value={model ?? ""} onValueChange={setModelChoice}>
                <SelectTrigger
                  size="sm"
                  className="h-7 shrink-0 gap-1 rounded-full border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted focus-visible:ring-1"
                >
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Model</SelectLabel>
                    {models.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex items-center gap-1">
              {sessionId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete this chat"
                  title="Delete this chat"
                  disabled={send.isPending}
                  onClick={() => {
                    remove.mutate(sessionId, {
                      onSuccess: () => {
                        setSessionId(null);
                        setSources(null);
                        toast.success("Chat deleted.");
                      },
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete this chat.",
                        ),
                    });
                  }}
                >
                  <Trash2Icon />
                </Button>
              )}
              <Button
                size="icon-sm"
                aria-label="Send message"
                variant="gradient_primary"
                className="rounded-full"
                disabled={!input.trim() || pending}
                onClick={() => void submit()}
              >
                <ArrowUpIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceChips({ titles }: { titles: string[] }) {
  return (
    <div className="mt-1 self-start">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <BadgePlusIcon className="size-3" /> Pulled from
      </p>
      <div className="flex flex-wrap gap-1.5">
        {titles.map((title) => (
          <Badge
            key={title}
            variant="outline"
            className="max-w-52 truncate rounded-full border-primary/25 bg-primary/5 px-2.5 py-1 text-[11px] font-normal text-primary"
          >
            {title}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  if (role === "user")
    return (
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-linear-to-b from-primary/10 to-primary/20 border border-primary/30 text-primary px-3.5 py-2.5 text-sm leading-6 shadow-sm whitespace-pre-wrap">
        {content}
      </div>
    );
  return (
    <div className="flex max-w-[92%] items-start gap-2 self-start">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-lg text-primary">
        <SparklesIcon className="size-4 text-primary" />
      </span>
      <div className="rounded-2xl rounded-bl-md border bg-background px-3.5 py-2.5 text-sm leading-6 text-foreground shadow-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
