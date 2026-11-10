import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showAlert } from "../../services/feedback";
import {
  deleteDocument,
  DOCUMENT_MIME_TYPES,
  getDocuments,
  uploadDocument,
} from "../../services/api";

// ─── Cores semânticas fixas (não mudam com a paleta) ──────────────────────────
const BLUE = "#2d6cdf";
const RED = "#d95c5c";
const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface DocItem {
  id: string;
  title: string;
  file_type: string;
  file_type_display?: string;
  file_url?: string;
  uploaded_at: string;
  patient?: string | null;
  patient_name?: string | null;
  patient_archived?: boolean;
  is_avulso?: boolean;
}

const UPLOAD_TYPES: { label: string; value: string }[] = [
  { label: "PDF", value: "pdf" },
  { label: "Imagem", value: "image" },
  { label: "Outro", value: "other" },
];

const buildTypeConfig = (
  primary: string,
  primaryTint: string,
): Record<string, { icon: string; color: string; bg: string }> => ({
  pdf: { icon: "document-text-outline", color: "#e05c5c", bg: "#fdeaea" },
  image: { icon: "image-outline", color: BLUE, bg: "#e8f0fc" },
  other: { icon: "folder-outline", color: primary, bg: primaryTint },
});

const typeCfg = (t: string, cfg: Record<string, { icon: string; color: string; bg: string }>) =>
  cfg[t] ?? cfg.other;

const formatDate = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Tela ──────────────────────────────────────────────────────────────────────
// Documentos vinculados a pacientes são clínicos e ficam visíveis apenas ao
// psicólogo responsável (tela (psychologist)/ficha.tsx). O secretário/admin só
// enxerga e cadastra documentos avulsos (administrativos, sem paciente).
export default function AdminDocumentsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeConfig = useMemo(
    () => buildTypeConfig(colors.primary, colors.primaryTint),
    [colors],
  );

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  // scope: "avulsos" — o secretário/admin nunca carrega documentos clínicos
  // vinculados a paciente, que são exclusivos do psicólogo responsável.
  const loadDocs = async () => {
    const result = await getDocuments({ scope: "avulsos" });
    if (result.ok && Array.isArray(result.data)) {
      setDocs(result.data as DocItem[]);
    } else {
      showAlert("Erro", (result as any).error || "Erro ao carregar documentos.");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await loadDocs();
      } catch {
        showAlert("Erro", "Erro inesperado ao carregar documentos.");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  const handleDownload = async (doc: DocItem) => {
    if (doc.file_url) {
      await Linking.openURL(doc.file_url);
      return;
    }
    showAlert("Download", `Não foi possível localizar o arquivo "${doc.title}".`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteDocument(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      showAlert("Erro", (result as any).error || "Não foi possível excluir.");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Documentos</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace("/(admin)")}>
            <Ionicons name="home-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando documentos...</Text>
          </View>
        ) : (
          <Animated.View
            style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Adicionar documento</Text>
            </TouchableOpacity>

            {/* Busca */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.placeholder} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por título..."
                placeholderTextColor={colors.placeholder}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={16} color={colors.placeholder} />
                </TouchableOpacity>
              )}
            </View>

            {/* Lista */}
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={40} color="#b2dfcf" />
                <Text style={styles.emptyTitle}>Nenhum documento encontrado</Text>
              </View>
            ) : (
              <View style={styles.cardsWrap}>
                {filtered.map((doc) => {
                  const cfg = typeCfg(doc.file_type, typeConfig);
                  return (
                    <View
                      key={doc.id}
                      style={[styles.docCard, { flexBasis: isDesktop ? 420 : "100%" }]}
                    >
                      <View style={[styles.fileIconBox, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon as any} size={24} color={cfg.color} />
                      </View>
                      <View style={styles.docInfo}>
                        <Text style={styles.docTitle} numberOfLines={1}>
                          {doc.title}
                        </Text>
                        <View style={styles.docMeta}>
                          <Text style={styles.docDate}>{formatDate(doc.uploaded_at)}</Text>
                        </View>
                        <View style={styles.docActions}>
                          <TouchableOpacity
                            style={styles.downloadBtn}
                            onPress={() => handleDownload(doc)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="download-outline" size={13} color={colors.primary} />
                            <Text style={styles.downloadBtnText}>Baixar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => setDeleteTarget(doc)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color={RED} />
                            <Text style={styles.deleteBtnText}>Excluir</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      <UploadModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onUploaded={() => {
          setModalVisible(false);
          void loadDocs();
        }}
      />

      {/* Confirmação de exclusão */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmIconBox}>
              <Ionicons name="trash-outline" size={26} color={RED} />
            </View>
            <Text style={styles.confirmTitle}>Excluir documento</Text>
            <Text style={styles.confirmMsg}>
              Excluir {"\n"}
              <Text style={{ fontWeight: "700", color: colors.textDark }}>{deleteTarget?.title}</Text>?
              {"\n"}Esta ação não pode ser desfeita.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleting && { opacity: 0.7 }]}
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.85}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Excluir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Modal de upload ────────────────────────────────────────────────────────────
// Sempre avulso: o secretário/admin não vincula documentos a pacientes por
// aqui — documentos clínicos são cadastrados pelo psicólogo em sua própria
// ficha do paciente.
function UploadModal({
  visible,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeConfig = useMemo(
    () => buildTypeConfig(colors.primary, colors.primaryTint),
    [colors],
  );

  const [title, setTitle] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setTitle("");
    setFileType("pdf");
    setFile(null);
  };

  const handlePick = async () => {
    try {
      // Só os formatos que o backend aceita (PDF, PNG, JPG, DOC, DOCX).
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_MIME_TYPES,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const f = result.assets[0];
        setFile({ uri: f.uri, name: f.name || "documento", mimeType: f.mimeType });
      }
    } catch {
      showAlert("Erro", "Não foi possível selecionar o arquivo.");
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      showAlert("Campo obrigatório", "Informe o título do documento.");
      return;
    }
    if (!file) {
      showAlert("Campo obrigatório", "Selecione um arquivo.");
      return;
    }
    setUploading(true);
    const result = await uploadDocument(title.trim(), fileType, {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream",
    });
    setUploading(false);
    if (!result.ok) {
      showAlert("Erro", (result as any).error || "Não foi possível enviar o documento.");
      return;
    }
    reset();
    onUploaded();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => !uploading && onClose()}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Adicionar documento</Text>

            {/* Título */}
            <Text style={styles.modalLabel}>Título</Text>
            <TextInput
              style={styles.modalInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Termo de consentimento"
              placeholderTextColor={colors.placeholder}
            />

            {/* Tipo */}
            <Text style={styles.modalLabel}>Tipo</Text>
            <View style={styles.typeRow}>
              {UPLOAD_TYPES.map((t) => {
                const active = fileType === t.value;
                const cfg = typeCfg(t.value, typeConfig);
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.typeOption,
                      active && { backgroundColor: cfg.bg, borderColor: cfg.color },
                    ]}
                    onPress={() => setFileType(t.value)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={cfg.icon as any}
                      size={16}
                      color={active ? cfg.color : colors.placeholder}
                    />
                    <Text style={[styles.typeOptionText, active && { color: cfg.color }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Arquivo */}
            <TouchableOpacity style={styles.filePicker} onPress={handlePick} activeOpacity={0.8}>
              <Ionicons name="cloud-upload-outline" size={26} color={colors.placeholder} />
              <Text style={styles.filePickerText}>
                {file ? file.name : "Toque para selecionar o arquivo"}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  reset();
                  onClose();
                }}
                disabled={uploading}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, uploading && { opacity: 0.7 }]}
                onPress={handleUpload}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Enviar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pageBg },
  header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
  headerInner: {
    width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  headerTextBox: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44 },
  container: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
  loadingText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  addBtn: {
    height: 50, borderRadius: 14, backgroundColor: colors.primary, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16,
  },
  addBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  searchBox: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 50, marginBottom: 14, gap: 8,
    ...CARD_SHADOW,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.textDark, fontWeight: "500",
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: "none",
  },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textDark },
  cardsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  docCard: {
    flexGrow: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 14, flexDirection: "row", gap: 12, ...CARD_SHADOW,
  },
  fileIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 14, fontWeight: "800", color: colors.textDark, marginBottom: 6 },
  docMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  docDate: { fontSize: 11.5, color: colors.textMuted, fontWeight: "500" },
  docActions: { flexDirection: "row", gap: 8 },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryTint,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  downloadBtnText: { fontSize: 11.5, fontWeight: "700", color: colors.primary },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fdeaea",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  deleteBtnText: { fontSize: 11.5, fontWeight: "700", color: RED },
  // Modal upload
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    padding: 24, paddingBottom: 34, maxHeight: "90%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: "#d4ede3",
    alignSelf: "center", marginBottom: 18,
  },
  modalTitle: { fontSize: 19, fontWeight: "800", color: colors.textDark, marginBottom: 16 },
  modalLabel: {
    fontSize: 12, fontWeight: "700", color: "#5f7d70", marginBottom: 8, marginTop: 6,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  modalInput: {
    minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: "#d7ebe2",
    backgroundColor: "#f6faf8", paddingHorizontal: 14, fontSize: 15, color: colors.textDark,
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: "none",
  },
  typeRow: { flexDirection: "row", gap: 8 },
  typeOption: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: "#d4ede3", backgroundColor: "#fafffe",
  },
  typeOptionText: { fontSize: 13, fontWeight: "700", color: colors.placeholder },
  filePicker: {
    marginTop: 16, borderWidth: 1.5, borderColor: "#d4ede3", borderStyle: "dashed",
    borderRadius: 14, padding: 22, alignItems: "center", gap: 6, backgroundColor: "#fafffe",
  },
  filePickerText: { fontSize: 14, fontWeight: "600", color: "#7aab96", textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 22 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: "#d4ede3",
    alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: "#7aab96" },
  confirmBtn: {
    flex: 2, height: 50, borderRadius: 14, backgroundColor: colors.primary, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: colors.white },
  // Confirmação exclusão
  confirmOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 30,
  },
  confirmSheet: {
    backgroundColor: colors.white, borderRadius: 22, padding: 26, width: "100%", maxWidth: 360, alignItems: "center",
  },
  confirmIconBox: {
    width: 54, height: 54, borderRadius: 17, backgroundColor: "#fdeaea",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: colors.textDark, marginBottom: 8 },
  confirmMsg: { fontSize: 14, color: "#4a7a66", textAlign: "center", lineHeight: 21, marginBottom: 22 },
  confirmButtons: { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancelBtn: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#d4ede3",
    alignItems: "center", justifyContent: "center",
  },
  confirmCancelText: { fontSize: 14, fontWeight: "700", color: "#7aab96" },
  confirmDeleteBtn: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: RED, alignItems: "center", justifyContent: "center",
  },
  confirmDeleteText: { fontSize: 14, fontWeight: "700", color: colors.white },
});
