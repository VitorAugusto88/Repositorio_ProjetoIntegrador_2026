// ─── Sistema de feedback na tela (toast + diálogo) ──────────────────────────
//
// Motivo: o `Alert.alert` do React Native é um *no-op* no react-native-web
// (alvo principal deste app). Por isso as mensagens de sucesso/erro que o
// backend retornava só apareciam no console e o usuário nunca via nada.
//
// Este módulo expõe uma API imperativa que funciona igual no web, iOS e
// Android. `showAlert` tem a MESMA assinatura do `Alert.alert`, então é um
// substituto direto:
//   - mensagem simples (0 ou 1 botão) → vira um TOAST que some sozinho.
//   - vários botões (Cancelar/Confirmar, escolhas) → vira um DIÁLOGO modal.
//
// O componente visual que escuta estes eventos é o `<FeedbackHost />`,
// montado uma única vez em `app/_layout.tsx`.

export type ToastType = "success" | "error" | "info";
export type ButtonStyle = "default" | "cancel" | "destructive";

// Espelha o AlertButton do React Native para manter a assinatura compatível.
export interface FeedbackButton {
  text?: string;
  onPress?: () => void;
  style?: ButtonStyle;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface DialogButton {
  text: string;
  style: ButtonStyle;
  onPress?: () => void;
}

export interface DialogItem {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
}

interface FeedbackListener {
  onToast: (item: ToastItem) => void;
  onDialog: (item: DialogItem) => void;
}

let listener: FeedbackListener | null = null;
let counter = 0;

// Chamado pelo <FeedbackHost /> ao montar/desmontar.
export function registerFeedbackListener(l: FeedbackListener | null): void {
  listener = l;
}

// Infere o tom (cor/ícone) do toast a partir do título usado no código legado
// ("Erro", "Sucesso", etc.). Mantém a troca das chamadas antigas trivial.
function typeFromTitle(title?: string): ToastType {
  const t = (title ?? "").toLowerCase();
  if (
    t.includes("erro") ||
    t.includes("falha") ||
    t.includes("inválid") ||
    t.includes("invalid") ||
    t.includes("obrigat")
  ) {
    return "error";
  }
  if (
    t.includes("sucesso") ||
    t.includes("agendad") ||
    t.includes("enviad") ||
    t.includes("atualizad") ||
    t.includes("salvo") ||
    t.includes("🎉")
  ) {
    return "success";
  }
  return "info";
}

// Junta título + mensagem numa linha só para o toast.
function joinTitleAndMessage(title?: string, message?: string): string {
  const parts = [title?.trim(), message?.trim()].filter(Boolean) as string[];
  return parts.join(" — ");
}

// Mostra um toast diretamente (sem passar por título/botões).
export function showToast(message: string, type: ToastType = "info"): void {
  listener?.onToast({ id: ++counter, type, message });
}

// Mostra um diálogo modal com N botões e callbacks.
export function showDialog(
  title: string,
  message: string | undefined,
  buttons: DialogButton[],
): void {
  listener?.onDialog({ id: ++counter, title, message, buttons });
}

// Conveniência: confirmação com dois botões (cancelar / confirmar).
export function showConfirm(options: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}): void {
  showDialog(options.title, options.message, [
    { text: options.cancelText ?? "Cancelar", style: "cancel", onPress: options.onCancel },
    {
      text: options.confirmText ?? "Confirmar",
      style: options.destructive ? "destructive" : "default",
      onPress: options.onConfirm,
    },
  ]);
}

// Substituto direto de `Alert.alert(title, message?, buttons?)`.
export function showAlert(
  title: string,
  message?: string,
  buttons?: FeedbackButton[],
): void {
  const list = buttons ?? [];

  // 0 ou 1 botão → é só um aviso. Vira toast e dispara o callback (ex: um
  // "OK" que navega de volta) assim que a mensagem aparece.
  if (list.length <= 1) {
    showToast(joinTitleAndMessage(title, message), typeFromTitle(title));
    list[0]?.onPress?.();
    return;
  }

  // 2+ botões → decisão do usuário. Vira diálogo modal preservando todos os
  // botões, textos, estilos e callbacks originais.
  showDialog(
    title,
    message,
    list.map((b, i) => ({
      text: b.text ?? (i === 0 ? "OK" : "Opção"),
      style: b.style ?? "default",
      onPress: b.onPress,
    })),
  );
}
