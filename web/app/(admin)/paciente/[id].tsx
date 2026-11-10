import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemeColors } from '../../../constants/theme-palettes';
import { useTheme } from '../../../contexts/ThemeContext';
import { showAlert } from '../../../services/feedback';
import {
  getPatientProfile,
  getPsychologists,
  updatePatientAssignedProfessional,
  updateUser,
  PatientProfileApiItem,
  ProfessionalApiItem,
} from '../../../services/api';

const psychologistName = (item?: ProfessionalApiItem | null) =>
  item?.user?.full_name?.trim() || item?.full_name?.trim() || item?.name?.trim() || '';

// ─── Cores semânticas fixas (não mudam com a paleta) ──────────────────────────
const BLUE = '#2d6cdf';
const BLUE_LIGHT = '#eaf1ff';
const RED = '#d95c5c';
const RED_LIGHT = '#fdeeee';

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: '#1f5442',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// Usa PatientProfileApiItem da API:
// { id, user: { id, full_name, email, phone, is_active, created_at, ... }, birth_date, cpf, ... }
type PatientDetail = PatientProfileApiItem;

const InfoRow = ({
  icon,
  label,
  value,
  styles,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIconBox}>
      <Ionicons name={icon as any} size={16} color={colors.primary} />
    </View>
    <View style={styles.infoTextBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  </View>
);

export default function PatientDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();

  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Campos editáveis
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Troca do psicólogo responsável — exclusiva do administrador.
  const [psychologists, setPsychologists] = useState<ProfessionalApiItem[]>([]);
  const [changingPsychologist, setChangingPsychologist] = useState(false);
  const [selectedPsychologist, setSelectedPsychologist] = useState('');
  const [savingPsychologist, setSavingPsychologist] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const result = await getPatientProfile(id);
        if (!result.ok || !result.data) {
          showAlert('Erro', result.error ?? 'Não foi possível carregar o paciente.');
          router.back();
          return;
        }
        setPatient(result.data);
        setEditName(result.data.user.full_name ?? '');
        setEditPhone(result.data.user.phone ?? '');
      } catch (err: any) {
        showAlert('Erro', err?.message ?? 'Ocorreu um erro inesperado.');
        router.back();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const handleStartChangingPsychologist = async () => {
    setChangingPsychologist(true);
    setSelectedPsychologist(patient?.assigned_professional ?? '');
    if (psychologists.length === 0) {
      const result = await getPsychologists();
      setPsychologists(result.ok && Array.isArray(result.data) ? result.data : []);
    }
  };

  const handleSavePsychologist = async () => {
    if (!patient || !selectedPsychologist) return;

    setSavingPsychologist(true);
    try {
      const result = await updatePatientAssignedProfessional(
        patient.user.id,
        selectedPsychologist,
      );
      if (!result.ok) {
        showAlert('Erro', result.error ?? 'Não foi possível alterar o psicólogo.');
        return;
      }
      // Relê o perfil para trazer assigned_professional_detail já atualizado,
      // em vez de remontar o objeto aninhado na mão.
      const atualizado = await getPatientProfile(patient.user.id);
      if (atualizado.ok && atualizado.data) setPatient(atualizado.data);
      setChangingPsychologist(false);
      showAlert('Sucesso', 'Psicólogo responsável atualizado.');
    } catch (err: any) {
      showAlert('Erro', err?.message ?? 'Ocorreu um erro inesperado.');
    } finally {
      setSavingPsychologist(false);
    }
  };

  const handleSave = async () => {
    if (!patient) return;
    if (!editName.trim()) {
      showAlert('Campo obrigatório', 'O nome não pode ficar em branco.');
      return;
    }
    setSaving(true);
    try {
      // full_name e phone pertencem ao model User → PATCH /api/auth/me/ via updateUser
      const userResult = await updateUser(patient.user.id, {
        full_name: editName.trim(),
        phone: editPhone.trim() || undefined,
      });
      if (!userResult.ok) {
        showAlert('Erro', userResult.error ?? 'Não foi possível salvar as alterações.');
        return;
      }
      setPatient((prev) =>
        prev
          ? { ...prev, user: { ...prev.user, full_name: editName.trim(), phone: editPhone.trim() } }
          : prev
      );
      setEditing(false);
      showAlert('Sucesso', 'Dados do paciente atualizados.');
    } catch (err: any) {
      showAlert('Erro', err?.message ?? 'Ocorreu um erro inesperado.');
    } finally {
      setSaving(false);
    }
  };

  const initials = patient
    ? patient.user.full_name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    : '';

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const Header = ({ title }: { title: string }) => (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
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
        <Header title="Paciente" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Buscando dados do paciente...</Text>
        </View>
      </View>
    );
  }

  if (!patient) return null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <Header title="Paciente" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* ── Avatar + nome ── */}
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.profileName}>{patient.user.full_name}</Text>
            <Text style={styles.profileEmail}>{patient.user.email}</Text>

            <View style={[
              styles.statusBadge,
              { backgroundColor: patient.user.is_active ? colors.primaryTint : RED_LIGHT }
            ]}>
              <Ionicons
                name={patient.user.is_active ? 'checkmark-circle-outline' : 'pause-circle-outline'}
                size={14}
                color={patient.user.is_active ? colors.primary : RED}
              />
              <Text style={[
                styles.statusText,
                { color: patient.user.is_active ? colors.primary : RED }
              ]}>
                {patient.user.is_active ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>

          {/* ── Dados cadastrais ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dados cadastrais</Text>

            <InfoRow icon="mail-outline" label="E-mail" value={patient.user.email} styles={styles} colors={colors} />
            <View style={styles.divider} />
            <InfoRow icon="call-outline" label="Telefone" value={patient.user.phone ?? '—'} styles={styles} colors={colors} />
            <View style={styles.divider} />
            <InfoRow icon="card-outline" label="CPF" value={patient.cpf ?? '—'} styles={styles} colors={colors} />
            <View style={styles.divider} />
            <InfoRow
              icon="calendar-outline"
              label="Data de nascimento"
              value={formatDate(patient.birth_date ?? undefined)}
              styles={styles}
              colors={colors}
            />
            <View style={styles.divider} />
            <InfoRow
              icon="time-outline"
              label="Cadastrado em"
              value={formatDate(patient.user.created_at)}
              styles={styles}
              colors={colors}
            />
          </View>

          {/* ── Psicólogo responsável ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Psicólogo responsável</Text>

            <InfoRow
              icon="person-outline"
              label="Atendido por"
              value={psychologistName(patient.assigned_professional_detail) || '—'}
              styles={styles}
              colors={colors}
            />

            {changingPsychologist ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.psychologistHint}>
                  O paciente não escolhe com quem se consulta. Ao trocar, os próximos
                  agendamentos passam a ser com o novo psicólogo; as consultas já marcadas
                  não mudam.
                </Text>

                {psychologists.length === 0 ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 14 }} />
                ) : (
                  <View style={styles.psychologistList}>
                    {psychologists.map((item) => {
                      const selected = selectedPsychologist === String(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.psychologistOption, selected && styles.psychologistOptionSelected]}
                          onPress={() => setSelectedPsychologist(String(item.id))}
                          disabled={savingPsychologist}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                            color={selected ? colors.primary : '#a8c4b8'}
                          />
                          <View style={styles.psychologistInfo}>
                            <Text style={styles.psychologistName}>{psychologistName(item)}</Text>
                            <Text style={styles.psychologistMeta}>
                              {[item.specialty || 'Psicologia', item.crp ? `CRP ${item.crp}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setChangingPsychologist(false)}
                    disabled={savingPsychologist}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      (savingPsychologist ||
                        !selectedPsychologist ||
                        selectedPsychologist === patient.assigned_professional) &&
                        styles.saveButtonDisabled,
                    ]}
                    onPress={handleSavePsychologist}
                    disabled={
                      savingPsychologist ||
                      !selectedPsychologist ||
                      selectedPsychologist === patient.assigned_professional
                    }
                    activeOpacity={0.85}
                  >
                    {savingPsychologist ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={16} color="#fff" />
                        <Text style={styles.saveButtonText}>Salvar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.changePsychologistButton}
                onPress={handleStartChangingPsychologist}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                <Text style={styles.changePsychologistText}>Alterar psicólogo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Edição rápida ── */}
          {editing ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Editar dados básicos</Text>
              <Text style={styles.fieldLabel}>Nome completo</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Nome completo"
                placeholderTextColor={colors.placeholder}
                editable={!saving}
              />
              <Text style={styles.fieldLabel}>Telefone</Text>
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Telefone"
                placeholderTextColor={colors.placeholder}
                keyboardType="phone-pad"
                editable={!saving}
              />
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditing(false);
                    setEditName(patient.user.full_name);
                    setEditPhone(patient.user.phone ?? '');
                  }}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text style={styles.saveButtonText}>Salvar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditing(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={styles.editButtonText}>Editar dados básicos</Text>
            </TouchableOpacity>
          )}

          {/* ── Ações rápidas ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ações rápidas</Text>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push({ pathname: '/(admin)/agendar', params: { patientId: patient.id } })}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBox, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.actionTextBox}>
                <Text style={styles.actionTitle}>Agendar consulta</Text>
                <Text style={styles.actionSubtitle}>Criar novo agendamento para este paciente</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#9db6ab" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push({ pathname: '/(admin)/consultas' })}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBox, { backgroundColor: BLUE_LIGHT }]}>
                <Ionicons name="list-outline" size={20} color={BLUE} />
              </View>
              <View style={styles.actionTextBox}>
                <Text style={styles.actionTitle}>Ver consultas</Text>
                <Text style={styles.actionSubtitle}>Histórico de atendimentos da clínica</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#9db6ab" />
            </TouchableOpacity>
          </View>

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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 44 },
  container: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },

  profileCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 26,
    marginBottom: 16,
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: BLUE },
  profileName: { fontSize: 21, fontWeight: '800', color: colors.textDark, textAlign: 'center', letterSpacing: -0.4 },
  profileEmail: { marginTop: 6, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  statusText: { fontSize: 13, fontWeight: '700' },

  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.textDark, marginBottom: 14, letterSpacing: -0.2 },

  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoTextBox: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: '#7a9b8e', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { marginTop: 3, fontSize: 15, fontWeight: '600', color: '#1b4337' },
  divider: { height: 1, backgroundColor: '#edf4f0', marginVertical: 2 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#5f7d70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7ebe2',
    backgroundColor: '#f6faf8',
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.textDark,
    fontWeight: '500',
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: 'none',
  },
  editActionsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d7ebe2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveButtonDisabled: { opacity: 0.75 },
  saveButtonText: { fontSize: 14, fontWeight: '700', color: colors.white },

  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cfe7dc',
    backgroundColor: '#f9fdfb',
    marginBottom: 14,
  },
  editButtonText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // Psicólogo responsável
  psychologistHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 12 },
  psychologistList: { marginTop: 14, gap: 8 },
  psychologistOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#f6faf8', paddingHorizontal: 14, paddingVertical: 12,
  },
  psychologistOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  psychologistInfo: { flex: 1, minWidth: 0 },
  psychologistName: { fontSize: 14, fontWeight: '700', color: colors.textDark },
  psychologistMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  changePsychologistButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: colors.primaryTint, backgroundColor: colors.primaryTint,
  },
  changePsychologistText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  actionIconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionTextBox: { flex: 1, marginRight: 8 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: colors.textDark },
  actionSubtitle: { marginTop: 3, fontSize: 12, color: colors.textMuted },
});
