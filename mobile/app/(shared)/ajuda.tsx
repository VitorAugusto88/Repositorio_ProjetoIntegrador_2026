import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemeColors } from "../../constants/theme-palettes";
import { useTheme } from "../../contexts/ThemeContext";
import { showToast } from "../../services/feedback";

const MAX_WIDTH = 760;

// E-mail de suporte — mesmo usado na tela de Configurações.
const SUPPORT_EMAIL = "suporte@clinica.com.br";

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: FaqItem[];
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "consultas",
    title: "Consultas",
    icon: "calendar-outline",
    items: [
      {
        id: "agendar",
        question: "Como agendo uma consulta?",
        answer:
          'Acesse "Agendar Consulta" na tela inicial, escolha um dia disponível no calendário e depois um horário livre do seu psicólogo. Confirme os dados e pronto — a consulta aparece em "Minhas Consultas".',
      },
      {
        id: "cancelar",
        question: "Posso cancelar ou remarcar uma consulta?",
        answer:
          'Sim. Abra "Minhas Consultas", toque na consulta desejada e use as opções de cancelamento ou remarcação. Recomendamos avisar com antecedência para que o horário fique disponível para outros pacientes.',
      },
      {
        id: "confirmacao",
        question: "Não recebi a confirmação do meu agendamento. O que fazer?",
        answer:
          'Verifique em "Minhas Consultas" se o horário aparece como agendado — a confirmação em tela é o registro oficial. Confira também suas notificações no sino no topo da tela inicial. Se algo parecer errado, entre em contato com o suporte.',
      },
      {
        id: "atraso",
        question: "E se eu me atrasar ou perder o horário da consulta?",
        answer:
          "Avise seu psicólogo pelo chat assim que perceber o atraso. Consultas não realizadas ficam registradas com o status correspondente e podem ser remarcadas de acordo com a política da clínica.",
      },
    ],
  },
  {
    id: "psicologo",
    title: "Meu psicólogo e o chat",
    icon: "chatbubble-ellipses-outline",
    items: [
      {
        id: "conversar",
        question: "Como falo com meu psicólogo fora da consulta?",
        answer:
          'Use o "Chat", acessível pela tela inicial. As mensagens ficam registradas na conversa e o profissional é notificado.',
      },
      {
        id: "trocar-psicologo",
        question: "Posso trocar de psicólogo?",
        answer:
          'A definição ou troca do profissional responsável é feita pela administração da clínica. Fale com o suporte explicando o motivo e a equipe te orienta sobre os próximos passos.',
      },
    ],
  },
  {
    id: "conta",
    title: "Conta e perfil",
    icon: "person-circle-outline",
    items: [
      {
        id: "editar-perfil",
        question: "Como atualizo meus dados de perfil?",
        answer:
          'Abra "Perfil", toque em editar, altere as informações desejadas e salve. Alguns dados cadastrais podem exigir contato com a clínica para alteração.',
      },
      {
        id: "senha",
        question: "Esqueci minha senha. Como faço para recuperá-la?",
        answer:
          'Na tela de login, toque em "Esqueci minha senha" e siga as instruções enviadas por e-mail. Se já estiver logado, é possível trocar a senha em Configurações → Alterar senha.',
      },
      {
        id: "notificacoes",
        question: "Como ativo ou desativo as notificações?",
        answer:
          'Em Configurações → Notificações push você liga ou desliga os avisos de consultas e mensagens neste aparelho (disponível apenas no aplicativo para celular).',
      },
    ],
  },
  {
    id: "privacidade",
    title: "Privacidade e segurança",
    icon: "shield-checkmark-outline",
    items: [
      {
        id: "dados-seguros",
        question: "Meus dados e o conteúdo das consultas estão seguros?",
        answer:
          "Sim. Seus dados são tratados conforme a LGPD (Lei nº 13.709/2018) e ficam visíveis apenas para você e para o profissional responsável pelo seu atendimento. Veja mais detalhes na Política de Privacidade, em Configurações.",
      },
      {
        id: "apagar-dados",
        question: "Posso apagar minhas mensagens ou notificações?",
        answer:
          'Sim. Em Configurações → Dados você encontra as opções "Apagar todas as notificações" e "Apagar todas as mensagens". Essas ações não podem ser desfeitas.',
      },
    ],
  },
];

export default function HelpScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const openSupportEmail = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Dúvida - Sistema Clínico")}`,
    ).catch(() => showToast("Não foi possível abrir o app de e-mail.", "error"));
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ajuda</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="help-circle-outline" size={24} color={colors.primary} />
          </View>
          <Text style={styles.introTitle}>Perguntas frequentes</Text>
          <Text style={styles.introText}>
            Reunimos as dúvidas mais comuns sobre consultas, seu psicólogo e sua conta.
            Toque em uma pergunta para ver a resposta.
          </Text>
        </View>

        {FAQ_CATEGORIES.map((category) => (
          <View key={category.id} style={styles.categoryBlock}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryIcon}>
                <Ionicons name={category.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.categoryTitle}>{category.title}</Text>
            </View>

            <View style={styles.card}>
              {category.items.map((item, index) => {
                const isOpen = expandedId === item.id;
                const isLast = index === category.items.length - 1;

                return (
                  <View key={item.id} style={[styles.faqRow, isLast && styles.faqRowLast]}>
                    <TouchableOpacity
                      style={styles.faqQuestionRow}
                      onPress={() => toggleItem(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.faqQuestion}>{item.question}</Text>
                      <Ionicons
                        name={isOpen ? "chevron-up-outline" : "chevron-down-outline"}
                        size={18}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    {isOpen && <Text style={styles.faqAnswer}>{item.answer}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.supportCard}>
          <Ionicons name="mail-outline" size={22} color={colors.primary} />
          <Text style={styles.supportTitle}>Não encontrou o que procurava?</Text>
          <Text style={styles.supportText}>
            Fale com a nossa equipe de suporte e responderemos assim que possível.
          </Text>
          <TouchableOpacity
            style={styles.supportBtn}
            onPress={openSupportEmail}
            activeOpacity={0.85}
          >
            <Ionicons name="mail-outline" size={16} color={colors.white} />
            <Text style={styles.supportBtnText}>Contatar suporte</Text>
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
      width: "100%",
      maxWidth: MAX_WIDTH,
      alignSelf: "center",
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { color: colors.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 48,
      maxWidth: MAX_WIDTH,
      alignSelf: "center" as const,
      width: "100%" as const,
    },
    introCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      marginBottom: 26,
      ...CARD_SHADOW,
    },
    introIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    introTitle: { fontSize: 22, fontWeight: "800", color: colors.textDark, marginBottom: 10 },
    introText: { fontSize: 14, lineHeight: 21, color: colors.textMuted, fontWeight: "500" },
    categoryBlock: { marginBottom: 22 },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      marginLeft: 2,
    },
    categoryIcon: {
      width: 26,
      height: 26,
      borderRadius: 9,
      backgroundColor: colors.primaryTint,
      alignItems: "center",
      justifyContent: "center",
    },
    categoryTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      ...CARD_SHADOW,
    },
    faqRow: {
      paddingHorizontal: 16,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    faqRowLast: { borderBottomWidth: 0 },
    faqQuestionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 14,
    },
    faqQuestion: {
      flex: 1,
      fontSize: 14.5,
      fontWeight: "700",
      color: colors.textDark,
    },
    faqAnswer: {
      fontSize: 13.5,
      lineHeight: 20,
      color: colors.textMuted,
      fontWeight: "500",
      paddingBottom: 16,
      paddingRight: 26,
    },
    supportCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
      marginTop: 4,
      ...CARD_SHADOW,
    },
    supportTitle: {
      marginTop: 10,
      fontSize: 16,
      fontWeight: "800",
      color: colors.textDark,
      textAlign: "center",
    },
    supportText: {
      marginTop: 6,
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.textMuted,
      fontWeight: "500",
      textAlign: "center",
    },
    supportBtn: {
      marginTop: 16,
      height: 46,
      borderRadius: 13,
      paddingHorizontal: 20,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    supportBtnText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  });
