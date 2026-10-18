import { GuideProvider } from "./components/GuideContext";
import { ArrowIcon, CameraIcon, LockIcon, PenIcon, TypeIcon } from "./components/Icons";
import { Studio } from "./components/Studio";
import { WriteGuide } from "./components/WriteGuide";

const STEPS = [
  {
    icon: <PenIcon />,
    title: "Write",
    body: "Copy 29 short lines into any lined notebook. Takes about 10 minutes.",
  },
  {
    icon: <CameraIcon />,
    title: "Snap",
    body: "Photograph the pages with your phone. We find every letter automatically.",
  },
  {
    icon: <TypeIcon />,
    title: "Type",
    body: "Type anything and download it as an image in your own handwriting.",
  },
];

const FAQ = [
  {
    q: "Are my photos uploaded anywhere?",
    a: "The photo is processed in your browser and never uploaded. To label your letters, each row is cut out as a black-and-white strip and sent to an AI model, which reads which characters it contains. The strips are not stored.",
  },
  {
    q: "Will it look exactly like my writing?",
    a: "It is built from your own letter samples, so it looks like your handwriting, with natural variation between repeated letters. It is not pixel-identical to a real page.",
  },
  {
    q: "Does it work with cursive?",
    a: "Print-style handwriting works best. Joined-up letters are written separately here, so cursive will look less natural for now.",
  },
  {
    q: "Can I install it as a font?",
    a: "Not yet. Today you can download PNG and SVG images. An installable font file is on the roadmap.",
  },
];

export default function Home() {
  return (
    <GuideProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a href="#" className="logo" aria-label="myhandwriting home">
            <span className="logo-mark" aria-hidden="true">
              <PenIcon />
            </span>
            myhandwriting
          </a>
          <nav aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#write">Write</a>
            <a href="#studio" className="nav-cta">
              Upload pages
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="pill">
                <LockIcon /> Free, no signup, runs on your device
              </p>
              <h1>
                Type in your{" "}
                <span className="scribble">
                  own handwriting
                  <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 14 C 60 4, 120 4, 170 11 S 260 16, 297 6" />
                  </svg>
                </span>
              </h1>
              <p className="lede">
                No printer, no app. Write a few lines in any notebook, take a photo, and turn your handwriting
                into text you can type.
              </p>
              <div className="hero-ctas">
                <a href="#write" className="btn btn-primary btn-lg">
                  Start writing <ArrowIcon />
                </a>
                <a href="#studio" className="btn btn-ghost btn-lg">
                  I have my pages
                </a>
              </div>
            </div>

            <div className="hero-art" aria-hidden="true">
              <div className="art-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/samples/page-1.jpg" alt="" />
              </div>
              <div className="art-arrow">
                <svg viewBox="0 0 120 60">
                  <path d="M5 45 C 35 5, 80 5, 110 30" />
                  <path d="M98 18 L 111 31 L 94 36" />
                </svg>
              </div>
              <div className="art-card">
                <p className="art-hand">
                  Dear Maya,
                  <br />
                  thanks for dinner!
                  <br />
                  See you soon, Sam
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="section">
          <div className="container">
            <div className="steps">
              {STEPS.map((s, i) => (
                <div key={s.title} className="step">
                  <span className="step-icon">{s.icon}</span>
                  <span className="step-num">0{i + 1}</span>
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="write" className="section section-tint" aria-labelledby="write-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Step 1</span>
              <h2 id="write-title">Write these lines in your notebook</h2>
              <p className="muted">
                Any ruled paper works. Keep this page open on your phone and tick lines off as you go.
              </p>
            </div>
            <WriteGuide />
          </div>
        </section>

        <section id="studio" className="section" aria-labelledby="studio-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Step 2</span>
              <h2 id="studio-title">Snap and upload your pages</h2>
              <p className="muted">
                Use daylight, lay the page flat and hold the phone straight above it. Fill the frame with the page.
              </p>
            </div>
            <Studio />
          </div>
        </section>

        <section className="section section-tint" aria-labelledby="faq-title">
          <div className="container narrow">
            <h2 id="faq-title" className="center">
              Questions
            </h2>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span>myhandwriting</span>
          <span className="muted">Photos are processed in your browser. Only strips of your rows are read by AI.</span>
        </div>
      </footer>
    </GuideProvider>
  );
}
