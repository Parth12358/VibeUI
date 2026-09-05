import { useCallback, useRef, useState } from "react";
import type { Choreography, MotionMode } from "@vibe/core";
import { VibeProvider, Post, Palette, World, Card, Button, Text, useVibe } from "@vibe/react";
import { quickChoreography } from "./quickChoreography";
import { Visualizer } from "./Visualizer";
import synthDemo from "./fixtures/synth_demo.json";
import clarity from "./fixtures/clarity.json";

interface Track {
  title: string;
  trackUrl: string;
  choreography: Choreography;
}

const bundledTracks: Track[] = [
  { title: "Zedd — Clarity", trackUrl: "/tracks/clarity.mp3", choreography: clarity as Choreography },
  { title: "Synthetic Demo", trackUrl: "/tracks/synth_demo.wav", choreography: synthDemo as Choreography },
];

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL as string | undefined;

const SPONSORS = ["RevenueCat", "Nebius", "Linkup", "Convex", "Render", "Token Economy", "Founder Haus", "WEB3DEV"];

const CHALLENGES = [
  { sponsor: "LinkUp", title: "Research" },
  { sponsor: "Convex", title: "Realtime" },
  { sponsor: "Nebius", title: "Domain AI" },
  { sponsor: "Open Challenge", title: "Open Build" },
];

const SCHEDULE = [
  { date: "SEP 5", title: "Kickoff", body: "Meet the community, discover the challenges, and start your project.", meta: "SF + Online" },
  { date: "SEP 5–11", title: "Build & Get Feedback", body: "Build, publish, and improve your product with real users through the app.", meta: "Worldwide" },
  { date: "SEP 12 · 11:59 PM", title: "Submit", body: "Submit your finished project through the Burning Token app.", meta: "San Francisco time · PDT" },
];

const FAQS = [
  { q: "How do I participate?", a: "Create your account in the Burning Token app, choose a challenge, and create your project. The app will guide you through the building and submission process." },
  { q: "Can I participate online?", a: "Yes. Burning Token is open worldwide. You can complete the full seven-day hackathon online or join the in-person kickoff in San Francisco." },
  { q: "How does the San Francisco event work?", a: "The in-person event takes place on the second floor of Frontier Tower and has space for 150 participants. Entry is first come, first served." },
  { q: "Do I need a team?", a: "No. You can build solo or in a team of up to three people. Participants form their own teams." },
  { q: "What do I need to submit?", a: "Build a working product that solves a real problem for a specific user. Judges must be able to access and evaluate it." },
  { q: "How does judging work?", a: "Eligible projects are reviewed by a panel of industry experts on Problem, Product, Execution, Validation, Experience, and Demo." },
];

export function App() {
  const [track, setTrack] = useState<Track>(bundledTracks[0]);
  const [autoPlay, setAutoPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDropped = useCallback(async (file: File) => {
    setBusy(true);
    setNotice(null);
    const url = URL.createObjectURL(file);
    try {
      let choreography: Choreography;
      if (ENGINE_URL) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${ENGINE_URL}/choreograph`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`engine ${res.status}`);
        choreography = (await res.json()) as Choreography;
      } else {
        const ctx = new AudioContext();
        const arr = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arr);
        choreography = await quickChoreography(buffer, file.name.replace(/\.[^.]+$/, ""));
        void ctx.close();
      }
      setTrack({ title: file.name.replace(/\.[^.]+$/, ""), trackUrl: url, choreography });
      setAutoPlay(true);
    } catch (e) {
      console.error(e);
      setNotice("couldn't choreograph that file — try an mp3/wav");
    } finally {
      setBusy(false);
    }
  }, []);

  const selectBundled = useCallback((i: number) => {
    const t = bundledTracks[i];
    if (t) {
      setTrack(t);
      setAutoPlay(true);
    }
  }, []);

  return (
    <VibeProvider key={track.trackUrl} choreography={track.choreography} track={track.trackUrl} autoPlay={autoPlay}>
      <Controls
        currentTitle={track.title}
        busy={busy}
        notice={notice}
        onSelect={selectBundled}
        onUpload={(f) => loadDropped(f)}
        fileInput={fileInput}
      />
      <Visualizer />
      <Post>
        <Palette>
          <div className="page">
            <ExtensionSection />
            <Hero />
            <Marquee />
            <Participate />
            <Challenges />
            <Schedule />
            <Faq />
            <Footer />
          </div>
        </Palette>
      </Post>
    </VibeProvider>
  );
}

function Hero() {
  return (
    <section className="hero-section">
      <div className="eyebrow">A Nerdconf Event</div>
      <div className="hero-wordmark" style={{ fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "clamp(1.1rem, 2vw, 1.8rem)", color: "var(--ink)", marginTop: 18 }}>
        Burning Token
      </div>
      <div className="hero-date">5 to 12 Sept</div>
      <h1 className="hero-title">
        <Text sensitivity={0.35}>Ship your app in 7 days</Text>
      </h1>
      <div className="hero-highlights">
        <span>Free</span>
        <span>Teams of 1–3</span>
        <span>San Francisco + Online</span>
      </div>
      <div className="hero-ctas">
        <Button sensitivity={0.9} className="btn">
          Start now ↗
        </Button>
        <Button sensitivity={0.5} className="btn ghost">
          View challenges ↓
        </Button>
      </div>
      <div className="hero-note">Drop a song. Watch this page trip. ↓</div>
    </section>
  );
}

function Marquee() {
  const doubled = [...SPONSORS, ...SPONSORS];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-inner">
        <span className="marquee-label">With support from</span>
        <div className="marquee-track">
          {doubled.map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExtensionSection() {
  return (
    <section className="section extension">
      <div className="section-head">
        <div className="eyebrow">Take it everywhere</div>
        <h2 className="section-title">Rave any website</h2>
        <p className="section-body">
          This page is tripping to the music. Load the extension and <strong>every</strong> site you
          visit turns into a light show — colors churn, buttons bounce to the beat, and a live
          visualizer runs over Twitter, docs, anything.
        </p>
      </div>
      <div className="extension-steps">
        <div className="extension-step">
          <div className="step-num">1</div>
          <div>
            <div className="step-title">Download the extension</div>
            <div className="step-body">Grab the zip and unzip it anywhere.</div>
          </div>
        </div>
        <div className="extension-step">
          <div className="step-num">2</div>
          <div>
            <div className="step-title">Open chrome://extensions</div>
            <div className="step-body">Toggle on Developer mode.</div>
          </div>
        </div>
        <div className="extension-step">
          <div className="step-num">3</div>
          <div>
            <div className="step-title">Load unpacked → pick the folder</div>
            <div className="step-body">Click the icon, hit Start trip, and feel it.</div>
          </div>
        </div>
      </div>
      <div className="extension-cta">
        <a className="btn" href="/vibe-trip-extension.zip" download>
          Download the extension (.zip) ↓
        </a>
      </div>
    </section>
  );
}

function Participate() {
  return (
    <section className="section participate">
      <div className="section-head">
        <div className="eyebrow">Hey, builder.</div>
        <h2 className="section-title">How to participate</h2>
        <p className="section-body">Create your project, share it with the community, and get feedback from real users before launch.</p>
      </div>
      <div className="participate-grid">
        <div className="participate-fact">Free</div>
        <div className="participate-fact">Teams of 1–3</div>
        <div className="participate-fact">SF + Online</div>
      </div>
    </section>
  );
}

function Challenges() {
  return (
    <section className="section challenges">
      <div className="section-head">
        <div className="eyebrow">Choose your lane</div>
        <h2 className="section-title">Choose a challenge</h2>
      </div>
      <World gap="20px" className="challenge-grid">
        {CHALLENGES.map((c, i) => (
          <Card key={c.title} vibeName={`c${i + 1}`} baseRadius={0} className="challenge-card">
            <span className="sponsor">{c.sponsor}</span>
            <h3>{c.title}</h3>
            <div className="challenge-meta">
              <div className="row">
                <span>Brief</span>
                <span className="classified">Classified</span>
              </div>
              <div className="row">
                <span>Winning team</span>
                <span className="prize">$500</span>
              </div>
            </div>
            <Button sensitivity={0.7} className="btn">
              Join this challenge ↗
            </Button>
          </Card>
        ))}
      </World>
    </section>
  );
}

function Schedule() {
  return (
    <section className="section schedule">
      <div className="section-head">
        <div className="eyebrow">Mark the dates</div>
        <h2 className="section-title">Schedule</h2>
      </div>
      <div className="schedule-grid">
        {SCHEDULE.map((s) => (
          <div className="schedule-item" key={s.title}>
            <div className="date">{s.date}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className="meta">{s.meta}</div>
          </div>
        ))}
      </div>
      <div className="schedule-cta">
        <Button sensitivity={0.6} className="btn pink">
          Reserve SF spot ↗
        </Button>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="section faq">
      <div className="section-head">
        <div className="eyebrow">Good questions</div>
        <h2 className="section-title">F.A.Q.</h2>
      </div>
      <div className="faq-list">
        {FAQS.map((f, i) => (
          <div className="faq-item" key={f.q}>
            <button className="faq-q" data-open={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{f.q}</span>
              <span className="faq-toggle">+</span>
            </button>
            <div className="faq-a" data-open={open === i}>
              <div>
                <p>{f.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="tag">Presented by</div>
      <div className="display" style={{ fontSize: "clamp(1.4rem, 3vw, 2.4rem)", margin: "8px 0" }}>
        Nerdconf
      </div>
      <a href="mailto:hey@nerdconf.com">hey@nerdconf.com</a>
    </footer>
  );
}

function Controls({
  currentTitle,
  busy,
  notice,
  onSelect,
  onUpload,
  fileInput,
}: {
  currentTitle: string;
  busy: boolean;
  notice: string | null;
  onSelect: (i: number) => void;
  onUpload: (f: File) => void;
  fileInput: React.RefObject<HTMLInputElement>;
}) {
  const { playing, play, pause, motion, setMotion } = useVibe();

  return (
    <div
      className="control-panel"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onUpload(f);
      }}
    >
      <div className="panel-title">Drop a song, watch the page trip</div>
      <div className="panel-row">
        <button className={`panel-btn play ${playing ? "on" : ""}`} onClick={() => (playing ? pause() : play())}>
          {playing ? "♪ Jamming" : "▶ Play"}
        </button>
        <select className="panel-select" value={bundledTracks.findIndex((t) => t.title === currentTitle)} onChange={(e) => onSelect(Number(e.target.value))}>
          {bundledTracks.map((t, i) => (
            <option key={t.title} value={i}>
              {t.title}
            </option>
          ))}
        </select>
        <button className="panel-btn" onClick={() => fileInput.current?.click()}>
          Upload
        </button>
        <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
      </div>
      <div className="panel-row">
        <span className="panel-label">Motion</span>
        {(["full", "reduced", "minimal"] as MotionMode[]).map((m) => (
          <button key={m} className={`panel-btn ${motion === m ? "active" : ""}`} onClick={() => setMotion(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="panel-now">Now: {currentTitle}</div>
      {busy && <div className="panel-note">Choreographing…</div>}
      {notice && <div className="panel-note error">{notice}</div>}
      {!ENGINE_URL && <div className="panel-note">No engine connected — uploads use in-browser analysis.</div>}
    </div>
  );
}
