import { useState, useRef, useEffect } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  .sc{font-family:'DM Sans',sans-serif;padding:1.5rem;max-width:560px;margin:0 auto;}
  .sc-logo{font-family:'Fraunces',serif;font-size:2.1rem;font-weight:700;color:var(--color-text-primary);line-height:1;}
  .sc-logo em{font-style:italic;font-weight:400;}
  .sc-tagline{font-size:13px;color:var(--color-text-secondary);margin:4px 0 1.5rem;}
  .sc-label{font-size:11px;font-weight:500;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;}
  .sc-input{width:100%;padding:14px 16px;font-size:15px;font-family:'DM Sans',sans-serif;border:0.5px solid var(--color-border-secondary);border-radius:var(--border-radius-lg);background:var(--color-background-primary);color:var(--color-text-primary);outline:none;resize:none;line-height:1.5;}
  .sc-input:focus{border-color:var(--color-border-primary);}
  .sc-input::placeholder{color:var(--color-text-tertiary);}
  .sc-row{display:flex;gap:8px;margin-top:10px;}
  .sc-btn{padding:12px 18px;border-radius:var(--border-radius-md);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;border:0.5px solid var(--color-border-secondary);background:var(--color-background-primary);color:var(--color-text-primary);transition:background 0.15s,opacity 0.15s;white-space:nowrap;}
  .sc-btn:hover{background:var(--color-background-secondary);}
  .sc-btn:disabled{opacity:0.35;cursor:default;}
  .sc-btn-primary{background:var(--color-text-primary);color:var(--color-background-primary);border-color:transparent;flex:1;}
  .sc-btn-primary:hover{opacity:0.82;background:var(--color-text-primary);}
  .sc-btn-mic{font-size:17px;padding:12px 14px;}
  .sc-btn-mic.on{border-color:var(--color-border-danger);background:var(--color-background-danger);}
  .sc-error{font-size:13px;color:var(--color-text-danger);margin-top:8px;}
  .sc-back{background:none;border:none;cursor:pointer;font-size:13px;color:var(--color-text-secondary);padding:0 0 1.25rem;font-family:'DM Sans',sans-serif;}
  .sc-back:hover{color:var(--color-text-primary);}
  .sc-section-title{font-family:'Fraunces',serif;font-size:1.55rem;font-weight:600;color:var(--color-text-primary);margin-bottom:0.2rem;}
  .sc-ing-used{font-size:13px;color:var(--color-text-secondary);margin-bottom:1.25rem;font-style:italic;}
  .sc-card{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1rem 1.25rem;margin-bottom:10px;cursor:pointer;transition:border-color 0.2s,transform 0.12s;}
  .sc-card:hover{border-color:var(--color-border-primary);transform:translateY(-1px);}
  .sc-card:active{transform:translateY(0);}
  .sc-card-top{display:flex;align-items:flex-start;gap:12px;}
  .sc-card-emoji{font-size:2.2rem;line-height:1;flex-shrink:0;margin-top:2px;}
  .sc-card-name{font-family:'Fraunces',serif;font-size:1.1rem;font-weight:600;color:var(--color-text-primary);line-height:1.25;}
  .sc-tags{display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;}
  .sc-tag{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--color-background-secondary);color:var(--color-text-secondary);border:0.5px solid var(--color-border-tertiary);}
  .sc-card-tagline{font-size:13px;color:var(--color-text-secondary);margin-top:10px;font-style:italic;line-height:1.5;}
  .sc-card-cta{font-size:12px;color:var(--color-text-tertiary);margin-top:8px;}
  .sc-cook-top{text-align:center;margin-bottom:1.25rem;}
  .sc-cook-emoji{font-size:2.4rem;display:block;margin-bottom:4px;}
  .sc-cook-name{font-family:'Fraunces',serif;font-size:1.35rem;font-weight:600;color:var(--color-text-primary);}
  .sc-dots{display:flex;gap:5px;justify-content:center;margin-bottom:1.25rem;}
  .sc-dot{height:6px;width:6px;border-radius:50%;background:var(--color-border-secondary);transition:all 0.2s;}
  .sc-dot.done{background:var(--color-text-secondary);}
  .sc-dot.now{background:var(--color-text-primary);width:18px;border-radius:3px;}
  .sc-step{background:var(--color-background-secondary);border-radius:var(--border-radius-lg);padding:1.5rem;margin-bottom:1.25rem;min-height:110px;display:flex;flex-direction:column;justify-content:center;}
  .sc-step-num{font-size:11px;font-weight:500;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;}
  .sc-step-text{font-size:16px;color:var(--color-text-primary);line-height:1.65;}
  .sc-nav{display:flex;gap:8px;}
  .sc-yummi{font-size:13px;padding:12px 13px;}
  .sc-yummi.speaking{background:var(--color-background-success);border-color:var(--color-border-success);color:var(--color-text-success);}
  .sc-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:1rem;}
  .sc-spinner{width:26px;height:26px;border:2px solid var(--color-border-tertiary);border-top-color:var(--color-text-primary);border-radius:50%;animation:sc-spin 0.7s linear infinite;}
  @keyframes sc-spin{to{transform:rotate(360deg);}}
  .sc-load-msg{font-size:14px;color:var(--color-text-secondary);font-style:italic;}
  .sc-celebrate{text-align:center;padding:2.5rem 1rem;}
  .sc-cel-big{font-size:4rem;display:block;margin-bottom:1rem;animation:sc-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);}
  @keyframes sc-pop{from{transform:scale(0);}to{transform:scale(1);}}
  .sc-cel-title{font-family:'Fraunces',serif;font-size:2rem;font-weight:700;color:var(--color-text-primary);margin-bottom:0.5rem;}
  .sc-cel-sub{font-size:14px;color:var(--color-text-secondary);margin-bottom:2rem;line-height:1.6;}
`;

const LOAD_MSGS = ["Checking what's possible...", "Finding your best options...", "Almost ready..."];

export default function ShareChefAI() {
  const [screen, setScreen] = useState("home");
  const [ingredients, setIngredients] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [step, setStep] = useState(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [loadMsg, setLoadMsg] = useState(0);
  const recRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => { window.speechSynthesis?.cancel(); clearInterval(timerRef.current); }, []);

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Voice not supported. Please use Chrome!"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-US";
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setIngredients(p => p ? p + ", " + t : t);
    };
    recRef.current = r;
    try { r.start(); } catch { setListening(false); }
  };

  const findMeals = async () => {
    if (!ingredients.trim()) { setError("Tell me what's in your kitchen first!"); return; }
    setError(""); setScreen("loading"); setLoadMsg(0);
    timerRef.current = setInterval(() => setLoadMsg(p => Math.min(p + 1, LOAD_MSGS.length - 1)), 1800);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: `You are ShareChef AI, a warm encouraging kitchen companion called the Yummi Guide.
The user has: ${ingredients}

Generate 2-3 realistic meals using ONLY these ingredients + basic pantry staples (salt, pepper, oil, butter, garlic, onion — only if realistic).
Be HONEST. Only suggest what is genuinely cookable. Steps must be beginner-friendly.
Each recipe needs exactly 5 steps. Tone: warm and encouraging like a supportive friend.

Respond ONLY with valid JSON, no markdown whatsoever:
{"recipes":[{"name":"string","emoji":"one emoji","time":"X min","difficulty":"Easy or Medium","tagline":"encouraging line under 10 words","steps":["Step 1.","Step 2.","Step 3.","Step 4.","Step 5."]}]}`
          }]
        })
      });
      clearInterval(timerRef.current);
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setRecipes(parsed.recipes || []);
      setScreen("recipes");
    } catch {
      clearInterval(timerRef.current);
      setError("Something went wrong — let's try again!");
      setScreen("home");
    }
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.88; u.pitch = 1.05; u.lang = "en-US";
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const cookThis = (r) => {
    setRecipe(r); setStep(0); setScreen("cooking");
    setTimeout(() => speak("Let's cook " + r.name + ". " + r.steps[0]), 400);
  };

  const next = () => {
    if (!recipe) return;
    if (step < recipe.steps.length - 1) { const n = step + 1; setStep(n); speak(recipe.steps[n]); }
    else { window.speechSynthesis.cancel(); setScreen("done"); }
  };

  const prev = () => {
    if (step > 0) { const p = step - 1; setStep(p); speak(recipe.steps[p]); }
  };

  const reset = () => {
    window.speechSynthesis.cancel(); clearInterval(timerRef.current);
    setScreen("home"); setIngredients(""); setRecipes([]); setRecipe(null);
    setStep(0); setError(""); setListening(false); setSpeaking(false); setLoadMsg(0);
  };

  if (screen === "loading") return (
    <div className="sc"><style>{css}</style>
      <div className="sc-loading">
        <div className="sc-spinner" />
        <p className="sc-load-msg">{LOAD_MSGS[loadMsg]}</p>
      </div>
    </div>
  );

  if (screen === "recipes") return (
    <div className="sc"><style>{css}</style>
      <button className="sc-back" onClick={reset}>← start over</button>
      <div className="sc-label">your options</div>
      <div className="sc-section-title">What sounds good?</div>
      <p className="sc-ing-used">Using: {ingredients}</p>
      {recipes.map((r, i) => (
        <div key={i} className="sc-card" onClick={() => cookThis(r)}>
          <div className="sc-card-top">
            <span className="sc-card-emoji">{r.emoji}</span>
            <div style={{flex:1}}>
              <div className="sc-card-name">{r.name}</div>
              <div className="sc-tags">
                <span className="sc-tag">⏱ {r.time}</span>
                <span className="sc-tag">{r.difficulty}</span>
                <span className="sc-tag">{r.steps?.length || 5} steps</span>
              </div>
            </div>
          </div>
          <p className="sc-card-tagline">"{r.tagline}"</p>
          <p className="sc-card-cta">Tap to cook with Yummi Guide →</p>
        </div>
      ))}
    </div>
  );

  if (screen === "cooking" && recipe) return (
    <div className="sc"><style>{css}</style>
      <button className="sc-back" onClick={() => { window.speechSynthesis.cancel(); setScreen("recipes"); }}>← back</button>
      <div className="sc-cook-top">
        <span className="sc-cook-emoji">{recipe.emoji}</span>
        <div className="sc-cook-name">{recipe.name}</div>
      </div>
      <div className="sc-dots">
        {recipe.steps.map((_, i) => (
          <div key={i} className={`sc-dot ${i < step ? "done" : i === step ? "now" : ""}`} />
        ))}
      </div>
      <div className="sc-step">
        <div className="sc-step-num">Step {step + 1} of {recipe.steps.length}</div>
        <div className="sc-step-text">{recipe.steps[step]}</div>
      </div>
      <div className="sc-nav">
        <button className="sc-btn" onClick={prev} disabled={step === 0}>← prev</button>
        <button className={`sc-btn sc-yummi ${speaking ? "speaking" : ""}`} onClick={() => speak(recipe.steps[step])}>
          {speaking ? "🔊 speaking..." : "🔈 Yummi Guide"}
        </button>
        <button className="sc-btn sc-btn-primary" onClick={next}>
          {step === recipe.steps.length - 1 ? "✓ done!" : "next →"}
        </button>
      </div>
    </div>
  );

  if (screen === "done") return (
    <div className="sc"><style>{css}</style>
      <div className="sc-celebrate">
        <span className="sc-cel-big">🎉</span>
        <div className="sc-cel-title">You cooked it!</div>
        <p className="sc-cel-sub">
          {recipe?.name} — look at you go! 👨‍🍳<br/>
          <span style={{fontSize:"13px"}}>No grocery run. Just pure kitchen wins.</span>
        </p>
        <button className="sc-btn sc-btn-primary" onClick={reset} style={{width:"100%",padding:"15px",fontSize:"15px"}}>
          cook something else →
        </button>
      </div>
    </div>
  );

  return (
    <div className="sc"><style>{css}</style>
      <div className="sc-logo">Share<em>Chef</em> AI</div>
      <p className="sc-tagline">Tell me what's in your kitchen. I'll handle dinner. 🍳</p>
      <div className="sc-label">what do you have?</div>
      <textarea
        className="sc-input"
        rows={3}
        placeholder="e.g. eggs, spinach, cheddar cheese, chicken..."
        value={ingredients}
        onChange={e => { setIngredients(e.target.value); setError(""); }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); findMeals(); } }}
      />
      {error && <p className="sc-error">{error}</p>}
      <div className="sc-row">
        <button className={`sc-btn sc-btn-mic ${listening ? "on" : ""}`} onClick={toggleMic} title="Speak your ingredients">
          {listening ? "🎤" : "🎙️"}
        </button>
        <button className="sc-btn sc-btn-primary" onClick={findMeals}>
          Find my meals →
        </button>
      </div>
      <p style={{fontSize:"12px",color:"var(--color-text-tertiary)",marginTop:"14px"}}>
        Powered by Yummi Guide · No shopping needed
      </p>
    </div>
  );
}
