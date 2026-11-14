import React, { useEffect, useState } from "react";
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

// Iniciais a partir do nome: primeira letra do primeiro e do último nome.
export const getInitialsFromName = (name?: string | null, fallback = "?"): string => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

interface AvatarProps {
  // URL da imagem do perfil (foto própria ou logo da clínica). Vazia/nula ou
  // com erro de carregamento → mostra as iniciais.
  uri?: string | null;
  // Iniciais já prontas; se ausentes, são geradas a partir de `name`.
  initials?: string;
  name?: string | null;
  // Estilo do container (tamanho, raio, cor de fundo) — o mesmo que a tela já
  // usava no círculo das iniciais.
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

// Avatar padrão do app: cada perfil é responsável pela própria imagem. Com
// imagem, ela preenche o container; sem imagem, ficam as iniciais.
export default function Avatar({
  uri,
  initials,
  name,
  style,
  textStyle,
  children,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showImage = !!uri && !failed;

  return (
    <View style={[style, styles.clip]}>
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={styles.img}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={textStyle}>{initials || getInitialsFromName(name)}</Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%" },
});
