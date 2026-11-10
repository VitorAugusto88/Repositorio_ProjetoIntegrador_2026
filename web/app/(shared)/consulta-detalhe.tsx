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
import { showAlert } from '../../services/feedback';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getAppointmentDetail,
  getPsychologists,
  cancelAppointment,
  updateAppointmentStatus,
  getAccessToken,
  getRoleFromToken,
  isAppointmentOverdue,
  OVERDUE_STATUS_LABEL,
} from '../../services/api';
import { partsToISO, toInputParts, todayISODate } from '../../services/dateInput';
import { resolveAppointmentRoomName } from '../../services/rooms';
import { DateField, TimeField } from '../../components/DateTimeField';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

// "completed" usa a cor de marca da clínica (colors.primary/primaryTint) —
// os demais status têm hues fixos, sem relação com a paleta escolhida.
const buildStatusMap = (colors: ThemeColors): Record<string, StatusConfig> => ({
  scheduled:   { label: 'Agendada',       color: '#2d6cdf', bg: '#eaf1ff', icon: 'time-outline' },
  completed:   { label: 'Concluida',      color: colors.primary, bg: colors.primaryTint, icon: 'checkmark-circle-outline' },
  cancelled:   { label: 'Cancelada',      color: '#d95c5c', bg: '#fdeeee', icon: 'close-circle-outline' },
  no_show:     { label: 'Nao compareceu', color: '#c46a1a', bg: '#fef3e8', icon: 'alert-circle-outline' },
  rescheduled: { label: 'Remarcada',      color: '#8a55d9', bg: '#f3ecff', icon: 'refresh-circle-outline' },
});

// Estado derivado: consulta em aberto cujo dia ja passou.
const OVERDUE_CONFIG: StatusConfig = {
  label: OVERDUE_STATUS_LABEL,
  color: '#c46a1a',
  bg: '#fdf1e3',
  icon: 'hourglass-outline',
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch { return iso; }
};

const formatTime = (iso: string): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return iso; }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const DecorativeBackground = ({ styles }: { styles: ReturnType<typeof createStyles> }) => (
  <>
    <View style={styles.circle1} />
    <View style={styles.circle2} />
  </>
);

export default function ConsultaDetalheScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusMap = useMemo(() => buildStatusMap(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();

  const [appointment, setAppointment] = useState<any>(null);
  const [profMap, setProfMap] = useState<Record<string, { name: string; specialty: string }>>({});
  const [loading, setLoading] = useState(true);

  // Cancel modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Status modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Reschedule modal
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [reDate, setReDate] = useState('');
  const [reTime, setReTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // Papel do usuario logado: o paciente pode cancelar a propria consulta, mas
  // NAO pode alterar o status (concluir/remarcar/marcar falta) — o backend
  // rejeita com 403. Por isso escondemos a acao "Alterar status" para pacientes.
  const [userRole, setUserRole] = useState('');
  const isPatient = userRole === 'patient';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const loadRole = async () => {
      const token = await getAccessToken();
      if (token) setUserRole(getRoleFromToken(token));
    };
    void loadRole();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const [detailRes, profsRes] = await Promise.all([
        getAppointmentDetail(id),
        getPsychologists(),
      ]);

      if (profsRes.ok && Array.isArray(profsRes.data)) {
        const map: Record<string, { name: string; specialty: string }> = {};
        for (const prof of profsRes.data) {
          map[prof.id] = {
            name: prof.user?.full_name || prof.full_name || prof.name || 'Profissional',
            specialty: prof.specialty || 'Psicologia',
          };
        }
        setProfMap(map);
      }

      if (detailRes.ok && detailRes.data) {
        setAppointment(detailRes.data);
      } else {
        showAlert('Erro', detailRes.error ?? 'Nao foi possivel carregar a consulta.');
      }

      setLoading(false);
    };
    void load();
  }, [id]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const status = appointment?.status ?? 'scheduled';
  const scheduledAt = appointment?.scheduled_at ?? '';
  // Consulta em aberto cujo dia ja passou: rotulo automatico, sem acao do
  // usuario e nunca antes/durante o dia da consulta. As acoes disponiveis
  // continuam sendo as do status real (agendada/remarcada).
  const statusCfg = isAppointmentOverdue(status, scheduledAt)
    ? OVERDUE_CONFIG
    : (statusMap[status] ?? statusMap.scheduled);
  const durationMinutes = appointment?.duration_minutes;

  const professionalId = appointment?.professional ?? '';
  const profInfo = profMap[professionalId];
  const professionalName =
    appointment?.professional_detail?.user?.full_name ??
    profInfo?.name ??
    'Profissional';
  const specialty =
    appointment?.professional_detail?.specialty ??
    profInfo?.specialty ??
    appointment?.specialty ??
    '';

  // Sala e opcional: sem sala, a linha simplesmente nao e renderizada.
  const roomName = resolveAppointmentRoomName(appointment ?? {});

  const patientName =
    appointment?.patient_detail?.user?.full_name ??
    (typeof appointment?.patient === 'string' && appointment.patient.length < 50
      ? appointment.patient
      : 'Paciente');

  const cancelReasonfromApi = appointment?.cancel_reason ?? '';
  const sessionNotes = appointment?.session_notes ?? appointment?.notes ?? '';

  const isScheduled = status === 'scheduled';
  const isCancelled = status === 'cancelled';

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!appointment) return;
    setCancelling(true);
    const reason = cancelReason.trim() || 'Cancelado pelo usuario';
    const result = await cancelAppointment(appointment.id, reason);
    setCancelling(false);
    if (result.ok) {
      setAppointment({ ...appointment, status: 'cancelled', cancel_reason: reason });
      setCancelModalVisible(false);
      showAlert('Sucesso', 'Consulta cancelada.');
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel cancelar.');
    }
  };

  const handleStatusChange = async (newStatus: 'completed' | 'no_show' | 'rescheduled') => {
    if (!appointment) return;

    // Remarcar exige nova data — abre modal próprio.
    if (newStatus === 'rescheduled') {
      const suggestion = new Date();
      suggestion.setDate(suggestion.getDate() + 1);
      const parts = toInputParts(suggestion);
      setReDate(parts.date);
      setReTime(parts.time);
      setStatusModalVisible(false);
      setRescheduleVisible(true);
      return;
    }

    setUpdatingStatus(true);
    const result = await updateAppointmentStatus(appointment.id, newStatus);
    setUpdatingStatus(false);
    if (result.ok) {
      setAppointment({ ...appointment, status: newStatus });
      setStatusModalVisible(false);
      showAlert('Sucesso', 'Status atualizado.');
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel alterar o status.');
    }
  };

  const confirmReschedule = async () => {
    if (!appointment) return;
    const iso = partsToISO(reDate, reTime);
    if (!iso) {
      showAlert('Data invalida', 'Selecione a nova data e horario.');
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      showAlert('Data invalida', 'A nova data deve ser no futuro.');
      return;
    }
    setRescheduling(true);
    const result = await updateAppointmentStatus(appointment.id, 'rescheduled', {
      scheduled_at: iso,
    });
    setRescheduling(false);
    if (result.ok) {
      setAppointment({ ...appointment, status: 'rescheduled', scheduled_at: iso });
      setRescheduleVisible(false);
      showAlert('Sucesso', 'Consulta remarcada.');
    } else {
      showAlert('Erro', result.error ?? 'Nao foi possivel remarcar.');
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <DecorativeBackground styles={styles} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerEyebrow}>Detalhes</Text>
            <Text style={styles.headerTitle}>Consulta</Text>
          </View>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando detalhes...</Text>
        </View>
      </View>
    );
  }

  if (!appointment) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Consulta nao encontrada</Text>
          </View>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.loadingBox}>
          <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
          <Text style={styles.loadingText}>Nao foi possivel carregar os dados.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <DecorativeBackground styles={styles} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerEyebrow}>Detalhes</Text>
          <Text style={styles.headerTitle}>Consulta</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Status banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusCfg.bg }]}>
            <View style={[styles.statusIconBox, { backgroundColor: statusCfg.color + '20' }]}>
              <Ionicons name={statusCfg.icon as any} size={28} color={statusCfg.color} />
            </View>
            <View style={styles.statusTextBox}>
              <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              <Text style={styles.statusDate}>{formatDate(scheduledAt)} as {formatTime(scheduledAt)}</Text>
            </View>
          </View>

          {/* Professional card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profissional</Text>
            <View style={styles.personRow}>
              <View style={[styles.avatar, { backgroundColor: '#fef3e8' }]}>
                <Text style={[styles.avatarText, { color: '#c46a1a' }]}>{getInitials(professionalName)}</Text>
              </View>
              <View style={styles.personInfo}>
                <Text style={styles.personName}>{professionalName}</Text>
                {specialty ? <Text style={styles.personMeta}>{specialty}</Text> : null}
              </View>
            </View>
          </View>

          {/* Patient card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Paciente</Text>
            <View style={styles.personRow}>
              <View style={[styles.avatar, { backgroundColor: '#eaf1ff' }]}>
                <Text style={[styles.avatarText, { color: '#2d6cdf' }]}>{getInitials(patientName)}</Text>
              </View>
              <View style={styles.personInfo}>
                <Text style={styles.personName}>{patientName}</Text>
                {appointment?.patient_detail?.user?.email && (
                  <Text style={styles.personMeta}>{appointment.patient_detail.user.email}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Details card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Informacoes</Text>
            <View style={styles.detailsGrid}>
              <InfoRow icon="calendar-outline" label="Data" value={formatDate(scheduledAt)} styles={styles} />
              <InfoRow icon="time-outline" label="Horario" value={formatTime(scheduledAt)} styles={styles} />
              {durationMinutes && (
                <InfoRow icon="hourglass-outline" label="Duracao" value={`${durationMinutes} minutos`} styles={styles} />
              )}
              <InfoRow icon="pulse-outline" label="Status" value={statusCfg.label} valueColor={statusCfg.color} styles={styles} />
              {appointment?.clinic_detail?.name && (
                <InfoRow icon="business-outline" label="Clinica" value={appointment.clinic_detail.name} styles={styles} />
              )}
              {roomName && (
                <InfoRow icon="easel-outline" label="Sala" value={roomName} styles={styles} />
              )}
            </View>
          </View>

          {/* Cancel reason */}
          {isCancelled && cancelReasonfromApi ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Motivo do cancelamento</Text>
              <View style={styles.noteBox}>
                <Ionicons name="close-circle-outline" size={18} color="#d95c5c" />
                <Text style={styles.noteText}>{cancelReasonfromApi}</Text>
              </View>
            </View>
          ) : null}

          {/* Session notes */}
          {sessionNotes ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notas da sessao</Text>
              <View style={styles.noteBox}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={styles.noteText}>{sessionNotes}</Text>
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionsCard}>
            <Text style={styles.cardTitle}>Acoes</Text>

            {isScheduled && (
              <>
                {!isPatient && (
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => setStatusModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: colors.primaryTint }]}>
                      <Ionicons name="create-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.actionTextBox}>
                      <Text style={styles.actionLabel}>Alterar status</Text>
                      <Text style={styles.actionDescription}>Concluir, remarcar ou marcar falta</Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={18} color="#94b3a6" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => { setCancelReason(''); setCancelModalVisible(true); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#fdeeee' }]}>
                    <Ionicons name="close-circle-outline" size={20} color="#d95c5c" />
                  </View>
                  <View style={styles.actionTextBox}>
                    <Text style={[styles.actionLabel, { color: '#d95c5c' }]}>Cancelar consulta</Text>
                    <Text style={styles.actionDescription}>Informe o motivo do cancelamento</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color="#94b3a6" />
                </TouchableOpacity>
              </>
            )}

            {!isScheduled && (
              <View style={styles.noActionsBox}>
                <Ionicons name="information-circle-outline" size={20} color="#94b3a6" />
                <Text style={styles.noActionsText}>
                  Nenhuma acao disponivel para consultas com status &quot;{statusCfg.label}&quot;.
                </Text>
              </View>
            )}
          </View>

        </Animated.View>
      </ScrollView>

      {/* ── Cancel Modal ── */}
      <Modal visible={cancelModalVisible} transparent animationType="fade" onRequestClose={() => !cancelling && setCancelModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalIconBox}>
              <Ionicons name="close-circle-outline" size={32} color="#d95c5c" />
            </View>
            <Text style={styles.modalTitle}>Cancelar consulta</Text>
            <Text style={styles.modalSubtitle}>
              {patientName} — {formatDate(scheduledAt)} as {formatTime(scheduledAt)}
            </Text>

            <Text style={styles.modalLabel}>Motivo (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Paciente solicitou reagendamento..."
              placeholderTextColor="#94b3a6"
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!cancelling}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
              >
                <Text style={styles.modalCancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDangerBtn, cancelling && styles.disabledBtn]}
                onPress={handleCancel}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                {cancelling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDangerBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Status Modal ── */}
      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => !updatingStatus && setStatusModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Alterar status</Text>
            <Text style={styles.modalSubtitle}>
              Selecione o novo status da consulta
            </Text>

            <View style={{ gap: 10, marginBottom: 16 }}>
              {([
                { value: 'completed' as const, label: 'Concluida', icon: 'checkmark-circle-outline', color: colors.primary, bg: colors.primaryTint },
                { value: 'rescheduled' as const, label: 'Remarcada', icon: 'refresh-circle-outline', color: '#8a55d9', bg: '#f3ecff' },
                { value: 'no_show' as const, label: 'Nao compareceu', icon: 'alert-circle-outline', color: '#c46a1a', bg: '#fef3e8' },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusOption, { borderColor: opt.bg }]}
                  onPress={() => handleStatusChange(opt.value)}
                  activeOpacity={0.8}
                  disabled={updatingStatus}
                >
                  <View style={[styles.statusOptionIcon, { backgroundColor: opt.bg }]}>
                    <Ionicons name={opt.icon as any} size={20} color={opt.color} />
                  </View>
                  <Text style={[styles.statusOptionText, { color: opt.color }]}>{opt.label}</Text>
                  {updatingStatus && <ActivityIndicator size="small" color={opt.color} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setStatusModalVisible(false)}
              disabled={updatingStatus}
            >
              <Text style={styles.modalCancelBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Reschedule Modal ── */}
      <Modal visible={rescheduleVisible} transparent animationType="fade" onRequestClose={() => !rescheduling && setRescheduleVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Remarcar consulta</Text>
            <Text style={styles.modalSubtitle}>
              Nova data e horario (deve ser no futuro)
            </Text>

            <View style={styles.dateFieldRow}>
              <View style={styles.dateCol}>
                <DateField
                  value={reDate}
                  onChange={setReDate}
                  min={todayISODate()}
                  disabled={rescheduling}
                />
              </View>
              <View style={styles.timeCol}>
                <TimeField
                  value={reTime}
                  onChange={setReTime}
                  disabled={rescheduling}
                />
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRescheduleVisible(false)}
                disabled={rescheduling}
              >
                <Text style={styles.modalCancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, rescheduling && { opacity: 0.6 }]}
                onPress={confirmReschedule}
                disabled={rescheduling}
                activeOpacity={0.85}
              >
                {rescheduling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────
const InfoRow = ({ icon, label, value, valueColor, styles }: { icon: string; label: string; value: string; valueColor?: string; styles: ReturnType<typeof createStyles> }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon as any} size={16} color="#6c8c80" />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────
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
    paddingTop: 56, paddingBottom: 24, paddingHorizontal: 24, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTextBox: { flex: 1, marginHorizontal: 14 },
  headerEyebrow: { color: '#bce3d5', fontSize: 13, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: colors.primary, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 22, paddingBottom: 40, maxWidth: 960, alignSelf: 'center' as const, width: '100%' as const },

  // Status banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 24, padding: 20, marginTop: -18, marginBottom: 18,
    shadowColor: '#174c3e', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  statusIconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusTextBox: { flex: 1 },
  statusLabel: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  statusDate: { fontSize: 14, color: '#5d7c71', fontWeight: '600', marginTop: 4 },

  // Cards
  card: {
    backgroundColor: colors.white, borderRadius: 22, padding: 20, marginBottom: 14,
    shadowColor: '#174c3e', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  cardTitle: {
    fontSize: 14, fontWeight: '700', color: '#6a887d', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 14,
  },

  // Person row
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  personInfo: { flex: 1 },
  personName: { fontSize: 16, fontWeight: '800', color: '#183d32' },
  personMeta: { fontSize: 13, color: '#6a877c', marginTop: 3 },

  // Details
  detailsGrid: { gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f6f3' },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#6c8c80', width: 80 },
  infoValue: { flex: 1, fontSize: 14, fontWeight: '700', color: '#183d32' },

  // Notes
  noteBox: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#f8fcfa' },
  noteText: { flex: 1, fontSize: 14, color: '#1f4036', lineHeight: 21 },

  // Actions
  actionsCard: {
    backgroundColor: colors.white, borderRadius: 22, padding: 20, marginBottom: 14,
    shadowColor: '#174c3e', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f6f3',
  },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionTextBox: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '700', color: '#183d32' },
  actionDescription: { fontSize: 12, color: '#7a9e90', marginTop: 2 },
  noActionsBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#f8fcfa' },
  noActionsText: { flex: 1, fontSize: 13, color: '#7a9e90', lineHeight: 19 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: colors.white, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  modalIconBox: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#fef8e8',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#173d31', textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#6c8c80', textAlign: 'center', marginTop: 6, marginBottom: 20, lineHeight: 19 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#5f7d70', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    minHeight: 80, borderRadius: 14, borderWidth: 1.5, borderColor: '#d7ebe2',
    backgroundColor: '#fbfefd', paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#173d31', marginBottom: 20,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#cfe7dc',
    backgroundColor: '#f9fdfb', alignItems: 'center', justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 14, fontWeight: '700', color: '#5e7b70' },
  modalDangerBtn: {
    flex: 1, height: 48, borderRadius: 14, backgroundColor: '#d95c5c',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDangerBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  modalConfirmBtn: {
    flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  modalConfirmBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  dateFieldRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  dateCol: { flex: 1.4, minWidth: 0 },
  timeCol: { flex: 1, minWidth: 0 },
  disabledBtn: { opacity: 0.6 },

  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#fbfefd',
  },
  statusOptionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusOptionText: { fontSize: 15, fontWeight: '700' },
});
