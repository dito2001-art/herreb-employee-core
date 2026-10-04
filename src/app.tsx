import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { ChatAgent } from "./server";
import { WorkforceShell } from "./workforce-shell";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  PoweredByCloudflare,
  Surface,
  Switch,
  Text
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  BugIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SignInIcon,
  XIcon,
  WrenchIcon,
  PaperclipIcon,
  ImageIcon
} from "@phosphor-icons/react";

interface Attachment {
  id: string;
  file: File;
  preview: string;
  mediaType: string;
}

function createAttachment(file: File): Attachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file),
    mediaType: file.type || "application/octet-stream"
  };
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem("theme", mode);
  }, [dark]);
  return (
    <Button variant="ghost" size="sm" shape="square" aria-label="Toggle theme" icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />} onClick={toggle} />
  );
}

function ToolIO({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return <details className="mt-2"><summary className="text-xs cursor-pointer text-kumo-subtle">{label}</summary><pre className="mt-1 text-[11px] bg-kumo-control rounded-lg p-2 overflow-auto max-h-48">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre></details>;
}

function ToolPartView({ part, addToolApprovalResponse }: { part: any; addToolApprovalResponse: (response: any) => void }) {
  const toolName = getToolName(part);
  if (part.state === "approval-requested") {
    return <div className="flex justify-start"><Surface className="max-w-[85%] px-4 py-3 rounded-xl ring ring-kumo-line"><div className="flex items-center gap-2"><GearIcon size={14} /><Text size="sm" bold>{toolName} needs approval</Text></div><ToolIO label="Input" value={part.input} /><div className="flex gap-2 mt-3"><Button size="sm" variant="primary" icon={<CheckCircleIcon size={14} />} onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}>Approve</Button><Button size="sm" variant="secondary" icon={<XCircleIcon size={14} />} onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}>Deny</Button></div></Surface></div>;
  }
  if (part.state === "output-available") return <div className="flex justify-start"><Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line"><Text size="xs" variant="secondary">{toolName} completed</Text><ToolIO label="Output" value={part.output} /></Surface></div>;
  if (part.state === "output-error") return <div className="flex justify-start"><Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line"><Text size="xs" variant="secondary">{part.errorText || "Tool call failed"}</Text></Surface></div>;
  if (part.state === "input-available" || part.state === "input-streaming") return <div className="flex justify-start"><Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line"><div className="flex items-center gap-2"><GearIcon size={14} className="animate-spin" /><Text size="xs" variant="secondary">Running {toolName}...</Text></div><ToolIO label="Input" value={part.input} /></Surface></div>;
  return null;
}

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();
  const [mcpState, setMcpState] = useState<MCPServersState>({ prompts: [], resources: [], servers: {}, tools: [] });
  const [showMcpPanel, setShowMcpPanel] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [isAddingServer, setIsAddingServer] = useState(false);
  const mcpPanelRef = useRef<HTMLDivElement>(null);
  const agent = useAgent<ChatAgent>({ agent: "ChatAgent", onOpen: useCallback(() => setConnected(true), []), onClose: useCallback(() => setConnected(false), []), onError: useCallback((error: Event) => console.error("WebSocket error:", error), []), onMcpUpdate: useCallback((state: MCPServersState) => setMcpState(state), []), onMessage: useCallback((message: MessageEvent) => { try { const data = JSON.parse(String(message.data)); if (data.type === "scheduled-task") toasts.add({ title: "Scheduled task completed", description: data.description, timeout: 0 }); } catch {} }, [toasts]) });
  useEffect(() => { if (!showMcpPanel) return; const handle = (e: MouseEvent) => { if (mcpPanelRef.current && !mcpPanelRef.current.contains(e.target as Node)) setShowMcpPanel(false); }; document.addEventListener("mousedown", handle); return () => document.removeEventListener("mousedown", handle); }, [showMcpPanel]);
  const handleAddServer = async () => { if (!mcpName.trim() || !mcpUrl.trim()) return; setIsAddingServer(true); try { await agent.stub.addServer(mcpName.trim(), mcpUrl.trim()); setMcpName(""); setMcpUrl(""); } finally { setIsAddingServer(false); } };
  const handleRemoveServer = async (serverId: string) => { await agent.stub.removeServer(serverId); };
  const serverEntries = Object.entries(mcpState.servers);
  const mcpToolCount = mcpState.tools.length;
  const { messages, sendMessage, clearHistory, addToolApprovalResponse, stop, status } = useAgentChat({ agent, experimental_throttle: 100, onToolCall: async ({ toolCall, addToolOutput }) => { if (toolCall.toolName === "getUserTimezone") addToolOutput({ toolCallId: toolCall.toolCallId, output: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, localTime: new Date().toLocaleTimeString() } }); } });
  const isStreaming = status === "streaming" || status === "submitted";
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (!isStreaming && textareaRef.current) textareaRef.current.focus(); }, [isStreaming]);
  const addFiles = useCallback((files: FileList | File[]) => { const images = Array.from(files).filter((f) => f.type.startsWith("image/")); if (images.length) setAttachments((prev) => [...prev, ...images.map(createAttachment)]); }, []);
  const removeAttachment = useCallback((id: string) => setAttachments((prev) => { const att = prev.find((a) => a.id === id); if (att) URL.revokeObjectURL(att.preview); return prev.filter((a) => a.id !== id); }), []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes("Files")) setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }, [addFiles]);
  const handlePaste = useCallback((e: React.ClipboardEvent) => { const files: File[] = []; for (const item of Array.from(e.clipboardData?.items ?? [])) if (item.kind === "file") { const file = item.getAsFile(); if (file) files.push(file); } if (files.length) { e.preventDefault(); addFiles(files); } }, [addFiles]);
  const send = useCallback(async () => { const text = input.trim(); if ((!text && attachments.length === 0) || isStreaming) return; setInput(""); const parts: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; url: string }> = []; if (text) parts.push({ type: "text", text }); for (const att of attachments) parts.push({ type: "file", mediaType: att.mediaType, url: await fileToDataUri(att.file) }); for (const att of attachments) URL.revokeObjectURL(att.preview); setAttachments([]); sendMessage({ role: "user", parts }); if (textareaRef.current) textareaRef.current.style.height = "auto"; }, [input, attachments, isStreaming, sendMessage]);

  return <div className="flex flex-col h-full bg-kumo-elevated relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
    {isDragging && <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none"><div className="flex flex-col items-center gap-2 text-kumo-brand"><ImageIcon size={40} /><Text variant="heading3" as="span">Drop images here</Text></div></div>}
    <header className="px-5 py-3 bg-kumo-base border-b border-kumo-line"><div className="max-w-3xl mx-auto flex items-center justify-between"><div className="flex items-center gap-3"><Badge variant="secondary"><ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />Client 0 · AI Assistant</Badge></div><div className="flex items-center gap-3"><div className="flex items-center gap-1.5"><CircleIcon size={8} weight="fill" className={connected ? "text-kumo-success" : "text-kumo-danger"} /><Text size="xs" variant="secondary">{connected ? "Connected" : "Disconnected"}</Text></div><div className="flex items-center gap-1.5"><BugIcon size={14} /><Switch checked={showDebug} onCheckedChange={setShowDebug} size="sm" aria-label="Toggle debug mode" /></div><ThemeToggle /><div className="relative" ref={mcpPanelRef}><Button variant="secondary" icon={<PlugsConnectedIcon size={16} />} onClick={() => setShowMcpPanel(!showMcpPanel)}>MCP{mcpToolCount > 0 && <Badge variant="primary" className="ml-1.5"><WrenchIcon size={10} className="mr-0.5" />{mcpToolCount}</Badge>}</Button>{showMcpPanel && <div className="absolute right-0 top-full mt-2 w-96 z-50"><Surface className="rounded-xl ring ring-kumo-line shadow-lg p-4 space-y-4"><div className="flex items-center justify-between"><Text size="sm" bold>MCP Servers</Text><Button variant="ghost" size="sm" shape="square" icon={<XIcon size={14} />} onClick={() => setShowMcpPanel(false)} /></div><form onSubmit={(e) => { e.preventDefault(); handleAddServer(); }} className="space-y-2"><input value={mcpName} onChange={(e) => setMcpName(e.target.value)} placeholder="Server name" className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base" /><div className="flex gap-2"><input value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} placeholder="https://mcp.example.com" className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base" /><Button type="submit" size="sm" icon={<PlusIcon size={14} />} disabled={isAddingServer || !mcpName.trim() || !mcpUrl.trim()}>{isAddingServer ? "..." : "Add"}</Button></div></form>{serverEntries.map(([id, server]) => <div key={id} className="flex justify-between p-2 rounded-lg border border-kumo-line"><div><span className="text-sm">{server.name}</span><div className="text-xs font-mono">{server.server_url}</div></div><div className="flex gap-1">{server.state === "authenticating" && server.auth_url && <Button size="sm" icon={<SignInIcon size={12} />} onClick={() => window.open(server.auth_url as string, "oauth", "width=600,height=800")}>Auth</Button>}<Button variant="ghost" size="sm" shape="square" icon={<TrashIcon size={12} />} onClick={() => handleRemoveServer(id)} /></div></div>)}</Surface></div>}</div><Button variant="secondary" icon={<TrashIcon size={16} />} onClick={clearHistory}>Clear</Button></div></div></header>
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="max-w-3xl mx-auto px-5 py-6 space-y-5">{messages.length === 0 && <Empty icon={<ChatCircleDotsIcon size={32} />} title="Probá a EMP-002 con un caso real" contents={<div className="flex flex-wrap justify-center gap-2">{["¿Qué tengo para hoy?", "Revisá mis pendientes y decime qué debería priorizar.", "Buscá un espacio mañana después de las 15.", "Avisame si se libera un turno esta semana."].map((prompt) => <Button key={prompt} variant="outline" size="sm" disabled={isStreaming} onClick={() => sendMessage({ role: "user", parts: [{ type: "text", text: prompt }] })}>{prompt}</Button>)}</div>} />}{messages.map((message: UIMessage, index: number) => { const isUser = message.role === "user"; const isLastAssistant = message.role === "assistant" && index === messages.length - 1; return <div key={message.id} className="space-y-2">{showDebug && <pre className="text-[11px] bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">{JSON.stringify(message, null, 2)}</pre>}{message.parts.map((part, i) => { const key = `${message.id}-${i}`; if (isToolUIPart(part)) return <ToolPartView key={key} part={part} addToolApprovalResponse={addToolApprovalResponse} />; if (part.type === "reasoning") return part.text.trim() ? <details key={key} className="max-w-[85%]" open={part.state !== "done" && isStreaming}><summary className="cursor-pointer"><BrainIcon size={14} className="inline mr-2" />Reasoning <CaretDownIcon size={14} className="inline" /></summary><pre className="mt-2 p-2 bg-kumo-control rounded-lg text-xs whitespace-pre-wrap">{part.text}</pre></details> : null; if (part.type === "file" && part.mediaType.startsWith("image/")) return <div key={key} className={`flex ${isUser ? "justify-end" : "justify-start"}`}><img src={part.url} alt="Attachment" className="max-h-64 rounded-xl border border-kumo-line" /></div>; if (part.type === "text" && part.text) return isUser ? <div key={key} className="flex justify-end"><div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-kumo-contrast text-kumo-inverse">{part.text}</div></div> : <div key={key} className="flex justify-start"><div className="max-w-[85%] rounded-2xl bg-kumo-base"><Streamdown className="sd-theme rounded-2xl p-3" plugins={{ code }} controls={false} isAnimating={isLastAssistant && isStreaming}>{part.text}</Streamdown></div></div>; return null; })}</div>; })}<div ref={messagesEndRef} /></div></div>
    <div className="border-t border-kumo-line bg-kumo-base"><form onSubmit={(e) => { e.preventDefault(); send(); }} className="max-w-3xl mx-auto px-5 py-4"><input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />{attachments.length > 0 && <div className="flex gap-2 mb-2 flex-wrap">{attachments.map((att) => <div key={att.id} className="relative"><img src={att.preview} alt={att.file.name} className="h-16 w-16 object-cover rounded-lg" /><button type="button" onClick={() => removeAttachment(att.id)} className="absolute top-0 right-0" aria-label={`Remove ${att.file.name}`}><XIcon size={12} /></button></div>)}</div>}<div className="flex items-end gap-3 rounded-xl border border-kumo-line p-3"><Button type="button" variant="ghost" shape="square" icon={<PaperclipIcon size={18} />} onClick={() => fileInputRef.current?.click()} disabled={!connected || isStreaming} /><InputArea ref={textareaRef} value={input} onValueChange={setInput} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} onPaste={handlePaste} placeholder="Dale una tarea real a EMP-002..." disabled={!connected || isStreaming} rows={1} className="flex-1" />{isStreaming ? <Button type="button" variant="secondary" shape="square" icon={<StopIcon size={18} />} onClick={stop} /> : <Button type="submit" variant="primary" shape="square" disabled={(!input.trim() && attachments.length === 0) || !connected} icon={<PaperPlaneRightIcon size={18} />} />}</div></form><div className="flex justify-center pb-3"><PoweredByCloudflare href="https://developers.cloudflare.com/agents/" /></div></div>
  </div>;
}

export default function App() {
  return <Toasty><Suspense fallback={<div className="flex items-center justify-center h-screen text-kumo-inactive">Loading...</div>}><WorkforceShell assistant={<Chat />} /></Suspense></Toasty>;
}
