import { useEffect, useRef, useState, useCallback } from 'react';

function scoreVoice(v) {
  const n = v.name.toLowerCase();
  if (/neural|natural|online/.test(n)) return 3;
  if (/google/.test(n)) return 2;
  if (/enhanced|premium|siri/.test(n)) return 2;
  if (v.localService === false) return 1;
  return 0;
}

/**
 * Wraps the browser's SpeechSynthesis API: voice discovery/scoring,
 * rate/pitch/volume state, and a speak() helper with boundary callbacks.
 *
 * IMPORTANT: rate/pitch/volume/voiceIndex are mirrored into refs. The
 * speak() function reads from those refs (not from React state) so that
 * a slider change followed immediately by a restart (setRate(v) then
 * speak() in the same tick) always uses the NEW value — React state
 * updates are async, so reading `rate` directly inside a memoized
 * callback would still see the previous render's value.
 */
export default function useSpeechEngine() {
  const speakTimerRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [voiceIndex, setVoiceIndexState] = useState(0);
  const [rate, setRateState] = useState(1);
  const [pitch, setPitchState] = useState(1);
  const [volume, setVolumeState] = useState(1);

  const rawVoices = useRef([]);
  const voiceIndexRef = useRef(0);
  const rateRef = useRef(1);
  const pitchRef = useRef(1);
  const volumeRef = useRef(1);

  useEffect(() => {
    function load() {
      const raw = window.speechSynthesis.getVoices();
      if (!raw.length) return;
      rawVoices.current = raw;
      const tagged = raw.map((v, i) => ({ i, name: v.name, lang: v.lang, score: scoreVoice(v) }));
      tagged.sort((a, b) => b.score - a.score);
      setVoices(tagged);
      const enTagged = tagged.filter((t) => t.lang.startsWith('en'));
      const preferred = (enTagged.length ? enTagged : tagged)[0];
      if (preferred) {
        voiceIndexRef.current = preferred.i;
        setVoiceIndexState(preferred.i);
      }
    }
    window.speechSynthesis.onvoiceschanged = load;
    load();
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const setVoiceIndex = useCallback((idx) => {
    voiceIndexRef.current = Number(idx);
    setVoiceIndexState(Number(idx));
  }, []);
  const setRate = useCallback((v) => { rateRef.current = v; setRateState(v); }, []);
  const setPitch = useCallback((v) => { pitchRef.current = v; setPitchState(v); }, []);
  const setVolume = useCallback((v) => { volumeRef.current = v; setVolumeState(v); }, []);

  const findVoiceByLangPrefix = useCallback((prefix) => {
    return rawVoices.current.find((v) => v.lang.toLowerCase().startsWith(prefix));
  }, []);

  const speak = useCallback((text, { charOffset = 0, forceVoice, forceLang, onBoundary, onEnd, onError } = {}) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = forceVoice || rawVoices.current[voiceIndexRef.current];
    if (voice) utter.voice = voice;
    if (forceLang) utter.lang = forceLang;
    utter.rate = rateRef.current;
    utter.pitch = pitchRef.current;
    utter.volume = volumeRef.current;
    utter.onboundary = (e) => {
      if (e.name === 'word' || e.name === undefined) onBoundary?.(charOffset + e.charIndex);
    };
    utter.onend = () => onEnd?.();
    utter.onerror = () => onError?.();
    // Chrome bug workaround: calling speak() immediately after cancel() can
    // silently no-op. A tiny delay makes the new utterance start reliably.
    clearTimeout(speakTimerRef.current);

    speakTimerRef.current = setTimeout(() => {
      window.speechSynthesis.speak(utter);
    }, 50);
  }, []); // stable identity — always reads the latest values via refs

  const pause = useCallback(() => window.speechSynthesis.pause(), []);
  const resume = useCallback(() => window.speechSynthesis.resume(), []);
const cancel = useCallback(() => {
  clearTimeout(speakTimerRef.current);
  window.speechSynthesis.cancel();
}, []);
  return {
    voices, voiceIndex, setVoiceIndex,
    rate, setRate, pitch, setPitch, volume, setVolume,
    speak, pause, resume, cancel, findVoiceByLangPrefix
  };
}