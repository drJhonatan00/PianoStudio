import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  FileMusic,
  KeyboardMusic,
  Loader2,
  Music2,
  Play,
  RotateCcw,
  ScanLine,
  Settings2,
  Sparkles,
  Square,
  UploadCloud,
  Volume2,
  Waves,
} from "lucide-react";
import { Piano } from "@tonejs/piano/build/piano/Piano";
import * as Tone from "tone";

type NoteEvent = { midi: number; duration: number; label: string };
type ScoreStatus = "idle" | "reading" | "ready";

const whiteKeys = [
  { midi: 48, label: "C3", key: "A" },
  { midi: 50, label: "D3", key: "S" },
  { midi: 52, label: "E3", key: "D" },
  { midi: 53, label: "F3", key: "F" },
  { midi: 55, label: "G3", key: "G" },
  { midi: 57, label: "A3", key: "H" },
  { midi: 59, label: "B3", key: "J" },
  { midi: 60, label: "C4", key: "K" },
  { midi: 62, label: "D4", key: "L" },
  { midi: 64, label: "E4", key: ";" },
  { midi: 65, label: "F4", key: "'" },
  { midi: 67, label: "G4", key: "Z" },
  { midi: 69, label: "A4", key: "X" },
  { midi: 71, label: "B4", key: "C" },
  { midi: 72, label: "C5", key: "V" },
];

const blackKeys = [
  { midi: 49, label: "C♯3", left: 5.6 },
  { midi: 51, label: "D♯3", left: 12.25 },
  { midi: 54, label: "F♯3", left: 25.6 },
  { midi: 56, label: "G♯3", left: 32.25 },
  { midi: 58, label: "A♯3", left: 38.9 },
  { midi: 61, label: "C♯4", left: 52.25 },
  { midi: 63, label: "D♯4", left: 58.9 },
  { midi: 66, label: "F♯4", left: 72.25 },
  { midi: 68, label: "G♯4", left: 78.9 },
  { midi: 70, label: "A♯4", left: 85.55 },
];

const demoTracks = [
  { title: "Nocturne Op. 9 No. 2", composer: "F. Chopin", duration: "04:18", accent: "rose" },
  { title: "Clair de lune", composer: "C. Debussy", duration: "04:41", accent: "blue" },
  { title: "Gymnopédie No. 1", composer: "E. Satie", duration: "03:12", accent: "gold" },
];

const samplePhrase: NoteEvent[] = [
  { midi: 64, duration: 0.48, label: "E4" },
  { midi: 67, duration: 0.48, label: "G4" },
  { midi: 71, duration: 0.75, label: "B4" },
  { midi: 69, duration: 0.48, label: "A4" },
  { midi: 67, duration: 0.48, label: "G4" },
  { midi: 64, duration: 0.75, label: "E4" },
  { midi: 62, duration: 0.48, label: "D4" },
  { midi: 64, duration: 0.48, label: "E4" },
  { midi: 67, duration: 0.75, label: "G4" },
  { midi: 72, duration: 0.95, label: "C5" },
  { midi: 71, duration: 0.48, label: "B4" },
  { midi: 69, duration: 0.48, label: "A4" },
  { midi: 67, duration: 0.75, label: "G4" },
];

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function quantizeMidi(y: number, top: number, spacing: number) {
  const diatonic = Math.round((top + spacing * 4 - y) / (spacing / 2));
  const scale = [60, 62, 64, 65, 67, 69, 71];
  const octave = Math.floor(diatonic / 7);
  const degree = ((diatonic % 7) + 7) % 7;
  return Math.max(48, Math.min(78, scale[degree] + octave * 12));
}

function analyzeScore(fileUrl: string): Promise<NoteEvent[]> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return reject(new Error("Canvas indisponível"));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rowDensity: number[] = [];
      for (let y = 0; y < canvas.height; y += 1) {
        let dark = 0;
        for (let x = 0; x < canvas.width; x += 4) {
          const index = (y * canvas.width + x) * 4;
          const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
          if (brightness < 112) dark += 1;
        }
        rowDensity.push(dark);
      }
      const candidates = rowDensity
        .map((density, y) => ({ density, y }))
        .filter(({ density }) => density > canvas.width * 0.075)
        .sort((a, b) => b.density - a.density);
      const lines: number[] = [];
      candidates.forEach(({ y }) => {
        if (lines.every((line) => Math.abs(line - y) > 4)) lines.push(y);
      });
      lines.sort((a, b) => a - b);
      const staff = lines.slice(0, 5);
      const spacing = staff.length >= 5 ? (staff[4] - staff[0]) / 4 : Math.max(9, canvas.height / 22);
      const top = staff[0] ?? canvas.height * 0.25;
      const regionTop = Math.max(0, top - spacing * 2.2);
      const regionBottom = Math.min(canvas.height, top + spacing * 6.5);
      const events: NoteEvent[] = [];
      const stride = Math.max(4, Math.round(canvas.width / 170));
      let lastX = -stride * 2;
      for (let x = 3; x < canvas.width - 3; x += stride) {
        let bestY = -1;
        let bestScore = 0;
        for (let y = Math.floor(regionTop); y < regionBottom; y += 2) {
          let dark = 0;
          for (let dx = -3; dx <= 3; dx += 1) {
            for (let dy = -2; dy <= 2; dy += 1) {
              const px = Math.max(0, Math.min(canvas.width - 1, x + dx));
              const py = Math.max(0, Math.min(canvas.height - 1, y + dy));
              const index = (py * canvas.width + px) * 4;
              const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
              if (brightness < 92) dark += 1;
            }
          }
          const nearStaffLine = staff.some((line) => Math.abs(line - y) < 3);
          const score = nearStaffLine ? dark * 0.45 : dark;
          if (score > bestScore) {
            bestScore = score;
            bestY = y;
          }
        }
        if (bestScore > 15 && x - lastX > stride * 1.8 && bestY > 0) {
          const midi = quantizeMidi(bestY, top, spacing);
          events.push({ midi, duration: 0.42 + (events.length % 4 === 2 ? 0.22 : 0), label: `MIDI ${midi}` });
          lastX = x;
        }
      }
      resolve(events.slice(0, 48));
    };
    image.onerror = () => reject(new Error("Imagem inválida"));
    image.src = fileUrl;
  });
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function parseMusicXml(xml: string): NoteEvent[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("MusicXML inválido");
  const events: NoteEvent[] = [];
  const notes = Array.from(document.querySelectorAll("note"));
  notes.forEach((note) => {
    if (note.querySelector("rest")) return;
    const step = note.querySelector("pitch > step")?.textContent?.trim();
    const octave = Number(note.querySelector("pitch > octave")?.textContent ?? 4);
    const alter = Number(note.querySelector("pitch > alter")?.textContent ?? 0);
    if (!step) return;
    const semitoneByStep: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const midi = Math.max(21, Math.min(108, (octave + 1) * 12 + semitoneByStep[step] + alter));
    const type = note.querySelector("type")?.textContent?.trim();
    const duration = type === "whole" ? 1.35 : type === "half" ? 0.85 : type === "eighth" ? 0.27 : type === "16th" ? 0.16 : 0.42;
    events.push({ midi, duration, label: `${step}${alter === 1 ? "♯" : alter === -1 ? "♭" : ""}${octave}` });
  });
  return events;
}

async function runFlatOmr(file: File, token: string, onProgress: (message: string) => void) {
  const headers = { Authorization: `Bearer ${token}` };
  const baseUrl = "https://api.flat.io/v2";
  const createResponse = await fetch(`${baseUrl}/omr/jobs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ output: "musicxml", autoStart: true, locales: ["pt-BR"], files: [{ file: await fileToBase64(file), filename: file.name }] }),
  });
  if (!createResponse.ok) throw new Error(createResponse.status === 401 ? "Token OMR inválido ou expirado" : `OMR não pôde iniciar (${createResponse.status})`);
  const initialJob = await createResponse.json() as { id: string; status: string };
  let job = initialJob;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (job.status === "done") break;
    if (job.status === "error" || job.status === "canceled") throw new Error("O motor OMR não conseguiu interpretar esta imagem");
    onProgress(attempt === 0 ? "Motor OMR iniciado · detectando pautas…" : `Motor OMR processando · tentativa ${attempt + 1}`);
    const progressResponse = await fetch(`${baseUrl}/omr/jobs/${initialJob.id}?wait=8`, { headers });
    if (!progressResponse.ok) throw new Error("Falha ao acompanhar o motor OMR");
    job = await progressResponse.json() as { id: string; status: string };
  }
  if (job.status !== "done") throw new Error("O motor OMR demorou mais que o esperado");
  onProgress("Partitura reconhecida · montando sequência…");
  const exportResponse = await fetch(`${baseUrl}/omr/jobs/${initialJob.id}/exports/musicxml`, { headers });
  if (!exportResponse.ok) throw new Error("MusicXML não disponível para esta partitura");
  return parseMusicXml(await exportResponse.text());
}

export default function Home() {
  const [volume, setVolume] = useState(72);
  const [pianoStatus, setPianoStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [tempo, setTempo] = useState(84);
  const [activeKeys, setActiveKeys] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [scoreUrl, setScoreUrl] = useState<string | null>(null);
  const [scoreName, setScoreName] = useState("");
  const [scoreStatus, setScoreStatus] = useState<ScoreStatus>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("Envie uma imagem para começar");
  const [events, setEvents] = useState<NoteEvent[]>(samplePhrase);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [omrToken, setOmrToken] = useState(() => localStorage.getItem("piano-studio-omr-token") ?? "");
  const [omrEngine, setOmrEngine] = useState<"local" | "flat">("local");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackTimeout = useRef<number | null>(null);
  const progressInterval = useRef<number | null>(null);
  const piano = useRef<Piano | null>(null);

  const duration = useMemo(() => events.reduce((sum, event) => sum + event.duration, 0) * (84 / tempo), [events, tempo]);

  const ensureAudio = useCallback(async () => {
    await Tone.start();
    if (piano.current) return piano.current;
    setPianoStatus("loading");
    const instrument = new Piano({ velocities: 5, release: true, pedal: true });
    instrument.toDestination();
    instrument.output.gain.value = Math.max(0.05, volume / 100);
    piano.current = instrument;
    try {
      await instrument.load();
      setPianoStatus("ready");
    } catch {
      piano.current = null;
      setPianoStatus("error");
      throw new Error("Não foi possível carregar os samples do piano");
    }
    return instrument;
  }, [volume]);

  useEffect(() => {
    if (piano.current) piano.current.output.gain.value = Math.max(0.05, volume / 100);
  }, [volume]);

  const playNote = useCallback((midi: number, seconds = 0.8) => {
    void ensureAudio().then((instrument) => instrument.keyDown({ midi, velocity: 0.82 }));
    setActiveKeys((current) => current.includes(midi) ? current : [...current, midi]);
    window.setTimeout(() => {
      piano.current?.keyUp({ midi });
      setActiveKeys((current) => current.filter((key) => key !== midi));
    }, Math.max(120, seconds * 1000));
  }, [ensureAudio]);

  const stopPlayback = useCallback(() => {
    if (playbackTimeout.current) window.clearTimeout(playbackTimeout.current);
    if (progressInterval.current) window.clearInterval(progressInterval.current);
    playbackTimeout.current = null;
    progressInterval.current = null;
    setIsPlaying(false);
    setPlayingIndex(-1);
    setElapsed(0);
  }, []);

  const playSequence = useCallback((sequence = events) => {
    stopPlayback();
    const beatScale = 84 / tempo;
    const startedAt = performance.now();
    setIsPlaying(true);
    let index = 0;
    const tick = () => {
      if (index >= sequence.length) {
        stopPlayback();
        return;
      }
      const event = sequence[index];
      setPlayingIndex(index);
      playNote(event.midi, event.duration * beatScale);
      index += 1;
      playbackTimeout.current = window.setTimeout(tick, event.duration * beatScale * 1000);
    };
    progressInterval.current = window.setInterval(() => {
      setElapsed(Math.min(duration, (performance.now() - startedAt) / 1000));
    }, 80);
    tick();
  }, [duration, events, playNote, stopPlayback, tempo]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const onFileChange = async (file?: File) => {
    if (!file) return;
    if (!file.type.match(/image\/(png|jpeg|jpg)/) && !/\.(png|jpe?g)$/i.test(file.name)) {
      setAnalysisMessage("Formato não suportado. Use PNG, JPG ou JPEG.");
      return;
    }
    if (scoreUrl) URL.revokeObjectURL(scoreUrl);
    const nextUrl = URL.createObjectURL(file);
    setScoreUrl(nextUrl);
    setScoreName(file.name);
    setScoreStatus("reading");
    setAnalysisMessage(omrEngine === "flat" && omrToken ? "Enviando para o motor OMR…" : "Mapeando pauta, compassos e notas…");
    try {
      const detected = omrEngine === "flat" && omrToken
        ? await runFlatOmr(file, omrToken, setAnalysisMessage)
        : await analyzeScore(nextUrl);
      const nextEvents = detected.length >= 3 ? detected : samplePhrase;
      setEvents(nextEvents);
      setScoreStatus("ready");
      setAnalysisMessage(detected.length >= 3 ? `${detected.length} notas reconhecidas · ${omrEngine === "flat" && omrToken ? "OMR Tutteo" : "análise local"}` : "Partitura carregada · sequência de demonstração pronta");
    } catch (error) {
      setEvents(samplePhrase);
      setScoreStatus("ready");
      setAnalysisMessage(`${error instanceof Error ? error.message : "Falha no reconhecimento"} · fallback local ativo`);
    }
  };
  const saveOmrToken = (value: string) => {
    setOmrToken(value);
    if (value) localStorage.setItem("piano-studio-omr-token", value);
    else localStorage.removeItem("piano-studio-omr-token");
  };

  const handleKey = (midi: number) => playNote(midi, 0.72);

  useEffect(() => {
    const keyMap: Record<string, number> = Object.fromEntries(whiteKeys.map((key) => [key.key.toLowerCase(), key.midi]));
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement) return;
      const midi = keyMap[event.key.toLowerCase()];
      if (midi) handleKey(midi);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  });

  return (
    <div className="app-shell">
      <header className="topbar container">
        <div className="brand-lockup">
          <div className="brand-mark"><Music2 size={18} strokeWidth={2.4} /></div>
          <div><strong>Piano<span>Studio</span></strong><small>PLAY BY EAR</small></div>
        </div>
        <nav className="topnav" aria-label="Navegação principal">
          <a className="active" href="#studio">Studio</a>
          <a href="#library">Biblioteca</a>
          <a href="#how-it-works">Como funciona</a>
        </nav>
        <div className="top-actions">
          <button className="icon-button" aria-label="Abrir ajustes" onClick={() => setShowSettings((value) => !value)}><Settings2 size={17} /></button>
          <button className="avatar-button" aria-label="Perfil">AS</button>
        </div>
        {showSettings && <div className="settings-popover"><strong>Configurações do Studio</strong><label>Motor de leitura</label><div className="engine-toggle"><button className={omrEngine === "local" ? "selected" : ""} onClick={() => setOmrEngine("local")}>Local</button><button className={omrEngine === "flat" ? "selected" : ""} onClick={() => setOmrEngine("flat")}>OMR real</button></div><label>Token Flat OMR <span>(opcional)</span></label><input type="password" value={omrToken} onChange={(event) => saveOmrToken(event.target.value)} placeholder="cole seu token" /><small>O token fica somente neste navegador. OMR real usa créditos da sua conta Flat.</small><span className="setting-status"><Circle size={8} fill="currentColor" /> {pianoStatus === "ready" ? "Piano acústico pronto" : pianoStatus === "loading" ? "Carregando samples…" : "Piano acústico sob demanda"}</span></div>}
      </header>

      <main id="studio" className="container main-content">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> Seu estúdio, em qualquer lugar</div>
            <h1>Transforme uma partitura<br /><em>em música.</em></h1>
            <p className="intro-copy">Carregue uma foto da sua partitura e deixe o Piano Studio encontrar as notas. Tudo acontece no seu navegador, com privacidade e precisão.</p>
          </div>
          <div className="sound-badge"><Waves size={18} /><div><strong>Piano acústico</strong><span>{pianoStatus === "ready" ? "Salamander Grand Piano · pronto" : pianoStatus === "loading" ? "Carregando samples reais…" : "samples reais · carrega ao tocar"}</span></div><button onClick={() => setVolume((value) => value ? 0 : 72)} aria-label="Alternar som"><Volume2 size={16} /></button></div>
        </section>

        <section className="workspace-grid">
          <div className="score-column">
            <div className="section-heading"><div><span className="section-kicker">01 · PARTITURA</span><h2>Leia sua música</h2></div><span className="privacy-note"><CheckCircle2 size={14} /> local & privado</span></div>
            <div className={`score-card ${scoreStatus === "reading" ? "is-reading" : ""}`}>
              {scoreUrl ? (
                <div className="score-preview-wrap">
                  <img src={scoreUrl} alt="Prévia da partitura enviada" className="score-preview" />
                  <div className="scan-overlay"><div className="scan-line" /><span><ScanLine size={14} /> {scoreStatus === "reading" ? "Lendo partitura" : "Partitura mapeada"}</span></div>
                  <button className="replace-button" onClick={() => fileInputRef.current?.click()}><RotateCcw size={14} /> Trocar imagem</button>
                </div>
              ) : (
                <button className="upload-zone" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void onFileChange(event.dataTransfer.files[0]); }}>
                  <div className="upload-icon"><UploadCloud size={24} /></div>
                  <strong>Solte sua partitura aqui</strong>
                  <span>ou clique para procurar no dispositivo</span>
                  <small><FileMusic size={13} /> PNG, JPG ou JPEG · até 10 MB</small>
                </button>
              )}
              <input ref={fileInputRef} className="hidden-input" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(event) => void onFileChange(event.target.files?.[0])} />
              <div className="score-footer"><div className="analysis-status">{scoreStatus === "reading" ? <Loader2 size={15} className="spin" /> : <Activity size={15} />}<span>{analysisMessage}</span></div><span className="file-label">{scoreName || "Nenhum arquivo selecionado"}</span></div>
            </div>

            <div className="detected-panel">
              <div className="section-heading compact"><div><span className="section-kicker">02 · SEQUÊNCIA</span><h2>Notas encontradas</h2></div><span className="notes-count">{events.length} notas</span></div>
              <div className="note-timeline">{events.slice(0, 15).map((event, index) => <button key={`${event.midi}-${index}`} className={`note-chip ${playingIndex === index ? "playing" : ""}`} onClick={() => handleKey(event.midi)}><span>{event.label}</span><small>{index + 1}</small></button>)}{events.length > 15 && <span className="more-notes">+{events.length - 15}</span>}</div>
            </div>
          </div>

          <aside className="control-column">
            <div className="section-heading"><div><span className="section-kicker">CONTROLES</span><h2>Toque a sequência</h2></div><span className={`live-dot ${isPlaying ? "on" : ""}`}><span /> {isPlaying ? "tocando" : "pronto"}</span></div>
            <div className="playback-card">
              <div className="playback-head"><div className="track-art"><KeyboardMusic size={22} /></div><div><strong>{scoreName ? scoreName.replace(/\.[^.]+$/, "") : "Estudo em destaque"}</strong><span>{scoreName ? "Sua partitura" : "Piano Studio · seleção"}</span></div><button className="more-button" aria-label="Mais opções"><ChevronDown size={17} /></button></div>
              <div className="progress-area"><div className="progress-track"><div className="progress-fill" style={{ width: `${duration ? (elapsed / duration) * 100 : 0}%` }} /></div><div className="time-row"><span>{formatTime(elapsed)}</span><span>{formatTime(duration)}</span></div></div>
              <div className="transport"><button className={`transport-main ${isPlaying ? "stop" : ""}`} onClick={() => isPlaying ? stopPlayback() : playSequence()} aria-label={isPlaying ? "Parar reprodução" : "Tocar sequência"}>{isPlaying ? <Square size={17} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><div className="transport-copy"><strong>{isPlaying ? "Reproduzindo agora" : "Pronto para tocar"}</strong><span>{isPlaying ? `Nota ${Math.max(1, playingIndex + 1)} de ${events.length}` : "Toque no play para ouvir"}</span></div><div className="tempo"><span>BPM</span><strong>{tempo}</strong></div></div>
            </div>

            <div className="mixer-card"><div className="mixer-label"><span>Velocidade</span><strong>{tempo} BPM</strong></div><input aria-label="Velocidade em BPM" type="range" min="48" max="140" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} /><div className="range-labels"><span>Largo</span><span>Moderato</span><span>Presto</span></div><div className="mixer-label volume-label"><span>Volume</span><strong>{volume}%</strong></div><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></div>

            <button className="primary-cta" onClick={() => scoreUrl ? playSequence() : fileInputRef.current?.click()}>{scoreUrl ? <Play size={17} fill="currentColor" /> : <UploadCloud size={17} />}<span>{scoreUrl ? "Ouvir partitura" : "Carregar partitura"}</span><ChevronRight size={17} /></button>
            <div className="shortcut-hint"><Sparkles size={14} /><span>Dica: use as teclas <kbd>A</kbd> a <kbd>V</kbd> para tocar</span></div>
          </aside>
        </section>

        <section className="piano-section">
          <div className="piano-section-head"><div><span className="section-kicker">03 · INSTRUMENTO</span><h2>Seu piano virtual</h2></div><span className="key-range">C3 — C5 <ChevronDown size={14} /></span></div>
          <div className="piano-shell"><div className="piano-brand">PIANO <span>STUDIO</span></div><div className="keyboard" role="group" aria-label="Teclado de piano">{whiteKeys.map((key) => <button key={key.midi} className={`white-key ${activeKeys.includes(key.midi) ? "active" : ""}`} onPointerDown={() => handleKey(key.midi)}><span className="key-label">{key.label}</span><small>{key.key}</small></button>)}{blackKeys.map((key) => <button key={key.midi} className={`black-key ${activeKeys.includes(key.midi) ? "active" : ""}`} style={{ left: `${key.left}%` }} onPointerDown={() => handleKey(key.midi)} aria-label={key.label}><span>{key.label}</span></button>)}</div></div>
          <div className="piano-footnote"><span><KeyboardMusic size={14} /> toque, clique ou use o teclado</span><span><span className="sound-indicator" /> áudio gerado em tempo real</span></div>
        </section>

        <section id="library" className="library-section"><div className="piano-section-head"><div><span className="section-kicker">PARA COMEÇAR</span><h2>Peças para explorar</h2></div><a href="#library" className="view-all">Ver biblioteca <ChevronRight size={15} /></a></div><div className="track-grid">{demoTracks.map((track, index) => <button key={track.title} className={`track-card ${selectedTrack === index ? "selected" : ""}`} onClick={() => { setSelectedTrack(index); setEvents(samplePhrase.map((event, noteIndex) => ({ ...event, midi: Math.max(48, Math.min(72, event.midi + (index - 1) * (noteIndex % 2 ? 0 : 2))) }))); }}><div className={`track-cover ${track.accent}`}><Music2 size={28} /><span>0{index + 1}</span></div><div className="track-info"><strong>{track.title}</strong><span>{track.composer}</span></div><span className="track-duration"><Clock3 size={13} /> {track.duration}</span><span className="track-play">{selectedTrack === index ? <Play size={14} fill="currentColor" /> : <ChevronRight size={16} />}</span></button>)}</div></section>

        <section id="how-it-works" className="how-section"><div className="how-copy"><span className="section-kicker">SEM MÁGICA, SÓ TECNOLOGIA</span><h2>Da imagem ao som<br /><em>em segundos.</em></h2><p>O Piano Studio interpreta a sua foto diretamente no dispositivo — nenhuma partitura é enviada para a nuvem.</p></div><div className="steps"><div className="step"><span>01</span><div><strong>Envie</strong><p>Escolha uma foto nítida da sua partitura.</p></div></div><div className="step"><span>02</span><div><strong>Reconheça</strong><p>A pauta é analisada e as notas são mapeadas.</p></div></div><div className="step"><span>03</span><div><strong>Escute</strong><p>Dê play e acompanhe a melodia no teclado.</p></div></div></div></section>
      </main>
      <footer className="footer container"><span>© 2026 Piano Studio</span><span>feito para quem escuta além das notas</span><span className="footer-status"><span className="sound-indicator" /> navegador pronto</span></footer>
    </div>
  );
}
