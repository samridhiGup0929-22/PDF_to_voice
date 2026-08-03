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
 */
export default function useSpeechEngine() {
  const [voices, setVoices] = useState([]);
  const [voiceIndex, setVoiceIndexState] = useState(0);
  const [rate, setRateState] = useState(1);
  const [pitch, setPitchState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const rawVoices = useRef([]);

  // Refs mirror the state above. `speak()` reads from these instead of
  // state so it always sees the LATEST value even when called in the
  // same tick as a setState call — e.g. dragging the rate slider fires
  // setRate(v) then immediately restarts playback; state hasn't
  // committed yet at that point, so speak() was previously using the
  // old rate. Refs update synchronously, so this fixes rate/pitch/
  // volume "not applying" until the next play.
  const voiceIndexRef = useRef(0);
  const rateRef = useRef(1);
  const pitchRef = useRef(1);
  const volumeRef = useRef(1);

  const setVoiceIndex = useCallback((v) => { voiceIndexRef.current = v; setVoiceIndexState(v); }, []);
  const setRate = useCallback((v) => { rateRef.current = v; setRateState(v); }, []);
  const setPitch = useCallback((v) => { pitchRef.current = v; setPitchState(v); }, []);
  const setVolume = useCallback((v) => { volumeRef.current = v; setVolumeState(v); }, []);

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
      if (preferred) setVoiceIndex(preferred.i);
    }
    window.speechSynthesis.onvoiceschanged = load;
    load();
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [setVoiceIndex]);

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
    utter.onerror = (e) => {
      // "canceled" / "interrupted" fire whenever we deliberately call
      // cancel() to restart speech with new rate/pitch/volume — these
      // are NOT real errors, just the old utterance being cut off on
      // purpose. Treating them as errors was flipping isPlaying to
      // false after the very first restart, which then blocked every
      // later slider change from restarting speech at all.
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      onError?.();
    };
    window.speechSynthesis.speak(utter);
  }, []); // refs mean this never needs to be recreated on slider changes

  const pause = useCallback(() => window.speechSynthesis.pause(), []);
  const resume = useCallback(() => window.speechSynthesis.resume(), []);
  const cancel = useCallback(() => window.speechSynthesis.cancel(), []);

  return {
    voices, voiceIndex, setVoiceIndex,
    rate, setRate, pitch, setPitch, volume, setVolume,
    speak, pause, resume, cancel, findVoiceByLangPrefix
  };
}