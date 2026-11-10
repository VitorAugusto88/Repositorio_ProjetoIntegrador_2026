import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { showAlert } from '../../services/feedback';
import { confirmAction } from '../../services/confirm';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { deleteAdminUser, getAdminUsers, getMe, toggleUserStatus } from '../../services/api';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';

// ─── Cores semânticas fixas (categorias de perfil/status, não mudam com a paleta) ─
const BLUE = '#2d6cdf';
const BLUE_LIGHT = '#eaf1ff';
const ORANGE = '#c46a1a';
const ORANGE_LIGHT = '#fef3e8';
const RED = '#d95c5c';
const RED_LIGHT = '#fdeeee';

const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: '#1f5442',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'professional' | 'patient';
  is_active: boolean;
}

// GREEN/GREEN_LIGHT (marca da clínica) entram como parâmetros porque mudam
// conforme a paleta escolhida pelo admin — as demais cores são fixas.
const buildRoleMeta = (
  green: string,
  greenLight: string,
): Record<string, { label: string; color: string; bg: string; icon: string }> => ({
  admin: { label: 'Admin', color: ORANGE, bg: ORANGE_LIGHT, icon: 'shield-checkmark-outline' },
  professional: { label: 'Psicólogo', color: BLUE, bg: BLUE_LIGHT, icon: 'medkit-outline' },
  patient: { label: 'Paciente', color: green, bg: greenLight, icon: 'person-outline' },
});

export default function AdminUsuariosScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ROLE_META = useMemo(
    () => buildRoleMeta(colors.primary, colors.primaryTint),
    [colors],
  );

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | 'admin' | 'professional' | 'patient'>('todos');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  // Ações
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [meResult, usersResult] = await Promise.all([getMe(), getAdminUsers()]);
      if (meResult.ok && meResult.data) setMyId(meResult.data.id);

      if (!usersResult.ok) {
        showAlert('Erro', usersResult.error ?? 'Erro ao carregar usuários.');
        return;
      }
      const rows: UserRow[] = (usersResult.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name ?? '',
        email: u.email ?? '',
        phone: u.phone,
        role: u.role,
        is_active: u.is_active ?? true,
      }));
      setUsers(rows);
    } catch (err: any) {
      showAlert('Erro', err?.message ?? 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchRole = roleFilter === 'todos' || u.role === roleFilter;
      const matchQuery =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);
      return matchRole && matchQuery;
    });
  }, [users, query, roleFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    professional: users.filter(u => u.role === 'professional').length,
    patient: users.filter(u => u.role === 'patient').length,
  }), [users]);

  // ── Desativar / Reativar ────────────────────────────────────────────────────
  const handleToggle = (u: UserRow) => {
    const willDeactivate = u.is_active;
    confirmAction(
      willDeactivate ? 'Desativar usuário?' : 'Reativar usuário?',
      willDeactivate
        ? `${u.full_name} perderá o acesso ao sistema, mas os dados cadastrais e clínicos são mantidos.`
        : `${u.full_name} voltará a ter acesso ao sistema.`,
      async () => {
        setActionId(u.id);
        const result = await toggleUserStatus(u.id, !u.is_active);
        setActionId(null);
        if (!result.ok) {
          showAlert('Erro', result.error ?? 'Não foi possível alterar o status.');
          return;
        }
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, is_active: !u.is_active } : x)),
        );
      },
      { confirmText: willDeactivate ? 'Desativar' : 'Reativar' },
    );
  };

  // ── Excluir (com escolha de preservar dados clínicos) ───────────────────────
  const confirmDelete = async (preserveClinicalData: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteAdminUser(deleteTarget.id, preserveClinicalData);
    setDeleting(false);
    if (!result.ok) {
      showAlert('Erro', result.error ?? 'Não foi possível excluir o usuário.');
      return;
    }
    setUsers((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    showAlert(
      'Usuário excluído',
      preserveClinicalData
        ? 'A conta foi removida. Os dados clínicos foram preservados.'
        : 'A conta e todos os dados foram removidos.',
    );
  };

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Usuários</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(admin)')}>
          <Ionicons name="home-outline" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando usuários...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <Header />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* ── Resumo ── */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{counts.total}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{counts.professional}</Text>
              <Text style={styles.summaryLabel}>Psicólogos</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{counts.patient}</Text>
              <Text style={styles.summaryLabel}>Pacientes</Text>
            </View>
          </View>

          {/* ── Nova ação ── */}
          <TouchableOpacity
            style={styles.newButton}
            onPress={() =>
              showAlert('Cadastrar usuário', 'Qual tipo de perfil deseja cadastrar?', [
                { text: 'Paciente', onPress: () => router.push('/(admin)/cadastrar-paciente') },
                { text: 'Psicólogo', onPress: () => router.push('/(admin)/cadastrar-psicologo') },
                { text: 'Cancelar', style: 'cancel' },
              ])
            }
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.white} />
            <Text style={styles.newButtonText}>Cadastrar novo usuário</Text>
          </TouchableOpacity>

          {/* ── Busca e filtros ── */}
          <View style={styles.searchCard}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nome ou e-mail"
                placeholderTextColor="#8ba99d"
              />
            </View>
            <View style={styles.filterRow}>
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'admin', label: 'Admins' },
                { key: 'professional', label: 'Psicólogos' },
                { key: 'patient', label: 'Pacientes' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, roleFilter === f.key && styles.filterChipActive]}
                  onPress={() => setRoleFilter(f.key as any)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, roleFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Lista ── */}
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Lista de usuários</Text>
            <View style={styles.countBadge}>
              <Text style={styles.resultCount}>{filtered.length}</Text>
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={44} color="#a7c2b6" />
              <Text style={styles.emptyStateText}>Nenhum usuário encontrado</Text>
            </View>
          ) : (
            <View style={styles.cardsWrap}>
              {filtered.map((u) => {
                const roleMeta = ROLE_META[u.role] ?? ROLE_META.patient;
                const initials = u.full_name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
                const isSelf = u.id === myId;
                const canManage = u.role !== 'admin' && !isSelf;
                const busy = actionId === u.id;
                return (
                  <View key={u.id} style={[styles.userCard, { flexBasis: isDesktop ? 360 : '100%' }]}>
                    <View style={styles.userTopRow}>
                      <View style={styles.userMainInfo}>
                        <View style={[styles.avatar, { backgroundColor: roleMeta.bg }]}>
                          <Text style={[styles.avatarText, { color: roleMeta.color }]}>{initials}</Text>
                        </View>
                        <View style={styles.nameBox}>
                          <Text style={styles.userName} numberOfLines={1}>{u.full_name}</Text>
                          <Text style={styles.userMeta} numberOfLines={1}>{u.email}</Text>
                        </View>
                      </View>
                      <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg }]}>
                        <Ionicons name={roleMeta.icon as any} size={13} color={roleMeta.color} />
                        <Text style={[styles.roleText, { color: roleMeta.color }]}>{roleMeta.label}</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      {u.phone ? (
                        <View style={styles.infoRow}>
                          <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                          <Text style={styles.infoText}>{u.phone}</Text>
                        </View>
                      ) : <View />}
                      <View style={[styles.statusDot, { backgroundColor: u.is_active ? colors.primaryTint : RED_LIGHT }]}>
                        <View style={[styles.dot, { backgroundColor: u.is_active ? colors.primary : RED }]} />
                        <Text style={[styles.statusText, { color: u.is_active ? colors.primary : RED }]}>
                          {u.is_active ? 'Ativo' : 'Inativo'}
                        </Text>
                      </View>
                    </View>

                    {canManage && (
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.toggleBtn}
                          activeOpacity={0.85}
                          onPress={() => handleToggle(u)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name={u.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                                size={16}
                                color={u.is_active ? ORANGE : colors.primary}
                              />
                              <Text style={[styles.toggleBtnText, { color: u.is_active ? ORANGE : colors.primary }]}>
                                {u.is_active ? 'Desativar' : 'Reativar'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          activeOpacity={0.85}
                          onPress={() => setDeleteTarget(u)}
                        >
                          <Ionicons name="trash-outline" size={16} color={RED} />
                          <Text style={styles.deleteBtnText}>Excluir</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Modal: Excluir usuário ── */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={26} color={RED} />
            </View>
            <Text style={styles.modalTitle}>Excluir usuário</Text>
            <Text style={styles.modalSubtitle}>
              {deleteTarget?.full_name}
            </Text>
            <Text style={styles.modalQuestion}>
              O que fazer com os dados clínicos (documentos e consultas) deste usuário?
            </Text>

            <TouchableOpacity
              style={[styles.modalOption, deleting && styles.modalOptionDisabled]}
              activeOpacity={0.85}
              disabled={deleting}
              onPress={() => void confirmDelete(true)}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="archive-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.modalOptionText}>
                <Text style={styles.modalOptionTitle}>Preservar dados clínicos</Text>
                <Text style={styles.modalOptionDesc}>
                  Remove a conta e o acesso, mas mantém os dados clínicos salvos.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalOption, styles.modalOptionDanger, deleting && styles.modalOptionDisabled]}
              activeOpacity={0.85}
              disabled={deleting}
              onPress={() =>
                confirmAction(
                  'Apagar tudo?',
                  'Esta ação é irreversível: o usuário e todos os seus dados clínicos serão apagados.',
                  () => void confirmDelete(false),
                  { confirmText: 'Apagar tudo' },
                )
              }
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: RED_LIGHT }]}>
                <Ionicons name="trash-outline" size={20} color={RED} />
              </View>
              <View style={styles.modalOptionText}>
                <Text style={[styles.modalOptionTitle, { color: RED }]}>Excluir e apagar dados clínicos</Text>
                <Text style={styles.modalOptionDesc}>
                  Apaga a conta e todos os documentos/consultas. Irreversível.
                </Text>
              </View>
            </TouchableOpacity>

            {deleting ? (
              <View style={styles.modalDeletingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.modalDeletingText}>Excluindo...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.pageBg },
    header: { backgroundColor: colors.primary, paddingTop: 52, paddingBottom: 20 },
    headerInner: {
      width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
    iconBtn: {
      width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center', justifyContent: 'center',
    },
    headerTextBox: { flex: 1 },
    headerTitle: { color: colors.white, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44 },
    container: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    loadingText: { fontSize: 15, color: colors.primary, fontWeight: '600' },

    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    summaryCard: {
      flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', paddingVertical: 16, ...CARD_SHADOW,
    },
    summaryValue: { fontSize: 24, fontWeight: '800', color: colors.textDark, letterSpacing: -0.5 },
    summaryLabel: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },

    newButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, marginBottom: 16,
    },
    newButtonText: { color: colors.white, fontSize: 15, fontWeight: '800' },

    searchCard: {
      backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: 14, marginBottom: 22, ...CARD_SHADOW,
    },
    searchBox: {
      borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center',
    },
    searchInput: {
      flex: 1, marginLeft: 10, fontSize: 14, color: colors.textDark,
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: 'none',
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 10 },
    filterChip: { borderRadius: 999, backgroundColor: '#edf5f1', paddingVertical: 9, paddingHorizontal: 14 },
    filterChipActive: { backgroundColor: colors.primary },
    filterChipText: { fontSize: 13, fontWeight: '700', color: '#5f7e73' },
    filterChipTextActive: { color: colors.white },

    listHeader: { marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textDark, letterSpacing: -0.2 },
    countBadge: {
      minWidth: 30, height: 26, paddingHorizontal: 10, borderRadius: 999,
      backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
    },
    resultCount: { fontSize: 14, fontWeight: '800', color: colors.primary },

    cardsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    userCard: {
      flexGrow: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: 16, ...CARD_SHADOW,
    },
    userTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    userMainInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 16, fontWeight: '800' },
    nameBox: { flex: 1 },
    userName: { fontSize: 15.5, fontWeight: '800', color: colors.textDark },
    userMeta: { marginTop: 3, fontSize: 13, color: colors.textMuted },
    roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 },
    roleText: { fontSize: 12, fontWeight: '700' },
    cardFooter: {
      marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#edf4f0',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText: { fontSize: 13, color: colors.textMuted },
    statusDot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: '700' },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    toggleBtn: {
      flex: 1, borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border,
      paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    toggleBtnText: { fontSize: 13, fontWeight: '800' },
    deleteBtn: {
      flex: 1, borderRadius: 12, backgroundColor: RED_LIGHT, borderWidth: 1, borderColor: '#f5d0d0',
      paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    deleteBtnText: { fontSize: 13, fontWeight: '800', color: RED },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 14 },
    emptyStateText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },

    // Modal
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalBox: { backgroundColor: colors.white, borderRadius: 20, padding: 22, width: '100%', maxWidth: 420 },
    modalIcon: {
      alignSelf: 'center', width: 52, height: 52, borderRadius: 26, backgroundColor: RED_LIGHT,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    modalTitle: { fontSize: 19, fontWeight: '800', color: colors.textDark, textAlign: 'center' },
    modalSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 4, fontWeight: '600' },
    modalQuestion: { fontSize: 13.5, color: '#5d7a6e', textAlign: 'center', marginTop: 12, marginBottom: 16, lineHeight: 20 },
    modalOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, backgroundColor: '#fbfefd', marginBottom: 10,
    },
    modalOptionDanger: { borderColor: '#f5d0d0', backgroundColor: '#fff8f8' },
    modalOptionDisabled: { opacity: 0.6 },
    modalOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalOptionText: { flex: 1 },
    modalOptionTitle: { fontSize: 14.5, fontWeight: '800', color: colors.textDark },
    modalOptionDesc: { marginTop: 3, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    modalCancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
    modalCancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
    modalDeletingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12 },
    modalDeletingText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  });
