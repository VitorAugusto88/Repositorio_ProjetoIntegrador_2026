import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';
import { showAlert } from '../../services/feedback';
import { DateField } from '../../components/DateTimeField';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { createPatientAsAdmin, getPsychologists, ProfessionalApiItem } from '../../services/api';

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: '#1f5442',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

const psychologistName = (item: ProfessionalApiItem) =>
  item.user?.full_name?.trim() || item.full_name?.trim() || item.name?.trim() || 'Profissional';

export default function CadastrarPacienteScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [psychologists, setPsychologists] = useState<ProfessionalApiItem[]>([]);
  const [loadingPsychologists, setLoadingPsychologists] = useState(true);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    birthDate: '',
    cpf: '',
    emergencyName: '',
    emergencyPhone: '',
    assignedProfessional: '',
  });

  const patch = (field: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  // O paciente é vinculado a um psicólogo já no cadastro e não escolhe com quem
  // se consulta — a troca depois passa pelo administrador.
  useEffect(() => {
    const carregar = async () => {
      setLoadingPsychologists(true);
      const result = await getPsychologists();
      setPsychologists(result.ok && Array.isArray(result.data) ? result.data : []);
      setLoadingPsychologists(false);
    };
    void carregar();
  }, []);

  // Data máxima do calendário: hoje (não faz sentido nascer no futuro).
  const todayStr = new Date().toLocaleDateString('en-CA');

  const handleSubmit = async () => {
    if (!form.fullName || !form.email)
      return showAlert('Campos obrigatórios', 'Preencha nome e e-mail.');

    if (!form.assignedProfessional)
      return showAlert(
        'Psicólogo responsável',
        'Selecione o psicólogo que vai atender este paciente.',
      );

    setLoading(true);
    const result = await createPatientAsAdmin({
      full_name: form.fullName,
      email: form.email,
      phone: form.phone || undefined,
      birth_date: form.birthDate || undefined,
      cpf: form.cpf || undefined,
      emergency_contact_name: form.emergencyName || undefined,
      emergency_contact_phone: form.emergencyPhone || undefined,
      assigned_professional: form.assignedProfessional,
      send_invite: true,
    });
    setLoading(false);

    if (!result.ok) return showAlert('Erro', result.error ?? 'Não foi possível cadastrar.');
    showAlert('Sucesso', 'Paciente cadastrado! Um e-mail de convite foi enviado para ele definir a senha.', [{ text: 'OK', onPress: () => router.back() }]);
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
            <Text style={styles.headerTitle}>Novo paciente</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(admin)')}>
            <Ionicons name="home-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>

          {/* Dados de acesso */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="person-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Dados de acesso</Text>
            </View>

            <Text style={styles.fieldLabel}>Nome completo *</Text>
            <TextInput style={styles.input} placeholder="Nome do paciente" placeholderTextColor="#94b3a6" value={form.fullName} onChangeText={patch('fullName')} />

            <Text style={styles.fieldLabel}>E-mail *</Text>
            <TextInput style={styles.input} placeholder="email@exemplo.com" placeholderTextColor="#94b3a6" value={form.email} onChangeText={patch('email')} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Telefone</Text>
            <TextInput style={styles.input} placeholder="(00) 00000-0000" placeholderTextColor="#94b3a6" value={form.phone} onChangeText={patch('phone')} keyboardType="phone-pad" />
          </View>

          {/* Psicólogo responsável */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="people-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Psicólogo responsável *</Text>
            </View>

            <Text style={styles.cardHint}>
              O paciente será atendido por este psicólogo e não poderá escolher outro.
              A troca é feita por aqui, pelo administrador.
            </Text>

            {loadingPsychologists ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
            ) : psychologists.length === 0 ? (
              <Text style={styles.emptyText}>
                Nenhum psicólogo cadastrado. Cadastre um psicólogo antes de cadastrar pacientes.
              </Text>
            ) : (
              <View style={styles.psychologistList}>
                {psychologists.map((item) => {
                  const selected = form.assignedProfessional === String(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.psychologistOption, selected && styles.psychologistOptionSelected]}
                      onPress={() => patch('assignedProfessional')(String(item.id))}
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
          </View>

          {/* Dados clínicos */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Dados clínicos</Text>
            </View>

            <Text style={styles.fieldLabel}>Data de nascimento</Text>
            <DateField value={form.birthDate} onChange={patch('birthDate')} max={todayStr} />

            <Text style={styles.fieldLabel}>CPF</Text>
            <TextInput style={styles.input} placeholder="000.000.000-00" placeholderTextColor="#94b3a6" value={form.cpf} onChangeText={patch('cpf')} keyboardType="numeric" />
          </View>

          {/* Contato de emergência */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="call-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Contato de emergência</Text>
            </View>

            <Text style={styles.fieldLabel}>Nome</Text>
            <TextInput style={styles.input} placeholder="Nome do contato" placeholderTextColor="#94b3a6" value={form.emergencyName} onChangeText={patch('emergencyName')} />

            <Text style={styles.fieldLabel}>Telefone</Text>
            <TextInput style={styles.input} placeholder="(00) 00000-0000" placeholderTextColor="#94b3a6" value={form.emergencyPhone} onChangeText={patch('emergencyPhone')} keyboardType="phone-pad" />
          </View>

          <TouchableOpacity style={[styles.submitButton, loading && styles.submitDisabled]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>Cadastrar paciente</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    card: {
      backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: 18, marginBottom: 16, ...CARD_SHADOW,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    cardIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15.5, fontWeight: '800', color: colors.textDark, letterSpacing: -0.2 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6a887d', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    input: {
      borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#1f4036',
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: 'none',
    },
    cardHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 10 },
    emptyText: { fontSize: 13, color: colors.textMuted, marginTop: 14, lineHeight: 19 },
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
    submitButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, marginBottom: 8,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
    cancelButton: { alignItems: 'center', paddingVertical: 14 },
    cancelText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  });
