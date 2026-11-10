import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../services/feedback';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getMe, getProfessionalsByClinic } from '../../services/api';
import type { ProfessionalApiItem } from '../../services/api';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';

// ─── Cores semânticas fixas (não mudam com a paleta da clínica) ──────────────
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

const getStatusMeta = (isActive: boolean, colors: ThemeColors) =>
  isActive
    ? { label: 'Ativo', color: colors.primary, bg: colors.primaryTint, icon: 'checkmark-circle-outline' }
    : { label: 'Inativo', color: RED, bg: RED_LIGHT, icon: 'pause-circle-outline' };

export default function AdminPsicologosScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [professionals, setProfessionals] = useState<ProfessionalApiItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const meResult = await getMe();
        if (!meResult.ok || !meResult.data) {
          showAlert('Erro', meResult.error ?? 'Não foi possível carregar o perfil.');
          return;
        }
        const cId = meResult.data.clinic;
        if (!cId) { showAlert('Erro', 'Nenhuma clínica associada.'); return; }

        const result = await getProfessionalsByClinic(cId);
        if (!result.ok) { showAlert('Erro', result.error ?? 'Erro ao carregar psicólogos.'); return; }
        setProfessionals(result.data || []);
      } catch (err: any) {
        showAlert('Erro', err?.message ?? 'Erro inesperado.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return professionals.filter((p) => {
      const status = p.user.is_active ? 'ativo' : 'inativo';
      const matchFilter = activeFilter === 'todos' || status === activeFilter;
      const matchQuery =
        !q ||
        p.user.full_name.toLowerCase().includes(q) ||
        (p.crp && p.crp.toLowerCase().includes(q)) ||
        (p.specialty && p.specialty.toLowerCase().includes(q));
      return matchFilter && matchQuery;
    });
  }, [professionals, query, activeFilter]);

  const summary = useMemo(() => ({
    total: professionals.length,
    active: professionals.filter((p) => p.user.is_active).length,
  }), [professionals]);

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Psicólogos</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(admin)')}>
          <Ionicons name="home-outline" size={20} color="#fff" />
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
          <Text style={styles.loadingText}>Carregando psicólogos...</Text>
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
              <Text style={styles.summaryValue}>{summary.total}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.active}</Text>
              <Text style={styles.summaryLabel}>Ativos</Text>
            </View>
          </View>

          {/* ── Nova ação ── */}
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push('/(admin)/cadastrar-psicologo')}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={20} color="#fff" />
            <Text style={styles.newButtonText}>Cadastrar novo psicólogo</Text>
          </TouchableOpacity>

          {/* ── Busca e filtros ── */}
          <View style={styles.searchCard}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nome, CRP ou especialidade"
                placeholderTextColor="#8ba99d"
              />
            </View>
            <View style={styles.filterRow}>
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'ativo', label: 'Ativos' },
                { key: 'inativo', label: 'Inativos' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
                  onPress={() => setActiveFilter(f.key as any)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Lista ── */}
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Lista de psicólogos</Text>
            <View style={styles.countBadge}>
              <Text style={styles.resultCount}>{filtered.length}</Text>
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="medkit-outline" size={44} color="#a7c2b6" />
              <Text style={styles.emptyStateText}>Nenhum psicólogo encontrado</Text>
            </View>
          ) : (
            <View style={styles.cardsWrap}>
              {filtered.map((p) => {
                const status = getStatusMeta(p.user.is_active ?? true, colors);
                const initials = p.user.full_name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
                return (
                  <View key={p.id} style={[styles.userCard, { flexBasis: isDesktop ? 420 : '100%' }]}>
                    <View style={styles.userTopRow}>
                      <View style={styles.userMainInfo}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{initials}</Text>
                        </View>
                        <View style={styles.nameBox}>
                          <Text style={styles.userName} numberOfLines={1}>{p.user.full_name}</Text>
                          <Text style={styles.userMeta} numberOfLines={1}>
                            {p.crp || '—'} • {p.specialty || 'Sem especialidade'}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <Ionicons name={status.icon as any} size={14} color={status.color} />
                        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>

                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>E-mail</Text>
                        <Text style={styles.infoValue}>{p.user.email}</Text>
                      </View>
                      {p.user.phone ? (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Telefone</Text>
                          <Text style={styles.infoValue}>{p.user.phone}</Text>
                        </View>
                      ) : null}
                      {p.session_duration_minutes ? (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Duração da sessão</Text>
                          <Text style={styles.infoValue}>{p.session_duration_minutes} minutos</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        activeOpacity={0.85}
                        onPress={() => router.push({ pathname: '/(admin)/profissional/[id]', params: { id: p.id } })}
                      >
                        <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                        <Text style={styles.secondaryButtonText}>Ver perfil</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.primaryButton}
                        activeOpacity={0.85}
                        onPress={() => router.push({ pathname: '/(admin)/agendar', params: { professionalId: p.id } })}
                      >
                        <Ionicons name="calendar-outline" size={16} color="#fff" />
                        <Text style={styles.primaryButtonText}>Agenda</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  summaryLabel: { marginTop: 4, fontSize: 12.5, fontWeight: '700', color: colors.textMuted },

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
  avatar: {
    width: 48, height: 48, borderRadius: 15, backgroundColor: ORANGE_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: ORANGE },
  nameBox: { flex: 1 },
  userName: { fontSize: 15.5, fontWeight: '800', color: colors.textDark },
  userMeta: { marginTop: 3, fontSize: 13, color: colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 },
  statusText: { fontSize: 12.5, fontWeight: '700' },
  infoGrid: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#edf4f0', gap: 10 },
  infoItem: { borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border, padding: 12 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: '#789286', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { marginTop: 4, fontSize: 14, color: '#1f4036', fontWeight: '600' },
  actionsRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  secondaryButton: {
    flex: 1, borderRadius: 12, backgroundColor: colors.primaryTint, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  primaryButton: {
    flex: 1, borderRadius: 12, backgroundColor: colors.primary, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.white },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 14 },
  emptyStateText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
