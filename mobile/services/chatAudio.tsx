/**
 * services/chatAudio.tsx  (implementação NATIVA — iOS/Android via expo-audio)
 *
 * Gravação e reprodução de áudio do chat, estilo WhatsApp. A versão web fica em
 * chatAudio.web.tsx (MediaRecorder/<audio>); o Metro escolhe o arquivo por
 * plataforma. Ambos expõem a MESMA interface pública para o chat.tsx.
 */

import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface RecordedAudio {
  uri: string;
  name: string;
  type: string;
  durationMs: number;
}

export interface ChatAudioRecorder {
  isRecording: boolean;
  durationMs: number;
  start: () => Promise<void>; // lança erro se a permissão for negada
  stop: () => Promise<RecordedAudio | null>;
  cancel: () => Promise<void>;
}

// ─── Helper de formatação de tempo (m:ss) ──────────────────────────────────────
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Gravador (nativo) ─────────────────────────────────────────────────────────
export function useChatAudioRecorder(): ChatAudioRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const startAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Permissão de microfone negada.");
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startAtRef.current = Date.now();
    setDurationMs(0);
    setIsRecording(true);
    clearTimer();
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startAtRef.current);
    }, 200);
  }, [recorder]);

  const finish = useCallback(async (): Promise<string | null> => {
    clearTimer();
    setIsRecording(false);
    try {
      await recorder.stop();
    } catch {
      return null;
    }
    // Libera o modo de gravação para a reprodução sair no alto-falante (iOS).
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    return recorder.uri ?? null;
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    const elapsed = Date.now() - startAtRef.current;
    const uri = await finish();
    if (!uri) return null;
    return {
      uri,
      name: `gravacao-${Date.now()}.m4a`,
      type: "audio/m4a",
      durationMs: elapsed,
    };
  }, [finish]);

  const cancel = useCallback(async () => {
    await finish();
  }, [finish]);

  return { isRecording, durationMs, start, stop, cancel };
}

// ─── Player inline (nativo) ────────────────────────────────────────────────────
export function AudioMessage({
  uri,
  mine,
  durationMs: knownDurationMs,
}: {
  uri: string;
  mine: boolean;
  durationMs?: number;
}) {
  const player = useAudioPlayer(uri ? { uri } : undefined);
  const status = useAudioPlayerStatus(player);

  const playing = status?.playing ?? false;
  // Prefere a duração persistida no backend; usa a do player como fallback.
  const statusDurationMs = (status?.duration ?? 0) * 1000;
  const durationMs =
    knownDurationMs != null && knownDurationMs > 0
      ? knownDurationMs
      : statusDurationMs;
  const positionMs = (status?.currentTime ?? 0) * 1000;
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  const toggle = useCallback(() => {
    if (!uri) return;
    if (playing) {
      player.pause();
      return;
    }
    const ended =
      status?.didJustFinish ||
      (durationMs > 0 && positionMs >= durationMs - 50);
    if (ended) {
      void player.seekTo(0);
    }
    player.play();
  }, [player, playing, status, uri, durationMs, positionMs]);

  const tint = mine ? "#ffffff" : "#2e8b6e";
  const trackBg = mine ? "rgba(255,255,255,0.35)" : "#cfe6dd";
  const label =
    playing || positionMs > 0 ? formatClock(positionMs) : formatClock(durationMs);

  return (
    <View style={styles.audioRow}>
      <TouchableOpacity
        onPress={toggle}
        style={styles.audioBtn}
        disabled={!uri}
        activeOpacity={0.8}
      >
        <Ionicons name={playing ? "pause" : "play"} size={18} color={tint} />
      </TouchableOpacity>
      <View style={styles.audioBody}>
        <View style={[styles.audioTrack, { backgroundColor: trackBg }]}>
          <View
            style={[
              styles.audioFill,
              { width: `${progress * 100}%`, backgroundColor: tint },
            ]}
          />
        </View>
        <Text style={[styles.audioTime, { color: tint }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 180,
  },
  audioBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  audioBody: { flex: 1, gap: 6 },
  audioTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  audioFill: {
    height: 4,
    borderRadius: 2,
  },
  audioTime: {
    fontSize: 11,
    fontWeight: "700",
  },
});
