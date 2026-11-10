import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';
import { showAlert } from '../../services/feedback';
import { DateField } from '../../components/DateTimeField';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getAdminUsers,
  toggleUserStatus,
  changeUserRole,
  updateAdminUser,
  createProfessionalAsAdmin,
  createPatientAsAdmin,
} from '../../services/api';

// Data máxima para nascimento: hoje (formato AAAA-MM-DD).
const TODAY_STR = new Date().toLocaleDateString('en-CA');

// ─── Cores semânticas fixas (categorias/estado, não mudam com a paleta) ─────
const BLUE_LIGHT = '#eaf1ff';
const RED_LIGHT = '#fdeeee';
const ORANGE_LIGHT = '#fef3e8';

type RoleFilter = 'todos' | 'admin' | 'professional' | 'patient';
type StatusFilter = 'todos' | 'ativo' | 'inativo';
type CreateMode = 'patient' | 'professional';

interface UserData {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

const ROLE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  admin: { label: 'Admin', color: '#8a55d9', bg: '#f3ecff', icon: 'shield-checkmark-outline' },
  professional: { label: 'Profissional', color: '#c46a1a', bg: ORANGE_LIGHT, icon: 'medkit-outline' },
  patient: { label: 'Paciente', color: '#2d6cdf', bg: BLUE_LIGHT, icon: 'person-outline' },
};

// GREEN/GREEN_LIGHT (marca da clínica) entram como parâmetro porque mudam
// conforme a paleta escolhida pelo admin — "inativo" é uma cor fixa.
const buildStatusMeta = (colors: ThemeColors) => ({
  ativo: { label: 'Ativo', color: colors.primary, bg: colors.primaryTint, icon: 'checkmark-circle-outline' },
  inativo: { label: 'Inativo', color: '#d95c5c', bg: RED_LIGHT, icon: 'pause-circle-outline' },
});

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

export default function GestaoUsuariosScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const STATUS_META = useMemo(() => buildStatusMeta(colors), [colors]);

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  // Edit modal
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  // Role change modal
  const [roleChangeUser, setRoleChangeUser] = useState<UserData | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [changingRole, setChangingRole] = useState(false);

  // Create modal
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [createForm, setCreateForm] = useState({
    full_name: '', email: '', phone: '', crp: '', specialty: '',
    birth_date: '', cpf: '',
  });
  const [creating, setCreating] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loadUsers = async () => {
    setLoading(true);
    const result = await getAdminUsers();
    if (result.ok && result.data) {
      setUsers(
        result.data.map((u: any) => ({
          id: u.id,
          full_name: u.full_name || '',
          email: u.email || '',
          phone: u.phone || '',
          role: u.role || 'patient',
          is_active: u.is_active ?? true,
          created_at: u.created_at,
        })),
      );
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel carregar os usuarios.');
    }
    setLoading(false);
  };

  useEffect(() => { void loadUsers(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchRole = roleFilter === 'todos' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'ativo' ? u.is_active : !u.is_active);
      const matchQuery =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q));
      return matchRole && matchStatus && matchQuery;
    });
  }, [users, query, roleFilter, statusFilter]);

  const summary = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    professionals: users.filter((u) => u.role === 'professional').length,
    patients: users.filter((u) => u.role === 'patient').length,
    active: users.filter((u) => u.is_active).length,
  }), [users]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleStatus = async (user: UserData) => {
    const newStatus = !user.is_active;
    const label = newStatus ? 'ativar' : 'desativar';
    showAlert(
      `${newStatus ? 'Ativar' : 'Desativar'} usuario`,
      `Deseja ${label} ${user.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            const result = await toggleUserStatus(user.id, newStatus);
            if (result.ok) {
              setUsers((prev) =>
                prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u)),
              );
            } else {
              showAlert('Erro', result.error ?? 'Nao foi possivel alterar o status.');
            }
          },
        },
      ],
    );
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    if (editForm.full_name.trim()) payload.full_name = editForm.full_name.trim();
    if (editForm.phone.trim()) payload.phone = editForm.phone.trim();
    if (editForm.email.trim()) payload.email = editForm.email.trim();

    const result = await updateAdminUser(editUser.id, payload);
    setSaving(false);
    if (result.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...payload } : u)),
      );
      setEditUser(null);
      showAlert('Sucesso', 'Dados atualizados com sucesso.');
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel atualizar.');
    }
  };

  const handleChangeRole = async () => {
    if (!roleChangeUser || !selectedRole) return;
    setChangingRole(true);
    const result = await changeUserRole(roleChangeUser.id, selectedRole);
    setChangingRole(false);
    if (result.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === roleChangeUser.id ? { ...u, role: selectedRole } : u)),
      );
      setRoleChangeUser(null);
      showAlert('Sucesso', 'Papel alterado com sucesso.');
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel alterar o papel.');
    }
  };

  const handleCreate = async () => {
    if (!createMode) return;
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      showAlert('Erro', 'Nome e e-mail sao obrigatorios.');
      return;
    }
    setCreating(true);

    let result;
    if (createMode === 'professional') {
      result = await createProfessionalAsAdmin({
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || undefined,
        crp: createForm.crp.trim() || undefined,
        specialty: createForm.specialty.trim() || undefined,
        send_invite: true,
      });
    } else {
      result = await createPatientAsAdmin({
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || undefined,
        birth_date: createForm.birth_date.trim() || undefined,
        cpf: createForm.cpf.trim() || undefined,
        send_invite: true,
      });
    }

    setCreating(false);
    if (result.ok) {
      setCreateMode(null);
      setCreateForm({ full_name: '', email: '', phone: '', crp: '', specialty: '', birth_date: '', cpf: '' });
      showAlert('Sucesso', `${createMode === 'professional' ? 'Profissional' : 'Paciente'} criado com sucesso. Um convite foi enviado por e-mail.`);
      void loadUsers();
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel criar o usuario.');
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

  const getRoleMeta = (role: string) => ROLE_META[role] ?? ROLE_META.patient;
  const getStatusMeta = (active: boolean) => active ? STATUS_META.ativo : STATUS_META.inativo;

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <DecorativeBackground />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerEyebrow}>Area administrativa</Text>
            <Text style={styles.headerTitle}>Gestao de usuarios</Text>
          </View>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(admin)')}>
            <Ionicons name="grid-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '600' }}>Carregando usuarios...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <DecorativeBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerEyebrow}>Area administrativa</Text>
          <Text style={styles.headerTitle}>Gestao de usuarios</Text>
        </View>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(admin)')}>
          <Ionicons name="grid-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Hero stats */}
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Visao geral</Text>
            <Text style={styles.heroTitle}>Usuarios da clinica</Text>
            <Text style={styles.heroSubtitle}>
              Gerencie todos os usuarios, ative ou desative contas e altere papeis.
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{summary.total}</Text>
                <Text style={styles.heroStatLabel}>Total</Text>
              </View>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{summary.patients}</Text>
                <Text style={styles.heroStatLabel}>Pacientes</Text>
              </View>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{summary.professionals}</Text>
                <Text style={styles.heroStatLabel}>Profissionais</Text>
              </View>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{summary.active}</Text>
                <Text style={styles.heroStatLabel}>Ativos</Text>
              </View>
            </View>
          </View>

          {/* Search + Filters */}
          <View style={styles.filtersCard}>
            <Text style={styles.sectionTitle}>Busca e filtros</Text>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nome, e-mail ou telefone"
                placeholderTextColor="#8ba99d"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#8ba99d" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.filterLabel}>Papel</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                { key: 'todos', label: 'Todos' },
                { key: 'admin', label: 'Admin' },
                { key: 'professional', label: 'Profissional' },
                { key: 'patient', label: 'Paciente' },
              ] as { key: RoleFilter; label: string }[]).map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, roleFilter === f.key && styles.filterChipActive]}
                  onPress={() => setRoleFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, roleFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                { key: 'todos', label: 'Todos' },
                { key: 'ativo', label: 'Ativos' },
                { key: 'inativo', label: 'Inativos' },
              ] as { key: StatusFilter; label: string }[]).map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* List header */}
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Lista de usuarios</Text>
            <Text style={styles.resultCount}>{filtered.length} encontrados</Text>
          </View>

          {/* User cards */}
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>Nenhum usuario encontrado</Text>
            </View>
          ) : (
            filtered.map((user) => {
              const roleMeta = getRoleMeta(user.role);
              const statusMeta = getStatusMeta(user.is_active);
              const initials = getInitials(user.full_name);

              return (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.userTopRow}>
                    <View style={styles.userMainInfo}>
                      <View style={[styles.avatar, { backgroundColor: roleMeta.bg }]}>
                        <Text style={[styles.avatarText, { color: roleMeta.color }]}>{initials}</Text>
                      </View>
                      <View style={styles.nameBox}>
                        <Text style={styles.userName}>{user.full_name}</Text>
                        <Text style={styles.userEmail}>{user.email}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Badges */}
                  <View style={styles.badgesRow}>
                    <View style={[styles.badge, { backgroundColor: roleMeta.bg }]}>
                      <Ionicons name={roleMeta.icon as any} size={13} color={roleMeta.color} />
                      <Text style={[styles.badgeText, { color: roleMeta.color }]}>{roleMeta.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
                      <Ionicons name={statusMeta.icon as any} size={13} color={statusMeta.color} />
                      <Text style={[styles.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                  </View>

                  {/* Info */}
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Telefone</Text>
                      <Text style={styles.infoValue}>{user.phone || '—'}</Text>
                    </View>
                    {user.created_at && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Cadastro</Text>
                        <Text style={styles.infoValue}>
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        setEditUser(user);
                        setEditForm({ full_name: user.full_name, phone: user.phone || '', email: user.email });
                      }}
                    >
                      <Ionicons name="create-outline" size={15} color={colors.primary} />
                      <Text style={styles.actionBtnText}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: user.is_active ? RED_LIGHT : colors.primaryTint }]}
                      onPress={() => handleToggleStatus(user)}
                    >
                      <Ionicons
                        name={user.is_active ? 'pause-circle-outline' : 'checkmark-circle-outline'}
                        size={15}
                        color={user.is_active ? '#d95c5c' : colors.primary}
                      />
                      <Text style={[styles.actionBtnText, { color: user.is_active ? '#d95c5c' : colors.primary }]}>
                        {user.is_active ? 'Desativar' : 'Ativar'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#f3ecff' }]}
                      onPress={() => {
                        setRoleChangeUser(user);
                        setSelectedRole(user.role);
                      }}
                    >
                      <Ionicons name="swap-horizontal-outline" size={15} color="#8a55d9" />
                      <Text style={[styles.actionBtnText, { color: '#8a55d9' }]}>Papel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Animated.View>
      </ScrollView>

      {/* FAB with options */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fabSmall, { backgroundColor: '#2d6cdf' }]}
          onPress={() => setCreateMode('patient')}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add-outline" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabSmall, { backgroundColor: '#c46a1a' }]}
          onPress={() => setCreateMode('professional')}
          activeOpacity={0.85}
        >
          <Ionicons name="medkit-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Edit Modal ── */}
      <Modal visible={!!editUser} transparent animationType="slide" onRequestClose={() => !saving && setEditUser(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar usuario</Text>
              <TouchableOpacity onPress={() => !saving && setEditUser(null)} disabled={saving}>
                <Ionicons name="close-outline" size={24} color={colors.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.modalFieldLabel}>Nome completo</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editForm.full_name}
                  onChangeText={(t) => setEditForm({ ...editForm, full_name: t })}
                  editable={!saving}
                />

                <Text style={styles.modalFieldLabel}>E-mail</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editForm.email}
                  onChangeText={(t) => setEditForm({ ...editForm, email: t })}
                  keyboardType="email-address"
                  editable={!saving}
                />

                <Text style={styles.modalFieldLabel}>Telefone</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editForm.phone}
                  onChangeText={(t) => setEditForm({ ...editForm, phone: t })}
                  keyboardType="phone-pad"
                  editable={!saving}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, saving && styles.buttonDisabled]}
                onPress={() => setEditUser(null)}
                disabled={saving}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonCreate, saving && styles.buttonDisabled]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-outline" size={18} color="#fff" />
                    <Text style={styles.modalButtonCreateText}>Salvar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Role Change Modal ── */}
      <Modal visible={!!roleChangeUser} transparent animationType="slide" onRequestClose={() => !changingRole && setRoleChangeUser(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Alterar papel</Text>
              <TouchableOpacity onPress={() => !changingRole && setRoleChangeUser(null)} disabled={changingRole}>
                <Ionicons name="close-outline" size={24} color={colors.textDark} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 24, gap: 12 }}>
              <Text style={styles.modalFieldLabel}>
                Usuario: {roleChangeUser?.full_name}
              </Text>
              <Text style={[styles.modalFieldLabel, { marginTop: 8 }]}>Selecione o novo papel</Text>

              {['admin', 'professional', 'patient'].map((role) => {
                const meta = ROLE_META[role] ?? ROLE_META.patient;
                const isSelected = selectedRole === role;
                return (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      isSelected && { backgroundColor: meta.bg, borderColor: meta.color },
                    ]}
                    onPress={() => setSelectedRole(role)}
                  >
                    <Ionicons name={meta.icon as any} size={20} color={isSelected ? meta.color : '#8ba99d'} />
                    <Text style={[styles.roleOptionText, isSelected && { color: meta.color }]}>
                      {meta.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={meta.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, changingRole && styles.buttonDisabled]}
                onPress={() => setRoleChangeUser(null)}
                disabled={changingRole}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonCreate, changingRole && styles.buttonDisabled]}
                onPress={handleChangeRole}
                disabled={changingRole}
              >
                {changingRole ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                    <Text style={styles.modalButtonCreateText}>Alterar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Create User Modal ── */}
      <Modal visible={!!createMode} transparent animationType="slide" onRequestClose={() => !creating && setCreateMode(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Novo {createMode === 'professional' ? 'profissional' : 'paciente'}
              </Text>
              <TouchableOpacity onPress={() => !creating && setCreateMode(null)} disabled={creating}>
                <Ionicons name="close-outline" size={24} color={colors.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.modalFieldLabel}>Nome completo *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Digite o nome completo"
                  placeholderTextColor={colors.placeholder}
                  value={createForm.full_name}
                  onChangeText={(t) => setCreateForm({ ...createForm, full_name: t })}
                  editable={!creating}
                />

                <Text style={styles.modalFieldLabel}>E-mail *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Digite o e-mail"
                  placeholderTextColor={colors.placeholder}
                  value={createForm.email}
                  onChangeText={(t) => setCreateForm({ ...createForm, email: t })}
                  keyboardType="email-address"
                  editable={!creating}
                />

                <Text style={styles.modalFieldLabel}>Telefone</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Digite o telefone"
                  placeholderTextColor={colors.placeholder}
                  value={createForm.phone}
                  onChangeText={(t) => setCreateForm({ ...createForm, phone: t })}
                  keyboardType="phone-pad"
                  editable={!creating}
                />

                {createMode === 'professional' && (
                  <>
                    <Text style={styles.modalFieldLabel}>CRP</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Ex: CRP 06/12345"
                      placeholderTextColor={colors.placeholder}
                      value={createForm.crp}
                      onChangeText={(t) => setCreateForm({ ...createForm, crp: t })}
                      editable={!creating}
                    />

                    <Text style={styles.modalFieldLabel}>Especialidade</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Ex: Ansiedade e Depressao"
                      placeholderTextColor={colors.placeholder}
                      value={createForm.specialty}
                      onChangeText={(t) => setCreateForm({ ...createForm, specialty: t })}
                      editable={!creating}
                    />
                  </>
                )}

                {createMode === 'patient' && (
                  <>
                    <Text style={styles.modalFieldLabel}>Data de nascimento</Text>
                    <DateField
                      value={createForm.birth_date}
                      onChange={(v) => setCreateForm({ ...createForm, birth_date: v })}
                      max={TODAY_STR}
                      disabled={creating}
                    />

                    <Text style={styles.modalFieldLabel}>CPF</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="000.000.000-00"
                      placeholderTextColor={colors.placeholder}
                      value={createForm.cpf}
                      onChangeText={(t) => setCreateForm({ ...createForm, cpf: t })}
                      editable={!creating}
                    />
                  </>
                )}

                <View style={styles.inviteNotice}>
                  <Ionicons name="mail-outline" size={18} color={colors.primary} />
                  <Text style={styles.inviteNoticeText}>
                    Um convite sera enviado por e-mail para o usuario definir sua senha.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, creating && styles.buttonDisabled]}
                onPress={() => setCreateMode(null)}
                disabled={creating}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonCreate, creating && styles.buttonDisabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                    <Text style={styles.modalButtonCreateText}>Cadastrar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.authBg },
  circle1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#27795f', top: -110, right: -70, opacity: 0.45,
  },
  circle2: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: colors.primaryStrong, top: -55, left: -70, opacity: 0.28,
  },
  header: {
    paddingTop: 56, paddingBottom: 24, paddingHorizontal: 24,
    backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  homeBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTextBox: { flex: 1, marginHorizontal: 14 },
  headerEyebrow: { color: '#bce3d5', fontSize: 13, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 22, paddingBottom: 100, maxWidth: 960, alignSelf: 'center' as const, width: '100%' as const },

  heroCard: {
    backgroundColor: colors.white, borderRadius: 26, padding: 22, marginTop: -18, marginBottom: 22,
    shadowColor: '#174c3e', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  heroEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#6b8f82' },
  heroTitle: { marginTop: 8, fontSize: 22, fontWeight: '800', color: '#163c31', letterSpacing: -0.4 },
  heroSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: '#5d7c71' },
  heroStatsRow: { flexDirection: 'row', marginTop: 18, gap: 8 },
  heroStatCard: { flex: 1, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
  heroStatValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  heroStatLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#5f7e73', textAlign: 'center' },

  filtersCard: {
    backgroundColor: colors.white, borderRadius: 24, padding: 18, marginBottom: 18,
    shadowColor: '#174c3e', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#163c31' },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#6a887d', marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  searchBox: {
    marginTop: 14, borderRadius: 18, backgroundColor: '#f4faf7', borderWidth: 1, borderColor: '#e3efe8',
    paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center',
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#1f4036' },
  filterRow: { gap: 10, paddingRight: 6 },
  filterChip: { borderRadius: 999, backgroundColor: '#edf5f1', paddingVertical: 10, paddingHorizontal: 14 },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#5f7e73' },
  filterChipTextActive: { color: colors.white },

  listHeader: { marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultCount: { fontSize: 13, fontWeight: '700', color: '#6a887d' },

  userCard: {
    backgroundColor: colors.white, borderRadius: 24, padding: 18, marginBottom: 16,
    shadowColor: '#174c3e', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  userTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  userMainInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: '800' },
  nameBox: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '800', color: '#183d32' },
  userEmail: { marginTop: 3, fontSize: 13, color: '#6a877c' },

  badgesRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, gap: 5 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  infoGrid: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#edf4f0', gap: 10 },
  infoItem: { borderRadius: 16, backgroundColor: '#f8fcfa', padding: 14 },
  infoLabel: { fontSize: 12, fontWeight: '700', color: '#789286', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { marginTop: 6, fontSize: 14, lineHeight: 20, color: '#1f4036', fontWeight: '600' },

  actionsRow: { marginTop: 14, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, minWidth: 90, borderRadius: 14, backgroundColor: colors.primaryTint,
    paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyStateText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: '#a0b5aa' },

  fabContainer: { position: 'absolute', bottom: 24, right: 24, gap: 12, alignItems: 'center' },
  fabSmall: {
    width: 52, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  // Modals
  modalContainer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#edf4f0',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#163c31' },
  modalScroll: { flex: 1, paddingHorizontal: 24 },
  modalForm: { paddingVertical: 20, gap: 18 },
  modalFieldLabel: { fontSize: 13, fontWeight: '700', color: '#6a887d', textTransform: 'uppercase', letterSpacing: 0.6 },
  modalInput: {
    marginTop: 8, borderRadius: 14, backgroundColor: '#f8fcfa', borderWidth: 1, borderColor: '#e3efe8',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1f4036',
  },
  modalFooter: {
    flexDirection: 'row', gap: 12, paddingVertical: 16, paddingHorizontal: 24,
    borderTopWidth: 1, borderTopColor: '#edf4f0',
  },
  modalButtonCancel: { flex: 1, borderRadius: 14, backgroundColor: '#edf5f1', paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonCancelText: { fontSize: 14, fontWeight: '700', color: '#5f7e73' },
  modalButtonCreate: {
    flex: 1, borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  modalButtonCreateText: { fontSize: 14, fontWeight: '700', color: colors.white },
  buttonDisabled: { opacity: 0.6 },

  roleOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#e3efe8', backgroundColor: '#f8fcfa',
  },
  roleOptionText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#5f7e73' },

  inviteNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    borderRadius: 14, backgroundColor: colors.primaryTint, marginTop: 4,
  },
  inviteNoticeText: { flex: 1, fontSize: 13, color: colors.primaryStrong, fontWeight: '600', lineHeight: 19 },
});
