import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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
    getAppointments,
    getClinicPatients,
    getMe,

} from "../../services/api";

// Cor semântica fixa (não muda com a paleta da clínica).
const BLUE_LIGHT = "#eaf1ff";

const MAX_WIDTH = 1120;
const DESKTOP_BREAKPOINT = 900;

const CARD_SHADOW = {
  shadowColor: "#1f5442",
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

export default function PsychologistPatientListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState("");
  const [allPatients, setAllPatients] = useState<any[]>([]); // All loaded patients
  const [patients, setPatients] = useState<any[]>([]); // Paginated display
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  useEffect(() => {
    const loadPatients = async () => {
      setLoading(true);
      try {
        // getMe e getAppointments não dependem um do outro — rodam em paralelo
        const [meResult, appointmentsResult] = await Promise.all([
          getMe(),
          getAppointments(),
        ]);

        if (!meResult.ok || !meResult.data?.clinic) {
          showAlert("Erro", "Não foi possível obter a clínica do usuário.");
          setLoading(false);
          return;
        }
        const clinicId = meResult.data.clinic;

        const patientsResult = await getClinicPatients(clinicId);
        if (!patientsResult.ok) {
          showAlert(
            "Erro",
            patientsResult.error || "Erro ao carregar pacientes.",
          );
          setLoading(false);
          return;
        }

        const appointments = appointmentsResult.ok
          ? appointmentsResult.data || []
          : [];

        // ─── FEATURE 5: Load PatientProfile.id for each patient in parallel
      const patientsWithProfiles = (patientsResult.data || []).map((patient: any) => ({
  ...patient,
  userId: patient.user?.id ?? patient.id,
  profileId: patient.id, // PatientProfile.id — já correto
}));

        const patientsWithLastAppointment = patientsWithProfiles.map(
          (patient: any) => {
            const patientAppointments = appointments
              .filter(
                (app: any) =>
                  app.patient === patient.profileId ||
                  app.patient === patient.userId,
              )
              .sort(
                (a: any, b: any) =>
                  new Date(b.scheduled_at).getTime() -
                  new Date(a.scheduled_at).getTime(),
              );

            const lastAppointment = patientAppointments[0];

            return {
              ...patient,
              _userId: patient.userId,
              _profileId: patient.profileId,
              // Serializer flat: full_name e phone já estão na raiz do objeto
              _displayName: patient.user?.full_name ?? patient.full_name ?? "Sem nome",
_displayPhone: patient.user?.phone ?? patient.phone ?? "Telefone não informado",
              lastAppointment: lastAppointment?.scheduled_at
                ? new Date(lastAppointment.scheduled_at).toLocaleDateString(
                    "pt-BR",
                  )
                : patient.created_at
                  ? new Date(patient.created_at).toLocaleDateString("pt-BR")
                  : "Não informado",
            };
          },
        );

        // ─── FEATURE 5: Pagination — show first 20 items and set hasMore flag
        const pageSize = 20;
        const initialPageItems = patientsWithLastAppointment.slice(0, pageSize);
        setAllPatients(patientsWithLastAppointment);
        setPatients(initialPageItems);
        setHasMore(patientsWithLastAppointment.length > pageSize);
        setPage(1);
      } catch {
        showAlert("Erro", "Erro inesperado ao carregar pacientes.");
      } finally {
        setLoading(false);
      }
    };

    loadPatients();
  }, []);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Com busca ativa procuramos em TODOS os pacientes carregados, e nao apenas
  // na pagina exibida — senao um paciente da 21a posicao em diante so aparecia
  // na busca depois de o usuario clicar em "carregar mais".
  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return patients;
    return allPatients.filter(
      (patient) =>
        patient._displayName.toLowerCase().includes(normalizedQuery) ||
        patient._displayPhone?.toLowerCase().includes(normalizedQuery),
    );
  }, [query, patients, allPatients]);

  // ─── FEATURE 5: Handle load more ──────────────────────────────────────────
  const handleLoadMore = async () => {
    const pageSize = 20;
    const newPage = page + 1;
    const startIndex = (newPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    setLoadingMore(true);
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newPageItems = allPatients.slice(0, endIndex);
    setPatients(newPageItems);
    setPage(newPage);
    setHasMore(endIndex < allPatients.length);
    setLoadingMore(false);
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
            <Text style={styles.headerTitle}>Pacientes</Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.replace("/(psychologist)/dashboardP")}
          >
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
            <Text style={styles.loadingText}>Carregando pacientes...</Text>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.container,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.searchCard}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar por nome ou telefone"
                  placeholderTextColor="#8ba99d"
                />
              </View>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Pacientes encontrados</Text>
              <View style={styles.countBadge}>
                <Text style={styles.resultCount}>{filteredPatients.length}</Text>
              </View>
            </View>

            <View style={styles.patientsWrap}>
              {filteredPatients.map((patient) => {
                const initials = patient._displayName
                  .split(" ")
                  .slice(0, 2)
                  .map((part: string) => part[0])
                  .join("");

                return (
                  <TouchableOpacity
                    key={patient._profileId}
                    style={[
                      styles.patientCard,
                      { flexBasis: isDesktop ? 360 : "100%" },
                    ]}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: "/(psychologist)/ficha",
                        params: {
                          // user.id — necessário para carregar o perfil do paciente
                          patientId: patient._userId,
                          // patientProfileId será sobrescrito em ficha.tsx com patient?.id do getPatientProfile()
                          // que é o verdadeiro PatientProfile.id exigido pelo backend para upload
                          patientProfileId: patient._profileId,
                          patientName: patient._displayName,
                          patientPhone: patient._displayPhone,
                        },
                      })
                    }
                  >
                    <View style={styles.patientHeader}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>

                      <View style={styles.patientTextBox}>
                        <Text style={styles.patientName} numberOfLines={1}>
                          {patient._displayName}
                        </Text>
                        <Text style={styles.patientMeta} numberOfLines={1}>
                          {patient._displayPhone}
                        </Text>
                      </View>

                      <Ionicons
                        name="chevron-forward-outline"
                        size={20}
                        color="#9db6ab"
                      />
                    </View>

                    <View style={styles.lastAppointmentBox}>
                      <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                      <Text style={styles.lastAppointmentText}>
                        Última consulta: {patient.lastAppointment}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Durante a busca a lista ja cobre todos os pacientes carregados,
                entao o botao de paginacao nao faz sentido. */}
            {hasMore && !query.trim() && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={handleLoadMore}
                disabled={loadingMore}
                activeOpacity={0.85}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-download-outline"
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={styles.loadMoreText}>
                      Carregar mais pacientes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 52,
    paddingBottom: 20,
  },
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
  headerTextBox: {
    flex: 1,
  },
  headerTitle: {
    color: colors.white,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 44,
  },
  container: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
  },
  searchCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 22,
    ...CARD_SHADOW,
  },
  searchBox: {
    borderRadius: 12,
    backgroundColor: "#f6faf8",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: colors.textDark,
    // @ts-ignore — remove o contorno azul no web
    outlineStyle: "none",
  },
  listHeader: {
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textDark,
    letterSpacing: -0.2,
  },
  countBadge: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCount: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  patientsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  patientCard: {
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...CARD_SHADOW,
  },
  patientHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: BLUE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2d6cdf",
  },
  patientTextBox: {
    flex: 1,
  },
  patientName: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.textDark,
  },
  patientMeta: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textMuted,
  },
  lastAppointmentBox: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "#f6faf8",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  lastAppointmentText: {
    marginLeft: 8,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#36594d",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: "600",
  },
  loadMoreBtn: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  loadMoreText: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
  },
});
