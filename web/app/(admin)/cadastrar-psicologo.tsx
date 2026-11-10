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
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { showAlert } from '../../services/feedback';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemeColors } from '../../constants/theme-palettes';
import { useTheme } from '../../contexts/ThemeContext';
import { createProfessionalAsAdmin } from '../../services/api';

// ─── Cores semânticas fixas (não mudam com a paleta) ──────────────────────────
const BLUE_LIGHT = '#eaf1ff';
const MAX_WIDTH = 1120;

const CARD_SHADOW = {
  shadowColor: '#1f5442',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

const DURATIONS = ['30', '45', '50', '60', '90'];

export default function CadastrarPsicologoScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(false);
  const [sessionDuration, setSessionDuration] = useState('50');
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    crp: '',
    specialty: '',
    bio: '',
  });

  const patch = (field: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  const handlePickPhoto = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const f = result.assets[0];
        setPhoto({
          uri: f.uri,
          name: f.name || 'foto.jpg',
          type: f.mimeType || 'image/jpeg',
        });
      }
    } catch {
      showAlert('Erro', 'Não foi possível selecionar a foto.');
    }
  };

  const handleSubmit = async () => {
    if (!form.fullName || !form.email)
      return showAlert('Campos obrigatórios', 'Preencha nome e e-mail.');
    if (!form.crp)
      return showAlert('CRP obrigatório', 'Informe o CRP do psicólogo.');

    setLoading(true);
    const result = await createProfessionalAsAdmin({
      full_name: form.fullName,
      email: form.email,
      phone: form.phone || undefined,
      crp: form.crp,
      specialty: form.specialty || undefined,
      send_invite: true,
      photo: photo ?? undefined,
    });
    setLoading(false);

    if (!result.ok) return showAlert('Erro', result.error ?? 'Não foi possível cadastrar.');
    showAlert('Sucesso', 'Psicólogo cadastrado! Um e-mail de convite foi enviado para ele definir a senha.', [{ text: 'OK', onPress: () => router.back() }]);
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
            <Text style={styles.headerTitle}>Novo psicólogo</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(admin)')}>
            <Ionicons name="home-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>

          {/* Foto (opcional) */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Foto (opcional)</Text>
            </View>

            <View style={styles.photoRow}>
              <View style={styles.photoPreview}>
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.photoImg} />
                ) : (
                  <Ionicons name="person-outline" size={32} color="#94b3a6" />
                )}
              </View>
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} activeOpacity={0.85}>
                  <Ionicons name="image-outline" size={16} color={colors.primary} />
                  <Text style={styles.photoBtnText}>{photo ? 'Trocar foto' : 'Selecionar foto'}</Text>
                </TouchableOpacity>
                {photo && (
                  <TouchableOpacity style={styles.photoRemove} onPress={() => setPhoto(null)} activeOpacity={0.85}>
                    <Ionicons name="trash-outline" size={15} color="#d95c5c" />
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Dados de acesso */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="person-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Dados de acesso</Text>
            </View>

            <Text style={styles.fieldLabel}>Nome completo *</Text>
            <TextInput style={styles.input} placeholder="Nome do psicólogo" placeholderTextColor="#94b3a6" value={form.fullName} onChangeText={patch('fullName')} />

            <Text style={styles.fieldLabel}>E-mail *</Text>
            <TextInput style={styles.input} placeholder="email@clinica.com" placeholderTextColor="#94b3a6" value={form.email} onChangeText={patch('email')} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Telefone</Text>
            <TextInput style={styles.input} placeholder="(00) 00000-0000" placeholderTextColor="#94b3a6" value={form.phone} onChangeText={patch('phone')} keyboardType="phone-pad" />
          </View>

          {/* Dados profissionais */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="medkit-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Dados profissionais</Text>
            </View>

            <Text style={styles.fieldLabel}>CRP</Text>
            <TextInput style={styles.input} placeholder="Ex: CRP 06/123456" placeholderTextColor="#94b3a6" value={form.crp} onChangeText={patch('crp')} />

            <Text style={styles.fieldLabel}>Especialidade</Text>
            <TextInput style={styles.input} placeholder="Ex: Ansiedade e Depressão" placeholderTextColor="#94b3a6" value={form.specialty} onChangeText={patch('specialty')} />

            <Text style={styles.fieldLabel}>Bio / Apresentação</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Descreva brevemente a atuação do psicólogo..."
              placeholderTextColor="#94b3a6"
              value={form.bio}
              onChangeText={patch('bio')}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Duração da sessão */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIcon}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Duração da sessão</Text>
            </View>
            <Text style={styles.cardSubtitle}>Selecione a duração padrão das consultas deste psicólogo.</Text>

            <View style={styles.durationRow}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, sessionDuration === d && styles.durationChipActive]}
                  onPress={() => setSessionDuration(d)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.durationText, sessionDuration === d && styles.durationTextActive]}>
                    {d} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[styles.submitButton, loading && styles.submitDisabled]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>Cadastrar psicólogo</Text>
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
  card: {
    backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 18, marginBottom: 16, ...CARD_SHADOW,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  cardIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: colors.textDark, letterSpacing: -0.2 },
  cardSubtitle: { marginTop: 6, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  photoPreview: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#f6faf8',
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: '100%' },
  photoActions: { flex: 1, gap: 8 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryTint,
    paddingVertical: 11, paddingHorizontal: 14, alignSelf: 'flex-start',
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  photoRemove: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 4,
  },
  photoRemoveText: { fontSize: 13, fontWeight: '600', color: '#d95c5c' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6a887d', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  input: {
    borderRadius: 12, backgroundColor: '#f6faf8', borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#1f4036',
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: 'none',
  },
  inputMultiline: { minHeight: 100, paddingTop: 13 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  durationChip: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: BLUE_LIGHT, paddingVertical: 11, paddingHorizontal: 18 },
  durationChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  durationText: { fontSize: 14, fontWeight: '700', color: '#5f7e73' },
  durationTextActive: { color: colors.primary },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, marginBottom: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
