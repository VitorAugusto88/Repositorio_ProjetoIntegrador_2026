/**
 * services/chatAudio.web.tsx  (implementação WEB — MediaRecorder + HTMLAudioElement)
 *
 * Espelha a interface pública de chatAudio.tsx (nativo). Grava com a API
 * MediaRecorder do navegador (produz audio/webm ou audio/ogg — ambos aceitos
 * pelo backend) e reproduz com um HTMLAudioElement.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

// ─── Gravador (web) ────────────────────────────────────────────────────────────
export function useChatAudioRecorder(): ChatAudioRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((a: RecordedAudio | null) => void) | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw new Error("Gravação de áudio não é suportada neste navegador.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/ogg";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const ext = mime.includes("ogg") ? "ogg" : "webm";
      const elapsed = Date.now() - startAtRef.current;
      const resolve = resolveRef.current;
      resolveRef.current = null;
      stopStream();
      if (!resolve) return;
      if (blob.size === 0) {
        resolve(null);
        return;
      }
      resolve({
        uri: URL.createObjectURL(blob),
        name: `gravacao-${Date.now()}.${ext}`,
        type: mime,
        durationMs: elapsed,
      });
    };

    recorderRef.current = mr;
    mr.start();
    startAtRef.current = Date.now();
    setDurationMs(0);
    setIsRecording(true);
    clearTimer();
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startAtRef.current);
    }, 200);
  }, []);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    clearTimer();
    setIsRecording(false);
    const mr = recorderRef.current;
    recorderRef.current = null;
    if (!mr || mr.state === "inactive") {
      stopStream();
      return Promise.resolve(null);
    }
    return new Promise<RecordedAudio | null>((resolve) => {
      resolveRef.current = resolve;
      mr.stop();
    });
  }, []);

  const cancel = useCallback(async () => {
    clearTimer();
    setIsRecording(false);
    resolveRef.current = null;
    const mr = recorderRef.current;
    recorderRef.current = null;
    if (mr && mr.state !== "inactive") {
      mr.onstop = () => stopStream();
      mr.stop();
    } else {
      stopStream();
    }
  }, []);

  // Limpeza ao desmontar (evita microfone preso ligado).
  useEffect(
    () => () => {
      clearTimer();
      const mr = recorderRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = null;
        try {
          mr.stop();
        } catch {
          // ignora
        }
      }
      stopStream();
    },
    [],
  );

  return { isRecording, durationMs, start, stop, cancel };
}

// ─── Player inline (web) ───────────────────────────────────────────────────────
// durationMs (opcional): duração real persistida no backend, medida na gravação.
// Quando presente, é a fonte de verdade — evita o `audio.duration` do webm de
// MediaRecorder, que o navegador reporta como Infinity/valor-lixo (causava, ex.,
// um áudio de 5s aparecer como 40 min).
export function AudioMessage({
  uri,
  mine,
  durationMs: knownDurationMs,
}: {
  uri: string;
  mine: boolean;
  durationMs?: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [detectedDurationMs, setDetectedDurationMs] = useState(0);

  const hasKnownDuration = knownDurationMs != null && knownDurationMs > 0;

  useEffect(() => {
    if (!uri || typeof Audio === "undefined") return undefined;
    const audio = new Audio(uri);
    audioRef.current = audio;

    // Só detecta a duração pelo navegador quando ela NÃO veio do backend.
    // O Chrome reporta duration=Infinity para webm de MediaRecorder até um seek
    // forçado; esse "hack" às vezes devolve um valor-lixo enorme, então só o
    // usamos como último recurso (mensagens antigas, sem duração persistida).
    let fixingDuration = false;

    const onTime = () => {
      if (fixingDuration) return;
      setPositionMs(audio.currentTime * 1000);
    };
    const onLoaded = () => {
      if (hasKnownDuration) return;
      if (Number.isFinite(audio.duration)) {
        setDetectedDurationMs(audio.duration * 1000);
        return;
      }
      if (fixingDuration) return;
      fixingDuration = true;
      const resolveDuration = () => {
        if (!Number.isFinite(audio.duration)) return;
        audio.removeEventListener("timeupdate", resolveDuration);
        setDetectedDurationMs(audio.duration * 1000);
        audio.currentTime = 0;
        fixingDuration = false;
      };
      audio.addEventListener("timeupdate", resolveDuration);
      audio.currentTime = 1e101; // dispara o cálculo real da duração
    };
    const onEnded = () => {
      setPlaying(false);
      setPositionMs(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    if (!hasKnownDuration) {
      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("durationchange", onLoaded);
    }
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, [uri, hasKnownDuration]);

  const durationMs = hasKnownDuration ? knownDurationMs! : detectedDurationMs;

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
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
