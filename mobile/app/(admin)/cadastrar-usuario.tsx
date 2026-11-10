import React, { useMemo, useState } from 'react';
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
import { showAlert } from '../../services/feedback';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { createPatientAsAdmin, createProfessionalAsAdmin } from '../../services/api';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';

const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: '#1f5442',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

type Role = 'professional' | 'patient';

const ROLE_OPTIONS: { key: Role; label: string; icon: string; desc: string }[] = [
  { key: 'professional', label: 'Psicólogo', icon: 'medkit-outline', desc: 'Atende pacientes e gerencia agenda.' },
  { key: 'patient', label: 'Paciente', icon: 'person-outline', desc: 'Acessa consultas e histórico clínico.' },
];

export default function CadastrarUsuarioScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<Role>('professional');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

  const patch = (field: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = async () => {
    if (!form.fullName || !form.email)
      return showAlert('Campos obrigatórios', 'Preencha nome e e-mail.');

    setLoading(true);
    const payload = {
      full_name: form.fullName,
      email: form.email,
      phone: form.phone || undefined,
      send_invite: true,
    };

    const result = role === 'patient'
      ? await createPatientAsAdmin(payload)
      : await createProfessionalAsAdmin(payload);
    setLoading(false);

    if (!result.ok) return showAlert('Erro', result.error ?? 'Não foi possível cadastrar.');
    showAlert('Sucesso', 'Usuário cadastrado! Um e-mail de convite foi enviado para ele definir a senha.', [{ text: 'OK', onPress: () => router.back() }]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Novo usuário</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(admin)')}>
            <Ionicons name="home-outline" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>

          {/* Seletor de perfil */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tipo de perfil</Text>
            <Text style={styles.cardSubtitle}>Selecione qual perfil este usuário terá no sistema.</Text>
            <View style={styles.roleGrid}>
              {ROLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.roleCard, role === opt.key && styles.roleCardActive]}
                  onPress={() => setRole(opt.key)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.roleIcon, role === opt.key && styles.roleIconActive]}>
                    <Ionicons name={opt.icon as any} size={20} color={role === opt.key ? colors.white : colors.primary} />
                  </View>
                  <Text style={[styles.roleLabel, role === opt.key && styles.roleLabelActive]}>{opt.label}</Text>
                  <Text style={styles.roleDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Formulário */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dados do usuário</Text>

            <Text style={styles.fieldLabel}>Nome completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o nome completo"
              placeholderTextColor={colors.placeholder}
              value={form.fullName}
              onChangeText={patch('fullName')}
            />

            <Text style={styles.fieldLabel}>E-mail *</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite o e-mail"
              placeholderTextColor={colors.placeholder}
              value={form.email}
              onChangeText={patch('email')}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Telefone</Text>
            <TextInput
              style={styles.input}
              placeholder="(00) 00000-0000"
              placeholderTextColor={colors.placeholder}
              value={form.phone}
              onChangeText={patch('phone')}
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={20} color={colors.white} />
                <Text style={styles.submitText}>Cadastrar usuário</Text>
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
    cardTitle: { fontSize: 16, fontWeight: '800', color: colors.textDark, letterSpacing: -0.2 },
    cardSubtitle: { marginTop: 6, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
    roleGrid: { marginTop: 16, gap: 10 },
    roleCard: { borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#f6faf8', padding: 16 },
    roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
    roleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    roleIconActive: { backgroundColor: colors.primary },
    roleLabel: { fontSize: 15, fontWeight: '800', color: colors.textDark },
    roleLabelActive: { color: colors.primary },
    roleDesc: { marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6a887d', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    input: {
      borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#1f4036',
      // @ts-ignore — remove o contorno azul no web
      outlineStyle: 'none',
    },
    submitButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, marginBottom: 8,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
    cancelButton: { alignItems: 'center', paddingVertical: 14 },
    cancelText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  });
