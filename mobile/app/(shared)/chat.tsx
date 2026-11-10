/**
 * app/(shared)/chat.tsx
 *
 * Tela de chat unificada — funciona para paciente, profissional e admin.
 * Cada usuário vê apenas suas próprias conversas (filtrado pelo backend).
 *
 * Conexão: WebSocket (tempo real) com fallback para REST na carga inicial.
 * - ws://localhost:8000/ws/chat/<contact_id>/?token=<access_token>
 * - Eventos suportados: message.new, message.read, typing, presence
 *
 * Roteamento de volta: usa a role do token JWT para voltar ao dashboard correto.
 */

import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import {
    AudioMessage,
    formatClock,
    useChatAudioRecorder,
    type RecordedAudio,
} from "../../services/chatAudio";
import { showAlert, showConfirm } from "../../services/feedback";
import {
    clearChatConversation,
    deleteChatMessage,
    DOCUMENT_MIME_TYPES,
    getAccessToken,
    getChatContacts,
    getContactPresence,
    getConversations,
    getMe,
    getMessagesWithPsychologist,
    markMessagesRead,
    resolveMediaUrl,
    sendChatAttachment,
    sendChatMessage,
} from "../../services/api";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";

// ── Estilo WhatsApp — fixo, não muda com a paleta da clínica ──
const WA_BG = "#ece5dd"; // fundo bege do thread
const WA_OUT = "#d9fdd3"; // bolha enviada (verde claro)
const WA_IN = "#ffffff"; // bolha recebida (branca)
const WA_TEXT = "#111b21"; // texto das bolhas
const WA_META = "#667781"; // horário / checks

const DESKTOP_BREAKPOINT = 900;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatHour = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatDayLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));

const getInitials = (name: string): string => {
  const parts = (name || "").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Role → rota do dashboard
const dashboardForRole = (role: string): string => {
  switch (role?.toLowerCase()) {
    case "admin":
      return "/(admin)";
    case "professional":
    case "psychologist":
      return "/(psychologist)/dashboardP";
    default:
      return "/(patient)/homep";
  }
};

// ─── WS_BASE_URL ──────────────────────────────────────────────────────────────
// Ordem de preferência:
//   1. EXPO_PUBLIC_WS_URL (override explícito).
//   2. Derivar da EXPO_PUBLIC_API_URL (http→ws, https→wss, remove /api, +/ws/chat).
//      Sem isto, no deploy (Vercel) o WS caía em ws://127.0.0.1 e nunca conectava
//      → chat só via REST e presença sempre "Ausente".
//   3. Fallback localhost por plataforma (dev).
const deriveWsBaseUrl = (): string => {
  const explicit = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (explicit) return explicit;

  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (api) {
    return (
      api
        .replace(/^http/i, "ws") // http→ws e https→wss
        .replace(/\/api\/?$/i, "") // remove o sufixo /api
        .replace(/\/$/, "") + "/ws/chat"
    );
  }

  return Platform.select({
    android: "ws://10.0.2.2:8000/ws/chat",
    default: "ws://127.0.0.1:8000/ws/chat",
  }) as string;
};

const WS_BASE_URL = deriveWsBaseUrl();

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Conversation {
  contactUserId: string; // user.id do outro lado — usado no WS e no envio REST
  contactName: string;
  contactRole: string;
  initials: string;
  unread: number;
  lastText: string;
  lastAt: string;
  online: boolean;
}

type MessageType = "text" | "image" | "audio" | "file";

interface Message {
  id: string;
  senderId: string; // user.id de quem enviou
  text: string;
  type: MessageType;
  mediaUrl?: string; // URL absoluta da mídia (imagem/áudio/documento)
  mediaName?: string; // nome original do arquivo (documentos)
  durationMs?: number; // duração real do áudio (persistida no backend)
  createdAt: string;
  read: boolean;
  pending?: boolean; // mensagem otimista ainda não confirmada pelo backend
}

// message_type do backend → tipo interno da mensagem
const mediaTypeOf = (t?: string): MessageType =>
  t === "image"
    ? "image"
    : t === "audio"
      ? "audio"
      : t === "file"
        ? "file"
        : "text";

// ─── Anexos aceitos ───────────────────────────────────────────────────────────
// Mesmos tipos permitidos no módulo de documentos (PDF/DOC/DOCX) + todas as
// imagens que o chat já aceitava (webp/gif inclusive, por isso o "image/*").
// O backend revalida extensão, conteúdo e tamanho.
const ATTACHMENT_MIME_TYPES = ["image/*", ...DOCUMENT_MIME_TYPES];

const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

const extensionOf = (name?: string): string =>
  (name || "").split(".").pop()?.toLowerCase() || "";

// Ícone do card de documento conforme a extensão.
const documentIconFor = (name?: string): keyof typeof Ionicons.glyphMap => {
  const ext = extensionOf(name);
  if (ext === "pdf") return "document-text-outline";
  if (ext === "doc" || ext === "docx") return "document-outline";
  return "document-attach-outline";
};

// Normaliza uma mensagem vinda do REST (sent_at/sender_id) ou do WS (sent_at/sender).
const mapApiMessage = (msg: any): Message => ({
  id: msg.id,
  senderId: msg.sender_id || msg.sender || "",
  text: msg.content_encrypted || msg.text || "",
  type: mediaTypeOf(msg.message_type),
  mediaUrl: resolveMediaUrl(msg.media_url),
  mediaName: msg.media_name || undefined,
  durationMs:
    msg.media_duration_ms != null ? Number(msg.media_duration_ms) : undefined,
  createdAt: msg.created_at || msg.sent_at || "",
  read: msg.read ?? true,
});

// Texto curto para o snippet da lista de conversas.
const snippetFor = (m: Message): string =>
  m.type === "image"
    ? "📷 Imagem"
    : m.type === "audio"
      ? "🎤 Áudio"
      : m.type === "file"
        ? `📎 ${m.mediaName || "Documento"}`
        : m.text;

// Prévia da última mensagem vinda de /chat/conversations/ (objeto cru da API).
const summarySnippet = (lastMsg: any, fallbackText?: string): string => {
  const type = mediaTypeOf(lastMsg?.message_type);
  if (type === "text") return fallbackText || lastMsg?.content_encrypted || "";
  return snippetFor({
    id: "",
    senderId: "",
    text: "",
    type,
    mediaName: lastMsg?.media_name || undefined,
    createdAt: "",
    read: true,
  });
};

// Abre a mídia fora da bolha (nova aba na web, navegador no nativo).
const openMedia = (uri?: string) => {
  if (!uri) return;
  if (Platform.OS === "web") {
    window.open(uri, "_blank");
  } else {
    void WebBrowser.openBrowserAsync(uri);
  }
};

interface Contact {
  id: string;
  full_name: string;
  role: string;
  initials: string;
}

// ─── Componente de fundo decorativo ──────────────────────────────────────────
// Componente-irmão no escopo do módulo: monta seu próprio tema/estilos
// memoizados (mesmo padrão de app/(auth)/login.tsx).
const DecorativeBackground = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
    </>
  );
};

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Auth
  const [myUserId, setMyUserId] = useState<string>("");
  const [myRole, setMyRole] = useState<string>("");

  // Dados
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeContactId, setActiveContactId] = useState<string>("");

  // UI
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false); // o outro lado está digitando
  const [contactOnline, setContactOnline] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);

  // Áudio (gravação estilo WhatsApp) — implementação por plataforma
  const recorder = useChatAudioRecorder();

  // Modal novo contato
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const wsContactRef = useRef<string>(""); // contactId da conexão WS ativa
  // Ref para sempre chamar a versão atual de handleWsFrame sem stale closure
  const handleWsFrameRef = useRef<(frame: any, contactId: string) => void>(() => {});

  // Animação de entrada
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const scrollRef = useRef<ScrollView>(null);

  // ─── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      try {
        // Identificar quem está logado
        const meResult = await getMe();
        if (!meResult.ok || !meResult.data) {
          showAlert("Erro", "Sessão expirada. Faça login novamente.");
          router.replace("/login");
          return;
        }
        const me = meResult.data;
        setMyUserId(me.id);
        setMyRole(me.role || "patient");

        // Carregar conversas existentes
        const convResult = await getConversations();
        if (convResult.ok && Array.isArray(convResult.data)) {
          const mapped: Conversation[] = convResult.data.map((item: any) => {
            const contact = item.contact || {};
            // last_message é um objeto { content_encrypted, sent_at, ... }
            const lastMsg =
              typeof item.last_message === "object" &&
              item.last_message !== null
                ? item.last_message
                : {};
            return {
              contactUserId: contact.id || item.user_id || "",
              contactName: contact.full_name || item.user_name || "Contato",
              contactRole: contact.role || "",
              initials:
                contact.initials ||
                getInitials(contact.full_name || item.user_name || ""),
              unread: item.unread_count ?? item.unread ?? 0,
              // Mídia não tem texto: usa o mesmo snippet das bolhas
              // (📷/🎤/📎) para a prévia não ficar vazia na lista.
              lastText: summarySnippet(lastMsg, item.last_message_text),
              lastAt: item.last_message_at
                ? String(item.last_message_at)
                : lastMsg.sent_at
                  ? String(lastMsg.sent_at)
                  : "",
              online: Boolean(contact.online),
            };
          });

          setConversations(mapped);

          // Abre a primeira conversa automaticamente
          if (mapped.length > 0) {
            setActiveContactId(mapped[0].contactUserId);
          }
        }
      } catch {
        showAlert("Erro", "Não foi possível carregar as conversas.");
      } finally {
        setLoading(false);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 450,
            useNativeDriver: true,
          }),
        ]).start();
      }
    };

    void boot();

    return () => {
      disconnectWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Carregar mensagens REST + abrir WS quando activeContactId muda ─────────
  useEffect(() => {
    if (!activeContactId || !myUserId) return;

    const loadAndConnect = async () => {
      // 1. Busca histórico via REST
      try {
        const result = await getMessagesWithPsychologist(activeContactId);
        if (result.ok && Array.isArray(result.data)) {
          setMessages(result.data.map(mapApiMessage));
          scrollToBottom(false);
        }
      } catch {
        // silencioso — WS vai cobrir
      }

      // 2. Marca como lidas
      await markMessagesRead(activeContactId).catch(() => null);
      setConversations((prev) =>
        prev.map((c) =>
          c.contactUserId === activeContactId ? { ...c, unread: 0 } : c,
        ),
      );

      // 2.5. Presença confiável via REST (não depende do handshake WS de presença,
      // que pode não rotear no cloud). O outro lado marca-se online no banco ao
      // conectar o WS, então esta leitura reflete o estado real.
      const presence = await getContactPresence(activeContactId).catch(() => null);
      if (presence?.ok && presence.data) {
        const isOnline = Boolean(presence.data.online);
        setContactOnline(isOnline);
        setConversations((prev) =>
          prev.map((c) =>
            c.contactUserId === activeContactId ? { ...c, online: isOnline } : c,
          ),
        );
      }

      // 3. Conecta WebSocket
      connectWs(activeContactId);
    };

    void loadAndConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContactId, myUserId]);

  // ─── WebSocket ──────────────────────────────────────────────────────────────
  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    wsContactRef.current = "";
    setIsTyping(false);
    setContactOnline(false);
  }, []);

  const connectWs = useCallback(
    async (contactId: string) => {
      // Fecha conexão anterior se for para outro contato
      if (wsRef.current && wsContactRef.current !== contactId) {
        disconnectWs();
      }

      // Já conectado para este contato
      if (wsRef.current && wsContactRef.current === contactId) return;

      const token = await getAccessToken();
      if (!token) return;

      const url = `${WS_BASE_URL}/${contactId}/?token=${token}`;
      wsContactRef.current = contactId;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        // Conexão estabelecida
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string);
          handleWsFrameRef.current(frame, contactId);
        } catch {
          // ignora frames inválidos
        }
      };

      ws.onerror = () => {
        // Silencioso — o app ainda funciona via REST
      };

      ws.onclose = (e) => {
        if (e.code === 4401) {
          showAlert("Sessão expirada", "Faça login novamente.");
          router.replace("/login");
          return;
        }
        // Reconecta após 3s se o contato ativo não mudou
        setTimeout(() => {
          if (wsContactRef.current === contactId && wsRef.current === ws) {
            wsRef.current = null;
            connectWs(contactId);
          }
        }, 3000);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disconnectWs],
  );

  const handleWsFrame = useCallback(
    (frame: any, contactId: string) => {
      const { type, payload } = frame;

      if (type === "message.new") {
        const incoming = mapApiMessage(payload);

        setMessages((prev) => {
          // Se já existe (ex.: eco do próprio envio já reconciliado), ignora.
          if (prev.some((m) => m.id === incoming.id)) return prev;
          // Substitui bolha otimista de TEXTO com o mesmo conteúdo enviado agora.
          // Mídia é sempre deduplicada por id (o REST já reconcilia o envio).
          let replacedPending = false;
          const replaced = prev.map((m) => {
            if (
              !replacedPending &&
              m.pending &&
              incoming.type === "text" &&
              m.type === "text" &&
              m.text === incoming.text &&
              m.senderId === incoming.senderId
            ) {
              replacedPending = true;
              return { ...incoming };
            }
            return m;
          });
          return replacedPending ? replaced : [...replaced, incoming];
        });

        // Atualiza snippet da conversa
        setConversations((prev) =>
          prev.map((c) =>
            c.contactUserId === contactId
              ? {
                  ...c,
                  lastText: snippetFor(incoming),
                  lastAt: incoming.createdAt,
                  // Se é mensagem do outro lado, incrementa unread (a menos que esteja ativo)
                  unread:
                    incoming.senderId !== myUserId ? c.unread + 1 : c.unread,
                }
              : c,
          ),
        );

        // Marca como lida se a conversa está ativa
        if (incoming.senderId !== myUserId) {
          wsRef.current?.send(
            JSON.stringify({
              type: "message.read",
              payload: { message_id: incoming.id },
            }),
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.contactUserId === contactId ? { ...c, unread: 0 } : c,
            ),
          );
        }

        scrollToBottom(true);
        return;
      }

      if (type === "message.read") {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.id ? { ...m, read: true } : m)),
        );
        return;
      }

      if (type === "message.deleted") {
        // O remetente apagou "para todos": remove a bolha em tempo real.
        setMessages((prev) => prev.filter((m) => m.id !== payload.id));
        return;
      }

      if (type === "typing") {
        if (payload.user !== myUserId) {
          setIsTyping(payload.is_typing ?? true);
          // Limpa o indicador de typing após 3s
          setTimeout(() => setIsTyping(false), 3000);
        }
        return;
      }

      if (type === "presence") {
        if (payload.user !== myUserId) {
          setContactOnline(payload.online ?? false);
          setConversations((prev) =>
            prev.map((c) =>
              c.contactUserId === contactId
                ? { ...c, online: payload.online ?? false }
                : c,
            ),
          );
        }
        return;
      }
    },
    [myUserId],
  );

  // Mantém ref sincronizada com a versão atual do handler
  useEffect(() => {
    handleWsFrameRef.current = handleWsFrame;
  }, [handleWsFrame]);

  // Polling de segurança: garante sync mesmo se o WS perder algum frame
  useEffect(() => {
    if (!activeContactId || !myUserId) return;

    const syncMessages = async () => {
      const result = await getMessagesWithPsychologist(activeContactId);
      if (!result.ok || !Array.isArray(result.data)) return;
      setMessages((prev) => {
        const knownIds = new Set(prev.map((m) => m.id));
        const newer = (result.data as any[])
          .filter((msg) => !knownIds.has(msg.id))
          .map(mapApiMessage);
        if (newer.length === 0) return prev;
        return [...prev, ...newer].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    };

    // Mantém o indicador Online/Ausente atualizado via REST (robusto no cloud).
    const syncPresence = async () => {
      const presence = await getContactPresence(activeContactId).catch(() => null);
      if (!presence?.ok || !presence.data) return;
      const isOnline = Boolean(presence.data.online);
      setContactOnline(isOnline);
      setConversations((prev) =>
        prev.map((c) =>
          c.contactUserId === activeContactId ? { ...c, online: isOnline } : c,
        ),
      );
    };

    const id = setInterval(() => {
      void syncMessages();
      void syncPresence();
    }, 5000);
    return () => clearInterval(id);
  }, [activeContactId, myUserId]);

  // ─── Enviar mensagem ────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeContactId) return;

    setDraft("");

    const now = new Date().toISOString();
    const tempId = `pending-${Date.now()}`;

    // Mensagem otimista (ainda NÃO lida — só vira lida quando o outro lado
    // enviar o evento message.read).
    const optimistic: Message = {
      id: tempId,
      senderId: myUserId,
      text,
      type: "text",
      createdAt: now,
      read: false,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setConversations((prev) =>
      prev.map((c) =>
        c.contactUserId === activeContactId
          ? { ...c, lastText: text, lastAt: now }
          : c,
      ),
    );
    scrollToBottom(true);

    // Tenta via WebSocket primeiro (mais rápido)
    const wsSent =
      wsRef.current?.readyState === WebSocket.OPEN &&
      (() => {
        wsRef.current!.send(
          JSON.stringify({
            type: "message.new",
            payload: { content_encrypted: text, message_type: "text" },
          }),
        );
        return true;
      })();

    if (!wsSent) {
      // Fallback REST
      const result = await sendChatMessage(activeContactId, text);
      if (!result.ok) {
        showAlert("Erro", result.error || "Não foi possível enviar.");
        // Remove mensagem otimista em caso de falha
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      if (result.data) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...optimistic, id: result.data?.id || tempId, pending: false }
              : m,
          ),
        );
      }
    }
  }, [draft, activeContactId, myUserId]);

  // ─── Enviar indicador de typing ─────────────────────────────────────────────
  const handleDraftChange = useCallback((text: string) => {
    setDraft(text);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "typing",
          payload: { is_typing: text.length > 0 },
        }),
      );
    }
  }, []);

  // ─── Enviar anexo (imagem, áudio ou documento) ──────────────────────────────
  const sendAttachment = useCallback(
    async (
      file: { uri: string; name: string; type: string },
      msgType: MessageType,
      durationMs?: number, // duração real (áudio) medida na gravação
    ) => {
      if (!activeContactId) return;

      const now = new Date().toISOString();
      const tempId = `pending-${Date.now()}`;

      // Bolha otimista com preview local (URI local do arquivo/gravação).
      // read: false — só vira lida quando o outro lado enviar message.read.
      const optimistic: Message = {
        id: tempId,
        senderId: myUserId,
        text: "",
        type: msgType,
        mediaUrl: file.uri,
        mediaName: file.name,
        durationMs,
        createdAt: now,
        read: false,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      setConversations((prev) =>
        prev.map((c) =>
          c.contactUserId === activeContactId
            ? { ...c, lastText: snippetFor(optimistic), lastAt: now }
            : c,
        ),
      );
      scrollToBottom(true);

      setSendingAttachment(true);
      const result = await sendChatAttachment(
        activeContactId,
        file,
        undefined,
        durationMs,
      );
      setSendingAttachment(false);

      if (!result.ok || !result.data) {
        showAlert("Erro", result.error || "Não foi possível enviar o anexo.");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      // Troca a bolha otimista pelo registro real (id + media_url resolvido).
      // O eco do WS (message.new) chega com o mesmo id e é deduplicado.
      const real = mapApiMessage(result.data);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
    },
    [activeContactId, myUserId],
  );

  // ─── Selecionar anexo (imagem ou documento) ─────────────────────────────────
  const handlePickAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_MIME_TYPES,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const name = asset.name || `anexo-${Date.now()}`;
      const ext = extensionOf(name);

      // Barreira local só para dar feedback imediato — o backend revalida.
      if (![...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS].includes(ext)) {
        showAlert(
          "Anexo",
          "Formato não permitido. Envie imagem, PDF, DOC ou DOCX.",
        );
        return;
      }

      const isDocument = DOCUMENT_EXTENSIONS.includes(ext);
      await sendAttachment(
        {
          uri: asset.uri,
          name,
          type:
            asset.mimeType ||
            (isDocument ? "application/octet-stream" : "image/jpeg"),
        },
        isDocument ? "file" : "image",
      );
    } catch {
      showAlert("Erro", "Não foi possível selecionar o anexo.");
    }
  }, [sendAttachment]);

  // ─── Gravação de áudio (start / enviar / cancelar) ──────────────────────────
  const handleStartRecording = useCallback(async () => {
    try {
      await recorder.start();
    } catch (e: any) {
      showAlert(
        "Microfone",
        e?.message || "Não foi possível acessar o microfone.",
      );
    }
  }, [recorder]);

  const handleSendRecording = useCallback(async () => {
    let recorded: RecordedAudio | null = null;
    try {
      recorded = await recorder.stop();
    } catch {
      recorded = null;
    }
    if (!recorded) {
      showAlert("Áudio", "Gravação muito curta ou indisponível.");
      return;
    }
    await sendAttachment(
      { uri: recorded.uri, name: recorded.name, type: recorded.type },
      "audio",
      recorded.durationMs,
    );
  }, [recorder, sendAttachment]);

  const handleCancelRecording = useCallback(async () => {
    await recorder.cancel();
  }, [recorder]);

  // ─── Abrir modal de novo contato ────────────────────────────────────────────
  const handleOpenNewContact = useCallback(async () => {
    setContactSearch("");
    setContactModalVisible(true);
    setContactsLoading(true);
    try {
      const result = await getChatContacts();
      if (result.ok && Array.isArray(result.data)) {
        setContacts(result.data);
      } else {
        showAlert(
          "Erro",
          result.error || "Não foi possível carregar contatos.",
        );
        setContactModalVisible(false);
      }
    } catch {
      showAlert("Erro", "Não foi possível carregar contatos.");
      setContactModalVisible(false);
    } finally {
      setContactsLoading(false);
    }
  }, []);
  // ─── Selecionar conversa ────────────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    (contactId: string) => {
      if (contactId === activeContactId) return;
      setMessages([]);
      setIsTyping(false);
      // Semeia com o status já conhecido (do REST) para não piscar "Ausente".
      const conv = conversations.find((c) => c.contactUserId === contactId);
      setContactOnline(Boolean(conv?.online));
      setActiveContactId(contactId);
    },
    [activeContactId, conversations],
  );

  // ─── Apagar mensagem / conversa ──────────────────────────────────────────────
  const removeMessageFromState = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const doDeleteMessage = useCallback(
    async (messageId: string, forEveryone: boolean) => {
      const result = await deleteChatMessage(messageId, forEveryone);
      if (!result.ok) {
        showAlert("Erro", result.error || "Não foi possível apagar a mensagem.");
        return;
      }
      removeMessageFromState(messageId);
    },
    [removeMessageFromState],
  );

  // Long-press numa bolha: oferece "para todos" (só se for minha e ainda não
  // lida pelo outro lado) e "para mim".
  const confirmDeleteMessage = useCallback(
    (msg: Message) => {
      if (msg.pending) return; // ainda não confirmada pelo servidor
      const isMine = msg.senderId === myUserId;
      const canDeleteForEveryone = isMine && !msg.read;

      const buttons: {
        text: string;
        style: "default" | "cancel" | "destructive";
        onPress?: () => void;
      }[] = [];

      if (canDeleteForEveryone) {
        buttons.push({
          text: "Apagar para todos",
          style: "destructive",
          onPress: () => void doDeleteMessage(msg.id, true),
        });
      }
      buttons.push({
        text: "Apagar para mim",
        style: "destructive",
        onPress: () => void doDeleteMessage(msg.id, false),
      });
      buttons.push({ text: "Cancelar", style: "cancel" });

      showAlert("Apagar mensagem", undefined, buttons);
    },
    [myUserId, doDeleteMessage],
  );

  const handleDeleteConversation = useCallback(() => {
    if (!activeContactId) return;
    const conv = conversations.find((c) => c.contactUserId === activeContactId);
    const name = conv?.contactName || "esta conversa";
    showConfirm({
      title: "Apagar conversa?",
      message: `As mensagens com ${name} serão apagadas apenas para você. O outro participante continuará vendo a conversa.`,
      confirmText: "Apagar",
      destructive: true,
      onConfirm: async () => {
        const result = await clearChatConversation(activeContactId);
        if (!result.ok) {
          showAlert("Erro", result.error || "Não foi possível apagar a conversa.");
          return;
        }
        setMessages([]);
        setConversations((prev) =>
          prev.filter((c) => c.contactUserId !== activeContactId),
        );
        setActiveContactId("");
        showAlert("Conversa apagada.");
      },
    });
  }, [activeContactId, conversations]);

  // ─── Scroll automático ───────────────────────────────────────────────────────
  const scrollToBottom = (animated: boolean) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 100);
  };
  // ─── Iniciar conversa com contato selecionado ────────────────────────────────
  const handleStartConversation = useCallback(
    (contact: Contact) => {
      setContactModalVisible(false);
      setContactSearch("");

      // Se já existe conversa com esse contato, só seleciona
      const existing = conversations.find(
        (c) => c.contactUserId === contact.id,
      );
      if (existing) {
        handleSelectConversation(contact.id);
        return;
      }

      // Cria entrada local da conversa (sem mensagens ainda)
      const newConv: Conversation = {
        contactUserId: contact.id,
        contactName: contact.full_name,
        contactRole: contact.role,
        initials: contact.initials || getInitials(contact.full_name),
        unread: 0,
        lastText: "",
        lastAt: "",
        online: false,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveContactId(contact.id);
    },
    [conversations, handleSelectConversation],
  );

  // ─── Derived state ───────────────────────────────────────────────────────────
  const activeConversation = useMemo(
    () => conversations.find((c) => c.contactUserId === activeContactId),
    [conversations, activeContactId],
  );

  const activeMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  const groupedMessages = useMemo(() => {
    const groups: { label: string; items: Message[] }[] = [];
    activeMessages.forEach((m) => {
      const label = formatDayLabel(m.createdAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) {
        last.items.push(m);
      } else {
        groups.push({ label, items: [m] });
      }
    });
    return groups;
  }, [activeMessages]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const backRoute = dashboardForRole(myRole);

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  // No mobile: mostra a lista OU o thread (um de cada vez). No desktop: os dois.
  const showInbox = isDesktop || !activeContactId;
  const showThread = isDesktop || !!activeContactId;

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando conversas…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace(backRoute as any)}
        >
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.headerEyebrow}>Mensagens</Text>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>

        <View style={styles.wsIndicator}>
          <View
            style={[
              styles.wsDot,
              wsRef.current?.readyState === WebSocket.OPEN
                ? styles.wsDotConnected
                : styles.wsDotDisconnected,
            ]}
          />
        </View>
      </View>

      <Animated.View
        style={[
          styles.content,
          isDesktop && styles.contentDesktop,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* ── Painel de conversas (lista vertical estilo WhatsApp) ─────────── */}
        {showInbox && (
          <View
            style={[
              styles.inboxCard,
              isDesktop ? styles.inboxCardDesktop : styles.inboxCardMobile,
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Conversas</Text>
              <View style={styles.cardHeaderRight}>
                {totalUnread > 0 && (
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>
                      {totalUnread} não {totalUnread === 1 ? "lida" : "lidas"}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.newChatBtn}
                  onPress={handleOpenNewContact}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {conversations.length === 0 ? (
              <View style={styles.emptyConvWrap}>
                <Ionicons name="chatbubbles-outline" size={36} color="#a8c5bb" />
                <Text style={styles.emptyConvText}>Nenhuma conversa ainda.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.convList}
                contentContainerStyle={styles.convListContent}
                showsVerticalScrollIndicator={false}
              >
                {conversations.map((conv) => {
                  const isActive = conv.contactUserId === activeContactId;
                  return (
                    <TouchableOpacity
                      key={conv.contactUserId}
                      style={[styles.convRow, isActive && styles.convRowActive]}
                      onPress={() => handleSelectConversation(conv.contactUserId)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatarWrap}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{conv.initials}</Text>
                        </View>
                        {conv.online && <View style={styles.onlineDot} />}
                      </View>

                      <View style={styles.convRowMid}>
                        <Text numberOfLines={1} style={styles.convName}>
                          {conv.contactName}
                        </Text>
                        <Text numberOfLines={1} style={styles.convSnippet}>
                          {conv.lastText || "Iniciar conversa"}
                        </Text>
                      </View>

                      <View style={styles.convRowRight}>
                        {!!conv.lastAt && (
                          <Text style={styles.convTime}>
                            {formatHour(conv.lastAt)}
                          </Text>
                        )}
                        {conv.unread > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {conv.unread}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Área de mensagens ────────────────────────────────────────────── */}
        {showThread &&
          (activeConversation ? (
          <View style={styles.chatCard}>
            {/* Chat header */}
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderLeft}>
                {!isDesktop && (
                  <TouchableOpacity
                    style={styles.chatBackBtn}
                    onPress={() => setActiveContactId("")}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={22} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <View style={styles.chatAvatarBox}>
                  <Text style={styles.chatAvatarText}>
                    {activeConversation.initials}
                  </Text>
                </View>
                <View>
                  <Text style={styles.chatName}>
                    {activeConversation.contactName}
                  </Text>
                  <Text style={styles.chatSub}>
                    {isTyping
                      ? "digitando…"
                      : contactOnline
                        ? "Online"
                        : activeConversation.contactRole === "professional"
                          ? "Profissional"
                          : activeConversation.contactRole === "patient"
                            ? "Paciente"
                            : "Admin"}
                  </Text>
                </View>
              </View>

              <View style={styles.chatHeaderRight}>
                <View
                  style={[
                    styles.presencePill,
                    contactOnline
                      ? styles.presencePillOnline
                      : styles.presencePillOffline,
                  ]}
                >
                  <View
                    style={[
                      styles.presenceDot,
                      contactOnline
                        ? styles.presenceDotOnline
                        : styles.presenceDotOffline,
                    ]}
                  />
                  <Text
                    style={[
                      styles.presenceText,
                      contactOnline
                        ? styles.presenceTextOnline
                        : styles.presenceTextOffline,
                    ]}
                  >
                    {contactOnline ? "Online" : "Ausente"}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteConvBtn}
                  onPress={handleDeleteConversation}
                  activeOpacity={0.8}
                  accessibilityLabel="Apagar conversa"
                >
                  <Ionicons name="trash-outline" size={19} color="#c0392b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Mensagens */}
            <ScrollView
              ref={scrollRef}
              style={styles.msgScroll}
              contentContainerStyle={styles.msgContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              onContentSizeChange={() => scrollToBottom(false)}
            >
              {groupedMessages.length === 0 ? (
                <View style={styles.emptyMsgWrap}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={40}
                    color="#bdd9ce"
                  />
                  <Text style={styles.emptyMsgText}>
                    Nenhuma mensagem ainda.{"\n"}Diga olá!
                  </Text>
                </View>
              ) : (
                groupedMessages.map((group) => (
                  <View key={group.label}>
                    <View style={styles.datePill}>
                      <Text style={styles.datePillText}>{group.label}</Text>
                    </View>

                    {group.items.map((msg) => {
                      const isMine = msg.senderId === myUserId;
                      return (
                        <View
                          key={msg.id}
                          style={[
                            styles.msgRow,
                            isMine ? styles.msgRowOut : styles.msgRowIn,
                          ]}
                        >
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onLongPress={() => confirmDeleteMessage(msg)}
                            delayLongPress={350}
                            style={[
                              styles.bubble,
                              isMine ? styles.bubbleOut : styles.bubbleIn,
                              msg.pending && styles.bubblePending,
                              msg.type === "image" && styles.bubbleImage,
                            ]}
                          >
                            {msg.type === "image" ? (
                              <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => openMedia(msg.mediaUrl)}
                                onLongPress={() => confirmDeleteMessage(msg)}
                                delayLongPress={350}
                              >
                                <ExpoImage
                                  source={{ uri: msg.mediaUrl }}
                                  style={styles.imageThumb}
                                  contentFit="cover"
                                  transition={150}
                                />
                              </TouchableOpacity>
                            ) : msg.type === "audio" ? (
                              <AudioMessage
                                uri={msg.mediaUrl || ""}
                                mine={isMine}
                                durationMs={msg.durationMs}
                              />
                            ) : msg.type === "file" ? (
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => openMedia(msg.mediaUrl)}
                                onLongPress={() => confirmDeleteMessage(msg)}
                                delayLongPress={350}
                                style={styles.fileCard}
                              >
                                <View
                                  style={[
                                    styles.fileIconWrap,
                                    isMine
                                      ? styles.fileIconWrapOut
                                      : styles.fileIconWrapIn,
                                  ]}
                                >
                                  <Ionicons
                                    name={documentIconFor(msg.mediaName)}
                                    size={20}
                                    color={isMine ? "#fff" : colors.primary}
                                  />
                                </View>
                                <View style={styles.fileInfo}>
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.fileName,
                                      isMine
                                        ? styles.bubbleTextOut
                                        : styles.bubbleTextIn,
                                    ]}
                                  >
                                    {msg.mediaName || "Documento"}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.fileHint,
                                      isMine
                                        ? styles.fileHintOut
                                        : styles.fileHintIn,
                                    ]}
                                  >
                                    {extensionOf(msg.mediaName).toUpperCase() ||
                                      "ARQUIVO"}{" "}
                                    · toque para abrir
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ) : (
                              <Text
                                style={[
                                  styles.bubbleText,
                                  isMine
                                    ? styles.bubbleTextOut
                                    : styles.bubbleTextIn,
                                ]}
                              >
                                {msg.text}
                              </Text>
                            )}
                            <View style={styles.bubbleMeta}>
                              <Text
                                style={[
                                  styles.msgTime,
                                  isMine ? styles.msgTimeOut : styles.msgTimeIn,
                                ]}
                              >
                                {formatHour(msg.createdAt)}
                              </Text>
                              {isMine && (
                                <Ionicons
                                  name={
                                    msg.pending
                                      ? "time-outline"
                                      : msg.read
                                        ? "checkmark-done"
                                        : "checkmark"
                                  }
                                  size={13}
                                  color={
                                    msg.pending
                                      ? "#8696a0"
                                      : msg.read
                                        ? "#53bdeb"
                                        : "#8696a0"
                                  }
                                  style={{ marginLeft: 4 }}
                                />
                              )}
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}

              {/* Indicador de "digitando" */}
              {isTyping && (
                <View style={styles.msgRowIn}>
                  <View
                    style={[
                      styles.bubble,
                      styles.bubbleIn,
                      styles.typingBubble,
                    ]}
                  >
                    <View style={styles.typingDots}>
                      <View style={[styles.dot, styles.dot1]} />
                      <View style={[styles.dot, styles.dot2]} />
                      <View style={[styles.dot, styles.dot3]} />
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Composer */}
            {recorder.isRecording ? (
              <View style={styles.composer}>
                <TouchableOpacity
                  style={styles.recCancelBtn}
                  onPress={handleCancelRecording}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={20} color="#df5d5d" />
                </TouchableOpacity>
                <View style={styles.recInfo}>
                  <View style={styles.recDot} />
                  <Text style={styles.recTime}>
                    {formatClock(recorder.durationMs)}
                  </Text>
                  <Text style={styles.recHint}>Gravando…</Text>
                </View>
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={handleSendRecording}
                  activeOpacity={0.85}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.composer}>
                <TouchableOpacity
                  style={styles.attachBtn}
                  onPress={handlePickAttachment}
                  disabled={sendingAttachment}
                  activeOpacity={0.85}
                >
                  <Ionicons name="attach-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="Escreva uma mensagem…"
                  placeholderTextColor="#89a89d"
                  value={draft}
                  onChangeText={handleDraftChange}
                  multiline
                  maxLength={2000}
                />
                {draft.trim() ? (
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={handleSend}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={handleStartRecording}
                    disabled={sendingAttachment}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="mic" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          ) : (
            <View style={styles.noChatCard}>
              <Ionicons name="chatbubbles-outline" size={52} color="#b8d9ce" />
              <Text style={styles.noChatText}>
                Selecione uma conversa para começar.
              </Text>
            </View>
          ))}
      </Animated.View>

      {/* ── Modal: Nova Conversa ─────────────────────────────────────────── */}
      <Modal
        visible={contactModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalSheet}
            onPress={() => {}}
          >
            {/* Handle */}
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova conversa</Text>
              <TouchableOpacity
                onPress={() => setContactModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#4a7066" />
              </TouchableOpacity>
            </View>

            {/* Busca */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#7ba897" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome…"
                placeholderTextColor="#9abfb4"
                value={contactSearch}
                onChangeText={setContactSearch}
                autoFocus
              />
              {contactSearch.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearch("")}>
                  <Ionicons name="close-circle" size={16} color="#9abfb4" />
                </TouchableOpacity>
              )}
            </View>

            {/* Lista */}
            {contactsLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.modalLoadingText}>Carregando…</Text>
              </View>
            ) : filteredContacts.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="person-outline" size={36} color="#b8d9ce" />
                <Text style={styles.modalEmptyText}>
                  {contactSearch
                    ? "Nenhum contato encontrado."
                    : "Sem contatos disponíveis."}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalList}
                showsVerticalScrollIndicator={false}
              >
                {filteredContacts.map((contact) => {
                  const roleLabel =
                    contact.role === "professional"
                      ? "Profissional"
                      : contact.role === "patient"
                        ? "Paciente"
                        : contact.role === "admin"
                          ? "Admin"
                          : contact.role;
                  const alreadyHasConv = conversations.some(
                    (c) => c.contactUserId === contact.id,
                  );
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={styles.contactRow}
                      onPress={() => handleStartConversation(contact)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>
                          {contact.initials || getInitials(contact.full_name)}
                        </Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName}>
                          {contact.full_name}
                        </Text>
                        <Text style={styles.contactRole}>{roleLabel}</Text>
                      </View>
                      {alreadyHasConv ? (
                        <View style={styles.contactExistingTag}>
                          <Text style={styles.contactExistingText}>
                            Conversa aberta
                          </Text>
                        </View>
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#a8c5bb"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 15,
    color: colors.primaryStrong,
    fontWeight: "600",
  },

  // Decoração
  circle1: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#27795f",
    top: -110,
    right: -70,
    opacity: 0.45,
  },
  circle2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primaryStrong,
    top: -55,
    left: -70,
    opacity: 0.28,
  },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: 22,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: {
    flex: 1,
    marginHorizontal: 14,
  },
  headerEyebrow: {
    color: "#bce3d5",
    fontSize: 13,
    fontWeight: "600",
  },
  headerTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  wsIndicator: {
    width: 42,
    alignItems: "center",
  },
  wsDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  wsDotConnected: {
    backgroundColor: "#45e68a",
  },
  wsDotDisconnected: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  // Conteúdo animado
  content: {
    flex: 1,
    padding: 16,
    paddingBottom: 20,
    gap: 14,
  },
  contentDesktop: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },

  // Card de conversas (lista vertical)
  inboxCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#1f5442",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  inboxCardMobile: { flex: 1 },
  inboxCardDesktop: { width: 340 },
  convList: { flex: 1 },
  convListContent: { paddingBottom: 8 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#183d32",
  },
  cardBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cardBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  emptyConvWrap: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyConvText: {
    color: "#8aaca3",
    fontSize: 14,
    fontWeight: "600",
  },
  // Cada linha de conversa (estilo WhatsApp)
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  convRowActive: { backgroundColor: "#eef5f1" },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "800", color: colors.primary },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#45c486",
    borderWidth: 2,
    borderColor: colors.white,
  },
  convRowMid: { flex: 1, justifyContent: "center" },
  convName: { fontSize: 15.5, fontWeight: "700", color: "#111b21" },
  convSnippet: { marginTop: 3, fontSize: 13, color: "#667781" },
  convRowRight: { alignItems: "flex-end", gap: 6, minWidth: 44 },
  convTime: { fontSize: 11, fontWeight: "600", color: "#667781" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#25d366",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },

  // Card de chat
  chatCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#1f5442",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  chatHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#edf4f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  chatBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  chatAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  chatAvatarText: { fontSize: 16, fontWeight: "800", color: colors.primary },
  chatName: { fontSize: 16, fontWeight: "800", color: "#183d32" },
  chatSub: { marginTop: 2, fontSize: 13, color: "#6f877d" },
  chatHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteConvBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#fbeae8",
    alignItems: "center",
    justifyContent: "center",
  },

  // Presence pill
  presencePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 6,
  },
  presencePillOnline: { backgroundColor: "#e8f8ef" },
  presencePillOffline: { backgroundColor: "#f3f5f4" },
  presenceDot: { width: 7, height: 7, borderRadius: 4 },
  presenceDotOnline: { backgroundColor: "#2d9c67" },
  presenceDotOffline: { backgroundColor: "#b0bdb8" },
  presenceText: { fontSize: 12, fontWeight: "700" },
  presenceTextOnline: { color: "#2d9c67" },
  presenceTextOffline: { color: "#7b8d85" },

  // Mensagens
  msgScroll: { flex: 1, backgroundColor: WA_BG },
  msgContent: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    paddingBottom: 24,
  },
  emptyMsgWrap: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyMsgText: {
    color: "#8aaca3",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  datePill: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  datePillText: { fontSize: 12, fontWeight: "700", color: "#5d7c71" },
  msgRow: { marginBottom: 10, flexDirection: "row" },
  msgRowIn: { justifyContent: "flex-start" },
  msgRowOut: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleIn: {
    backgroundColor: WA_IN,
    borderTopLeftRadius: 3,
  },
  bubbleOut: {
    backgroundColor: WA_OUT,
    borderTopRightRadius: 3,
  },
  bubblePending: { opacity: 0.65 },
  bubbleText: { fontSize: 14.5, lineHeight: 20 },
  bubbleTextIn: { color: WA_TEXT },
  bubbleTextOut: { color: WA_TEXT },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 6,
  },
  msgTime: { fontSize: 10.5, fontWeight: "600" },
  msgTimeIn: { color: WA_META },
  msgTimeOut: { color: WA_META },

  // Typing indicator
  typingBubble: { paddingVertical: 14, paddingHorizontal: 18 },
  typingDots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#7ba897",
  },
  dot1: {},
  dot2: { marginTop: -4 },
  dot3: {},

  // Composer
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#edf4f0",
    backgroundColor: colors.white,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 130,
    borderRadius: 18,
    backgroundColor: "#f4faf7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1d4136",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#8fbbaa" },

  // Botão de anexo (imagem ou documento)
  attachBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },

  // Barra de gravação de áudio
  recCancelBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#fdeaea",
    alignItems: "center",
    justifyContent: "center",
  },
  recInfo: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: "#f4faf7",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#df5d5d",
  },
  recTime: { fontSize: 15, fontWeight: "800", color: "#1d4136" },
  recHint: { fontSize: 13, color: "#7c958b", fontWeight: "600" },

  // Bolha de imagem (mantém o fundo colorido para o horário/checks ficarem legíveis)
  bubbleImage: {
    padding: 5,
  },
  imageThumb: {
    width: 200,
    height: 200,
    borderRadius: 14,
    backgroundColor: "#e6f0eb",
  },

  // Card de documento (PDF/DOC/DOCX) dentro da bolha
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 240,
  },
  fileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileIconWrapIn: { backgroundColor: colors.primaryTint },
  fileIconWrapOut: { backgroundColor: "rgba(255,255,255,0.22)" },
  fileInfo: { flexShrink: 1 },
  fileName: { fontSize: 14.5, fontWeight: "700" },
  fileHint: { fontSize: 11.5, fontWeight: "600", marginTop: 2 },
  fileHintIn: { color: "#7c958b" },
  fileHintOut: { color: "rgba(255,255,255,0.8)" },

  // Empty state (sem conversa selecionada)
  noChatCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    shadowColor: "#1f5442",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  noChatText: {
    color: "#8aaca3",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  // Card header com botão +
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 35, 28, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d4e9e2",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#edf4f0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#183d32",
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },

  // Busca
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f2f9f5",
    borderRadius: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#daeee5",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1d4136",
    paddingVertical: 0,
  },

  // Lista de contatos
  modalList: {
    paddingHorizontal: 16,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f7f4",
    gap: 14,
  },
  contactAvatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#183d32",
  },
  contactRole: {
    marginTop: 2,
    fontSize: 12,
    color: "#7ba897",
    fontWeight: "600",
  },
  contactExistingTag: {
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  contactExistingText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },

  // Modal loading / empty
  modalLoading: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  modalLoadingText: {
    fontSize: 14,
    color: "#7ba897",
    fontWeight: "600",
  },
  modalEmpty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  modalEmptyText: {
    fontSize: 14,
    color: "#8aaca3",
    fontWeight: "600",
    textAlign: "center",
  },
});
