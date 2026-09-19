"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BadgePlusIcon,
  Loader2Icon,
  MessageCircleIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { FAKE_CHAT, FAKE_CHAT_SOURCES } from "@/lib/fake-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  const model = modelChoice && models.includes(modelChoice) ? modelChoice : (models[0] ?? null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [demo, thread.data?.messages.length, send.isPending]);

  async function submit() {
    const content = input.trim();
    if (!content || send.isPending || create.isPending) return;
    setInput("");
    setSources(null);
    try {
      let id = sessionId;
      if (!id) {
        const session = await create.mutateAsync({ note_id: noteId, provider, model });
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
      toast.error(error instanceof Error ? error.message : "The chat request failed.");
    }
  }

  function pickSession(value: string) {
    setSessionId(value === "new" ? null : value);
    setSources(null);
  }

  const threadData = demo
    ? { session: FAKE_CHAT.session, messages: FAKE_CHAT.messages }
    : thread.data;
  const messages = threadData?.messages ?? [];
  const pending = send.isPending || create.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-2 pb-2">
        <div className="flex items-center gap-2 pr-8">
          <MessageCircleIcon className="size-4 text-primary" />
          <SheetTitle>AI chat{noteId ? " · this note" : " · graph"}</SheetTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            title="New chat"
            onClick={() => pickSession("new")}
          >
            <PlusIcon />
          </Button>
        </div>
        <SheetDescription className="text-xs">
          {noteId
            ? "Grounded in this note's markdown and its connections."
            : "Grounded in your notes, embeddings, and graph connections."}
        </SheetDescription>
      </SheetHeader>
      <div className="flex items-center gap-2 px-4 pb-2">
        <Select value={sessionId ?? "new"} onValueChange={pickSession}>
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue placeholder="New chat" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="new">New chat</SelectItem>
              {(sessions.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id} className="max-w-full">
                  <span className="truncate">{item.title}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={provider}
          onValueChange={(value) => {
            setProviderChoice(value);
            setModelChoice(available.find((p) => p.id === value)?.models[0] ?? null);
          }}
        >
          <SelectTrigger size="sm" className="shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Providers</SelectLabel>
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
            <SelectTrigger size="sm" className="shrink-0">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {models.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && !pending && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ask anything about your notes. Answers come from your own library.
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} role={message.role} content={message.content} />
          ))}
          {demo && !pending && sources === null && FAKE_CHAT_SOURCES.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <BadgePlusIcon className="size-3 text-muted-foreground" />
              {FAKE_CHAT_SOURCES.map((title) => (
                <Badge key={title} variant="outline" className="max-w-48 truncate text-[10px]">
                  {title}
                </Badge>
              ))}
            </div>
          )}
          {pending && (
            <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2Icon className="inline size-3 animate-spin" /> Thinking…
            </div>
          )}
          {sources && !pending && (
            <div className="flex flex-wrap items-center gap-1">
              <BadgePlusIcon className="size-3 text-muted-foreground" />
              {sources.map((title) => (
                <Badge key={title} variant="outline" className="max-w-48 truncate text-[10px]">
                  {title}
                </Badge>
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex items-end gap-2 p-3">
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
          className="min-h-10 max-h-32 flex-1"
          rows={1}
        />
        <Button
          size="icon"
          aria-label="Send message"
          disabled={!input.trim() || pending}
          onClick={() => void submit()}
        >
          <ArrowUpIcon />
        </Button>
        {sessionId && (
          <Button
            variant="ghost"
            size="icon"
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
                  toast.error(error instanceof Error ? error.message : "Could not delete this chat."),
              });
            }}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap",
        role === "user"
          ? "self-end bg-primary text-primary-foreground"
          : "self-start bg-muted text-foreground",
      )}
    >
      {content}
    </div>
  );
}
