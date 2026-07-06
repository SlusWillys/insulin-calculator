import { useState, useEffect } from "react";

const COLORS = {
  bg: "#F0F4F8", card: "#FFFFFF", accent: "#2D7DD2", accentLight: "#EBF4FF",
  warning: "#F4A823", warningLight: "#FFF8E7", danger: "#E63946", dangerLight: "#FDECEA",
  success: "#2DC653", successLight: "#E8F9EC", text: "#1A1A2E", muted: "#6B7280",
  border: "#E5E9F0", purple: "#7B61FF", purpleLight: "#F0EDFF",
};

const XE_GRAMS = 10;
const ISF = 0.8;
const TARGET = 7.0;
const FIASP_DIA = 3.5;
const BJU_COEF = 0.5;

const ICR_SCHEDULE = [
  { from: 0,  to: 7,  icr: 2.0, label: "00:00-07:00" },
  { from: 7,  to: 13, icr: 3.0, label: "07:00-13:00" },
  { from: 13, to: 19, icr: 2.5, label: "13:00-19:00" },
  { from: 19, to: 24, icr: 2.3, label: "19:00-00:00" },
];

function getActiveICR(now) {
  const h = now.getHours();
  return ICR_SCHEDULE.find(s => h >= s.from && h < s.to) || ICR_SCHEDULE[0];
}

function calcIOB(units, mins) {
  if (mins <= 0) return units;
  const total = FIASP_DIA * 60;
  if (mins >= total) return 0;
  return Math.round(units * (1 - mins / total) * 10) / 10;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿ÑÐ¾ÑÐ¸ÑÐ°ÑÑ ÑÐ°Ð¹Ð»"));
    r.readAsDataURL(file);
  });
}

function compressImage(file, maxSize = 1200, quality = 0.85) {
  return new Promise(async (resolve, reject) => {
    try {
      const dataUrl = await fileToBase64(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
            else { width = Math.round(width * maxSize / height); height = maxSize; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const outUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(outUrl.split(",")[1]);
        } catch (err) {
          reject(new Error("ÐÑÐ¸Ð±ÐºÐ° Ð¾Ð±ÑÐ°Ð±Ð¾ÑÐºÐ¸ Ð¸Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð¸Ñ: " + err.message));
        }
      };
      img.onerror = () => resolve(dataUrl.split(",")[1]);
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
}

// ÐÑÐ·Ð¾Ð² ÑÐµÑÐµÐ· ÑÐ¾Ð±ÑÑÐ²ÐµÐ½Ð½ÑÑ serverless-ÑÑÐ½ÐºÑÐ¸Ñ /api/analyze â ÐºÐ»ÑÑ ÑÑÐ°Ð½Ð¸ÑÑÑ Ð½Ð° ÑÐµÑÐ²ÐµÑÐµ
async function callClaude(file, prompt) {
  const b64 = await compressImage(file);
  const mime = "image/jpeg";

  let res;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: b64, mimeType: mime, prompt })
    });
  } catch (netErr) {
    throw new Error("Ð¡ÐµÑÐµÐ²Ð°Ñ Ð¾ÑÐ¸Ð±ÐºÐ°: " + netErr.message);
  }

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error("Ð¡ÐµÑÐ²ÐµÑ Ð²ÐµÑÐ½ÑÐ» Ð½Ðµ JSON (ÑÑÐ°ÑÑÑ " + res.status + "): " + rawText.slice(0, 150));
  }
  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error("ÐÑÑÑÐ¾Ð¹ Ð¾ÑÐ²ÐµÑ Ð¾Ñ ÑÐµÑÐ²ÐµÑÐ°");
  return data.text;
}

const Card = ({ children, style }) => (
  <div style={{ background: COLORS.card, borderRadius: 16, padding: "18px 16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid " + COLORS.border, ...style }}>
    {children}
  </div>
);

function PhotoButton({ label, loading, onChange }) {
  return (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      <div style={{ background: loading ? COLORS.muted : COLORS.accent, color: "#fff", borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", userSelect: "none" }}>
        {loading ? "â³..." : label}
      </div>
      <input type="file" accept="image/*" onChange={onChange}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
    </div>
  );
}

function FoodEntry({ onAdd }) {
  const [name, setName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [grams, setGrams] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setStatus("");
    try {
      const text = await callClaude(file, "This is a food nutrition label. Find carbohydrates, protein and fat per 100g. Reply ONLY with JSON like this: {\"name\":\"product name\",\"carbs\":45.2,\"protein\":10.5,\"fat\":8.3} â nothing else. If protein or fat not visible, use 0.");
      const clean = text.replace(/```[a-z]*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.name) setName(parsed.name);
      if (parsed.carbs !== undefined) setCarbs(String(parsed.carbs));
      if (parsed.protein !== undefined) setProtein(String(parsed.protein));
      if (parsed.fat !== undefined) setFat(String(parsed.fat));
      setStatus("â Ð Ð°ÑÐ¿Ð¾Ð·Ð½Ð°Ð½Ð¾");
      setTimeout(() => setStatus(""), 2500);
    } catch(err) {
      setStatus("â " + err.message);
    }
    setLoading(false);
    e.target.value = "";
  };

  const c = parseFloat(carbs) || 0;
  const p = parseFloat(protein) || 0;
  const f = parseFloat(fat) || 0;
  const g = parseFloat(grams) || 0;
  const totalCarbsExactPreview = c * g / 100;
  const xe = (carbs && grams) ? Math.round(totalCarbsExactPreview / XE_GRAMS * 10) / 10 : null;
  const bjuKcal = (p * 4 + f * 9) * g / 100;
  const bje = Math.round(bjuKcal / 100 * 100) / 100;
  const isFatty = f > 0 && (f * g / 100) >= 10;

  const handleAdd = () => {
    if (!name) { alert("ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¿ÑÐ¾Ð´ÑÐºÑÐ°"); return; }
    if (!grams || g <= 0) { alert("ÐÐ²ÐµÐ´Ð¸ÑÐµ ÐºÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð¾ (Ð³ÑÐ°Ð¼Ð¼Ñ Ð¿Ð¾ÑÑÐ¸Ð¸)"); return; }
    if (!carbs && !protein && !fat) { alert("ÐÐ²ÐµÐ´Ð¸ÑÐµ ÑÐ¾ÑÑ Ð±Ñ ÑÐ³Ð»ÐµÐ²Ð¾Ð´Ñ, Ð±ÐµÐ»ÐºÐ¸ Ð¸Ð»Ð¸ Ð¶Ð¸ÑÑ Ð½Ð° 100Ð³"); return; }
    const totalCarbsExact = c * g / 100;
    const totalCarbs = Math.round(totalCarbsExact * 10) / 10;
    const totalXE = Math.round(totalCarbsExact / XE_GRAMS * 10) / 10;
    const totalProtein = Math.round(p * g / 100 * 10) / 10;
    const totalFat = Math.round(f * g / 100 * 10) / 10;
    const totalBJE = Math.round((totalProtein * 4 + totalFat * 9) / 100 * 100) / 100;
    onAdd({ name, carbs_per_100g: c, grams: g, totalCarbs, totalXE, totalProtein, totalFat, totalBJE });
    setName(""); setCarbs(""); setProtein(""); setFat(""); setGrams("");
  };

  return (
    <div style={{ background: COLORS.bg, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¿ÑÐ¾Ð´ÑÐºÑÐ°"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 13, background: COLORS.card, minWidth: 0 }} />
        <PhotoButton label="ð· Ð­ÑÐ¸ÐºÐµÑÐºÐ°" loading={loading} onChange={handlePhoto} />
      </div>
      {status && (
        <div style={{ fontSize: 11, color: status.startsWith("â") ? COLORS.success : COLORS.danger, marginBottom: 8, wordBreak: "break-word" }}>
          {status}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>Ð£Ð³Ð»ÐµÐ²Ð¾Ð´Ñ /100Ð³</div>
          <input value={carbs} onChange={e => setCarbs(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>ÐÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð¾ (Ð³)</div>
          <input value={grams} onChange={e => setGrams(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>ÐÐµÐ»ÐºÐ¸ /100Ð³</div>
          <input value={protein} onChange={e => setProtein(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>ÐÐ¸ÑÑ /100Ð³</div>
          <input value={fat} onChange={e => setFat(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
      </div>
      {xe !== null && (
        <div style={{ fontSize: 13, color: COLORS.accent, fontWeight: 600, marginBottom: 6 }}>
          = {Math.round(totalCarbsExactPreview * 10) / 10}Ð³ ÑÐ³Ð»ÐµÐ²Ð¾Ð´Ð¾Ð² Â· {xe} Ð¥Ð
        </div>
      )}
      {isFatty && (
        <div style={{ fontSize: 12, color: COLORS.purple, fontWeight: 600, marginBottom: 8, background: COLORS.purpleLight, borderRadius: 8, padding: "6px 10px" }}>
          ÐÐ¸ÑÐ½ÑÐ¹/Ð±ÐµÐ»ÐºÐ¾Ð²ÑÐ¹ Ð¿ÑÐ¾Ð´ÑÐºÑ â ÐÐÐ: {bje} ÐÐÐ (Ð¾ÑÐµÐ½Ð¾ÑÐ½Ð¾)
        </div>
      )}
      <button onClick={handleAdd} style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        + ÐÐ¾Ð±Ð°Ð²Ð¸ÑÑ
      </button>
    </div>
  );
}

export default function App() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const activeICR = getActiveICR(now);
  const [glucoseStr, setGlucoseStr] = useState("15.4");
  const glucose = parseFloat(glucoseStr) || 0;
  const [foods, setFoods] = useState([]);
  const [tab, setTab] = useState("both");
  const [lastDose, setLastDose] = useState(0);
  const [lastTime, setLastTime] = useState("");
  const [dexLoading, setDexLoading] = useState(false);
  const [dexStatus, setDexStatus] = useState("");

  const [iobMins, setIobMins] = useState(null);
  useEffect(() => {
    if (!lastTime) { setIobMins(null); return; }
    const [h, m] = lastTime.split(":").map(Number);
    const last = new Date(now);
    last.setHours(h, m, 0, 0);
    if (last > now) last.setDate(last.getDate() - 1);
    setIobMins(Math.round((now - last) / 60000));
  }, [lastTime, now]);

  const iob = (lastDose > 0 && iobMins !== null) ? calcIOB(lastDose, iobMins) : 0;
  const totalXE = Math.round(foods.reduce((s, f) => s + f.totalXE, 0) * 10) / 10;
  const totalCarbs = Math.round(foods.reduce((s, f) => s + f.totalCarbs, 0) * 10) / 10;
  const totalBJE = Math.round(foods.reduce((s, f) => s + (f.totalBJE || 0), 0) * 100) / 100;
  const mealDose = tab !== "correction" ? Math.round(totalXE * activeICR.icr * 2) / 2 : 0;
  const bjuDoseRaw = tab !== "correction" ? totalBJE * BJU_COEF : 0;
  const bjuDose = Math.round(bjuDoseRaw * 2) / 2;
  const rawCorr = tab !== "meal" ? Math.max(0, (glucose - TARGET) / ISF) : 0;
  const corrFinal = Math.max(0, rawCorr - iob);
  const corrRounded = Math.round(corrFinal * 2) / 2;
  const totalDose = mealDose + corrRounded + bjuDose;
  const iobDisplay = Math.round(iob * 10) / 10;
  const glucoseColor = glucose > 13 ? COLORS.danger : glucose > 10 ? COLORS.warning : glucose >= 4 ? COLORS.success : COLORS.danger;
  const hour = now.getHours();

  const handleDexPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDexLoading(true);
    setDexStatus("Ð§Ð¸ÑÐ°Ñ ÑÐ¾ÑÐ¾...");
    try {
      const text = await callClaude(file, "This is a Dexcom CGM glucose monitor screen showing current glucose level and a trend arrow. Find the current glucose value in mmol/L. Reply with ONLY the number, for example: 8.4 or 15.4 â ignore the trend arrow, just give the number.");
      const num = parseFloat(text.trim().replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!isNaN(num) && num > 1 && num < 35) {
        setGlucoseStr(String(Math.round(num * 10) / 10));
        setDexStatus("ÐÐ¾ÑÐ¾Ð²Ð¾: " + Math.round(num * 10) / 10 + " Ð¼Ð¼Ð¾Ð»Ñ/Ð»");
        setTimeout(() => setDexStatus(""), 3000);
      } else {
        setDexStatus("ÐÐµ ÑÐ°ÑÐ¿Ð¾Ð·Ð½Ð°Ð». ÐÑÐ²ÐµÑ: " + text.trim().slice(0, 50));
      }
    } catch(err) {
      setDexStatus("ÐÑÐ¸Ð±ÐºÐ°: " + (err && err.message ? err.message : String(err)));
    }
    setDexLoading(false);
    e.target.value = "";
  };

  const tabs = [
    { id: "both", label: "ÐÐ´Ð° + ÐºÐ¾ÑÑÐµÐºÑÐ¸Ñ" },
    { id: "meal", label: "Ð¢Ð¾Ð»ÑÐºÐ¾ ÐµÐ´Ð°" },
    { id: "correction", label: "Ð¢Ð¾Ð»ÑÐºÐ¾ ÐºÐ¾ÑÑÐµÐºÑÐ¸Ñ" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "system-ui, -apple-system, sans-serif", padding: "20px 14px 40px", maxWidth: 420, margin: "0 auto", color: COLORS.text }}>

      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: COLORS.muted, textTransform: "uppercase", marginBottom: 4 }}>Ð¤Ð¸Ð°ÑÐ¿ Â· Ð¢ÑÐµÑÐ¸Ð±Ð°</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>ÐÐ°Ð»ÑÐºÑÐ»ÑÑÐ¾Ñ Ð´Ð¾Ð·Ñ</h1>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button onClick={() => {
          setGlucoseStr("7.0");
          setFoods([]);
          setLastDose(0);
          setLastTime("");
        }} style={{
          padding: "6px 12px", borderRadius: 10, border: "1px solid " + COLORS.border,
          background: COLORS.card, color: COLORS.muted, fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}>
          âº Ð¡Ð±ÑÐ¾ÑÐ¸ÑÑ Ð²ÑÑ
        </button>
      </div>

      <Card style={{ background: (hour >= 20 && hour < 21) ? COLORS.purpleLight : "#fafafe", border: "1px solid " + ((hour >= 20 && hour < 21) ? COLORS.purple : COLORS.border) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>ð</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple }}>{(hour >= 20 && hour < 21) ? "ÐÑÐµÐ¼Ñ Ð¢ÑÐµÑÐ¸Ð±Ñ!" : "Ð¢ÑÐµÑÐ¸Ð±Ð° (Ð±Ð°Ð·Ð°Ð»)"}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>ÐÐ¶ÐµÐ´Ð½ÐµÐ²Ð½Ð¾ ~20:00</div>
            </div>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.purple }}>28 <span style={{ fontSize: 12 }}>ÐµÐ´.</span></span>
        </div>
      </Card>

      <Card style={{ background: COLORS.accentLight, border: "1px solid " + COLORS.accent + "33" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: COLORS.accent }}>Ð£Ð Ð¿Ð¾ Ð²ÑÐµÐ¼ÐµÐ½Ð¸ (ÐµÐ´. Ð½Ð° 1 Ð¥Ð)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {ICR_SCHEDULE.map(s => (
            <div key={s.label} style={{ background: s === activeICR ? COLORS.accent : COLORS.card, borderRadius: 10, padding: "8px 10px", border: "1px solid " + (s === activeICR ? COLORS.accent : COLORS.border) }}>
              <div style={{ fontSize: 10, color: s === activeICR ? "rgba(255,255,255,0.75)" : COLORS.muted }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: s === activeICR ? "#fff" : COLORS.text }}>{s.icr} ÐµÐ´./Ð¥Ð</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.muted }}>Ð¤Ð§ ÐºÐ¾ÑÑÐµÐºÑÐ¸Ð¸: 1 ÐµÐ´. ÑÐ½Ð¸Ð¶Ð°ÐµÑ Ð½Ð° 0.8 Ð¼Ð¼Ð¾Ð»Ñ/Ð» Â· 1 Ð¥Ð = 10Ð³ ÑÐ³Ð»ÐµÐ²Ð¾Ð´Ð¾Ð²</div>
      </Card>

      <div style={{ display: "flex", background: COLORS.card, borderRadius: 12, padding: 4, marginBottom: 14, border: "1px solid " + COLORS.border, gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: tab === t.id ? COLORS.accent : "transparent", color: tab === t.id ? "#fff" : COLORS.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: glucoseColor }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Ð¢ÐµÐºÑÑÐ¸Ð¹ ÑÐ°ÑÐ°Ñ</span>
          </div>
          <PhotoButton label="ð¼ Ð¤Ð¾ÑÐ¾ Dexcom" loading={dexLoading} onChange={handleDexPhoto} />
        </div>
        {dexStatus ? (
          <div style={{ background: dexStatus.startsWith("ÐÐ¾ÑÐ¾Ð²Ð¾") ? COLORS.successLight : COLORS.warningLight, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: dexStatus.startsWith("ÐÐ¾ÑÐ¾Ð²Ð¾") ? COLORS.success : COLORS.warning, marginBottom: 10, wordBreak: "break-all" }}>
            {dexStatus}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <input type="number" step="0.1" min="2" max="25" value={glucoseStr}
            onChange={e => setGlucoseStr(e.target.value)}
            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setGlucoseStr(String(Math.round(v * 10) / 10)); }}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "2px solid " + glucoseColor, fontSize: 24, fontWeight: 800, color: glucoseColor, background: COLORS.bg, textAlign: "center", outline: "none" }} />
          <span style={{ fontSize: 13, color: COLORS.muted }}>Ð¼Ð¼Ð¾Ð»Ñ/Ð»</span>
        </div>
        <input type="range" min={2} max={25} step={0.1} value={glucose}
          onChange={e => setGlucoseStr(e.target.value)}
          style={{ width: "100%", accentColor: glucoseColor, cursor: "pointer", marginBottom: 10 }} />
        <div style={{ background: glucose > 10 ? COLORS.warningLight : glucose < 4 ? COLORS.dangerLight : COLORS.successLight, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: glucoseColor, fontWeight: 500 }}>
          {glucose > 13 ? "ÐÑÑÐ°Ð¶ÐµÐ½Ð½Ð°Ñ Ð³Ð¸Ð¿ÐµÑÐ³Ð»Ð¸ÐºÐµÐ¼Ð¸Ñ" : glucose > 10 ? "ÐÐ¾Ð²ÑÑÐµÐ½ â Ð½ÑÐ¶Ð½Ð° ÐºÐ¾ÑÑÐµÐºÑÐ¸Ñ" : glucose > 7.8 ? "ÐÐµÐ¼Ð½Ð¾Ð³Ð¾ Ð²ÑÑÐµ Ð½Ð¾ÑÐ¼Ñ" : glucose >= 4 ? "Ð ÑÐµÐ»ÐµÐ²Ð¾Ð¼ Ð´Ð¸Ð°Ð¿Ð°Ð·Ð¾Ð½Ðµ" : "ÐÐ¸Ð¿Ð¾Ð³Ð»Ð¸ÐºÐµÐ¼Ð¸Ñ â ÑÐ½Ð°ÑÐ°Ð»Ð° ÐºÑÐ¿Ð¸ÑÑÐ¹ÑÐµ!"}
        </div>
      </Card>

      {tab !== "correction" && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>ÐÑÐ¾Ð´ÑÐºÑÑ</span>
            <span style={{ fontSize: 11, color: COLORS.muted }}>1 Ð¥Ð = 10Ð³ ÑÐ³Ð»ÐµÐ²Ð¾Ð´Ð¾Ð²</span>
          </div>
          <FoodEntry onAdd={f => setFoods(prev => [...prev, f])} />
          {foods.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: COLORS.accentLight, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{f.grams}Ð³ Â· {f.totalCarbs}Ð³ Ð£Ð{f.totalBJE > 0 ? " Â· " + f.totalBJE + " ÐÐÐ" : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.accent }}>{f.totalXE} Ð¥Ð</span>
                <button onClick={() => setFoods(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>â</button>
              </div>
            </div>
          ))}
          {foods.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: COLORS.accent, color: "#fff", fontWeight: 700, marginTop: 4, marginBottom: 8 }}>
              <span>ÐÑÐ¾Ð³Ð¾</span>
              <span>{totalCarbs}Ð³ Â· {totalXE} Ð¥Ð</span>
            </div>
          )}
          {foods.length > 0 && (
            <button onClick={() => setFoods([])} style={{
              width: "100%", padding: "8px", borderRadius: 10, border: "1px solid " + COLORS.danger,
              background: "transparent", color: COLORS.danger, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              â Ð¡Ð±ÑÐ¾ÑÐ¸ÑÑ Ð²ÑÐµ Ð¿ÑÐ¾Ð´ÑÐºÑÑ
            </button>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>ÐÐºÑÐ¸Ð²Ð½ÑÐ¹ Ð¸Ð½ÑÑÐ»Ð¸Ð½ (IOB)</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>ÐÐ¾ÑÐ»ÐµÐ´Ð½Ð¸Ð¹ Ð±Ð¾Ð»ÑÑ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setLastDose(d => Math.max(0, Math.round((d - 0.5) * 10) / 10))} style={{ width: 36, height: 40, borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, fontSize: 18, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>-</button>
            <input type="number" step="0.5" min="0" value={lastDose}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setLastDose(Math.round(v * 2) / 2); }}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "2px solid " + COLORS.accent, fontSize: 18, fontWeight: 800, color: COLORS.accent, background: COLORS.bg, textAlign: "center", outline: "none", minWidth: 0 }} />
            <button onClick={() => setLastDose(d => Math.round((d + 0.5) * 10) / 10)} style={{ width: 36, height: 40, borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, fontSize: 18, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>+</button>
            <span style={{ fontSize: 12, color: COLORS.muted, flexShrink: 0 }}>ÐµÐ´.</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>ÐÑÐµÐ¼Ñ Ð²Ð²ÐµÐ´ÐµÐ½Ð¸Ñ</div>
          <input type="time" value={lastTime} onChange={e => setLastTime(e.target.value)}
            style={{ fontSize: 16, fontWeight: 700, border: "2px solid " + COLORS.accent, borderRadius: 10, padding: "10px 12px", width: "100%", background: COLORS.bg, color: COLORS.text, boxSizing: "border-box" }} />
        </div>
        <div style={{ background: iob > 0 ? COLORS.warningLight : COLORS.successLight, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>ÐÐºÑÐ¸Ð²Ð½ÑÐ¹ Ð¸Ð½ÑÑÐ»Ð¸Ð½</div>
            {iobMins !== null && iob > 0 && <div style={{ fontSize: 11, color: COLORS.muted }}>{Math.floor(iobMins / 60)}Ñ {iobMins % 60}Ð¼Ð¸Ð½ Ð½Ð°Ð·Ð°Ð´</div>}
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: iob > 0 ? COLORS.warning : COLORS.success }}>{iobDisplay} <span style={{ fontSize: 12 }}>ÐµÐ´.</span></span>
        </div>
        {iob > 0 && <div style={{ fontSize: 12, color: COLORS.warning, marginTop: 8, fontWeight: 500 }}>IOB Ð±ÑÐ´ÐµÑ Ð²ÑÑÑÐµÐ½ Ð¸Ð· ÐºÐ¾ÑÑÐµÐºÑÐ¸Ð¸</div>}
        {iob > 0 && tab !== "correction" && totalXE > 0 && (
          <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 6, fontWeight: 500 }}>
            â ï¸ Ð¤Ð¸Ð°ÑÐ¿ Ð±ÑÐ» Ð¼ÐµÐ½ÐµÐµ {FIASP_DIA}Ñ Ð½Ð°Ð·Ð°Ð´ â ÑÐ¸ÑÐº Ð½Ð°Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ Ð´Ð¾Ð·, Ð²Ð²Ð¾Ð´Ð¸ÑÐµ Ð½Ð¾Ð²ÑÑ Ð´Ð¾Ð·Ñ Ð¾ÑÑÐ¾ÑÐ¾Ð¶Ð½Ð¾
          </div>
        )}
        {(lastDose > 0 || lastTime) && (
          <button onClick={() => { setLastDose(0); setLastTime(""); }} style={{
            width: "100%", marginTop: 10, padding: "8px", borderRadius: 10, border: "1px solid " + COLORS.danger,
            background: "transparent", color: COLORS.danger, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            â Ð¡Ð±ÑÐ¾ÑÐ¸ÑÑ IOB
          </button>
        )}
      </Card>

      <Card style={{ border: "2px solid " + COLORS.accent }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Ð Ð°ÑÑÑÑÐ½Ð°Ñ Ð´Ð¾Ð·Ð° Ð¤Ð¸Ð°ÑÐ¿Ð°</div>

        {tab !== "correction" && (totalXE > 0 ? (
          <div style={{ background: COLORS.accentLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: COLORS.muted }}>ÐÐ° ÐµÐ´Ñ (Ð¥Ð)</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{totalXE} Ð¥Ð x {activeICR.icr} ÐµÐ´.</div>
            </div>
            <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.accent }}>{mealDose} <span style={{ fontSize: 13 }}>ÐµÐ´.</span></span>
          </div>
        ) : (
          <div style={{ background: COLORS.bg, borderRadius: 12, padding: "10px 14px", fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>ÐÐ¾Ð±Ð°Ð²ÑÑÐµ Ð¿ÑÐ¾Ð´ÑÐºÑÑ Ð´Ð»Ñ ÑÐ°ÑÑÑÑÐ° Ð´Ð¾Ð·Ñ Ð½Ð° ÐµÐ´Ñ</div>
        ))}

        {tab !== "correction" && totalBJE > 0 && (
          <div style={{ background: COLORS.purpleLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: COLORS.muted }}>ÐÐÐ (Ð¶Ð¸Ñ/Ð±ÐµÐ»Ð¾Ðº)</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{totalBJE} ÐÐÐ x {BJU_COEF} ÐµÐ´. Â· Ð¾ÑÐµÐ½Ð¾ÑÐ½Ð¾</div>
              </div>
              <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.purple }}>{bjuDose} <span style={{ fontSize: 13 }}>ÐµÐ´.</span></span>
            </div>
            {glucose < TARGET && (
              <div style={{ fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 4 }}>
                â ï¸ Ð¡Ð°ÑÐ°Ñ Ð² Ð½Ð¾ÑÐ¼Ðµ/Ð½Ð¸Ð¶Ðµ ÑÐµÐ»Ð¸ â ÐÐÐ-Ð´Ð¾Ð·Ñ Ð»ÑÑÑÐµ Ð¾ÑÐ»Ð¾Ð¶Ð¸ÑÑ Ð¸ ÐºÐ¾Ð½ÑÑÐ¾Ð»Ð¸ÑÐ¾Ð²Ð°ÑÑ Dexcom
              </div>
            )}
            {iob > 0 && (
              <div style={{ fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 4 }}>
                â ï¸ ÐÑÑÑ Ð°ÐºÑÐ¸Ð²Ð½ÑÐ¹ Ð¸Ð½ÑÑÐ»Ð¸Ð½ (IOB {iobDisplay} ÐµÐ´.) â ÑÐ¸ÑÐº Ð½Ð°Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ, Ð²Ð²Ð¾Ð´Ð¸ÑÐµ ÐÐÐ Ð¾ÑÑÐ¾ÑÐ¾Ð¶Ð½Ð¾
              </div>
            )}
            {(hour >= 22 || hour < 6) && (
              <div style={{ fontSize: 12, color: COLORS.danger, fontWeight: 500 }}>
                ð ÐÐ¾ÑÐ½Ð¾Ðµ Ð²ÑÐµÐ¼Ñ â Ð¿Ð¾Ð²ÑÑÐµÐ½ ÑÐ¸ÑÐº Ð¿Ð¾Ð·Ð´Ð½ÐµÐ¹ Ð³Ð¸Ð¿Ð¾Ð³Ð»Ð¸ÐºÐµÐ¼Ð¸Ð¸ Ð¾Ñ ÐÐÐ-Ð´Ð¾Ð·Ñ
              </div>
            )}
            {glucose >= TARGET && iob === 0 && hour >= 6 && hour < 22 && (
              <div style={{ fontSize: 12, color: COLORS.success, fontWeight: 500 }}>
                â Ð¡Ð°ÑÐ°Ñ Ð¿Ð¾Ð²ÑÑÐµÐ½, IOB Ð½ÐµÑ â ÐÐÐ-Ð´Ð¾Ð·Ñ Ð¼Ð¾Ð¶Ð½Ð¾ ÑÑÐ¸ÑÑÐ²Ð°ÑÑ
              </div>
            )}
          </div>
        )}

        {tab !== "meal" && (rawCorr > 0 ? (
          <>
            {iob > 0 && (
              <div style={{ background: COLORS.warningLight, borderRadius: 12, padding: "8px 14px", fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>IOB Ð²ÑÑÑÐµÐ½ Ð¸Ð· ÐºÐ¾ÑÑÐµÐºÑÐ¸Ð¸</span><span>-{iobDisplay} ÐµÐ´.</span>
              </div>
            )}
            {corrRounded > 0 ? (
              <div style={{ background: COLORS.warningLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted }}>ÐÐ¾ÑÑÐµÐºÑÐ¸Ñ</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{glucose} - {TARGET} Ð¼Ð¼Ð¾Ð»Ñ / Ð¤Ð§ {ISF}</div>
                </div>
                <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.warning }}>{corrRounded} <span style={{ fontSize: 13 }}>ÐµÐ´.</span></span>
              </div>
            ) : (
              <div style={{ background: COLORS.successLight, borderRadius: 14, padding: "12px 16px", fontSize: 13, color: COLORS.success, fontWeight: 500, marginBottom: 10 }}>IOB Ð¿Ð¾ÐºÑÑÐ²Ð°ÐµÑ ÐºÐ¾ÑÑÐµÐºÑÐ¸Ñ</div>
            )}
          </>
        ) : (
          <div style={{ background: COLORS.successLight, borderRadius: 14, padding: "12px 16px", fontSize: 13, color: COLORS.success, fontWeight: 500, marginBottom: 10 }}>ÐÐ¾ÑÑÐµÐºÑÐ¸Ñ Ð½Ðµ Ð½ÑÐ¶Ð½Ð° â ÑÐ°ÑÐ°Ñ Ð² ÑÐµÐ»Ð¸</div>
        ))}

        <div style={{ borderTop: "2px dashed " + COLORS.border, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>ÐÑÐ¾Ð³Ð¾ Ð²Ð²ÐµÑÑÐ¸</span>
            {(mealDose > 0 || bjuDose > 0 || corrRounded > 0) && (
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                {mealDose > 0 ? "ÐµÐ´Ð° " + mealDose : ""}{bjuDose > 0 ? " + ÐÐÐ " + bjuDose : ""}{corrRounded > 0 ? " + ÐºÐ¾ÑÑÐµÐºÑÐ¸Ñ " + corrRounded : ""}
              </div>
            )}
          </div>
          <span style={{ fontSize: 36, fontWeight: 800, color: COLORS.accent }}>{totalDose} <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>ÐµÐ´.</span></span>
        </div>
      </Card>

      <div style={{ background: COLORS.dangerLight, borderRadius: 12, padding: "12px 14px", fontSize: 12, color: COLORS.danger, lineHeight: 1.5 }}>
        ÐÐ°Ð»ÑÐºÑÐ»ÑÑÐ¾Ñ Ð½Ð¾ÑÐ¸Ñ Ð¸Ð½ÑÐ¾ÑÐ¼Ð°ÑÐ¸Ð¾Ð½Ð½ÑÐ¹ ÑÐ°ÑÐ°ÐºÑÐµÑ. ÐÐ¾Ð·Ñ ÑÐ¾Ð³Ð»Ð°ÑÐ¾Ð²ÑÐ²Ð°Ð¹ÑÐµ Ñ ÑÐ½Ð´Ð¾ÐºÑÐ¸Ð½Ð¾Ð»Ð¾Ð³Ð¾Ð¼. ÐÑÐ¸ ÐÐ Ð½Ð¸Ð¶Ðµ 4 Ð¼Ð¼Ð¾Ð»Ñ/Ð» Ð¸Ð½ÑÑÐ»Ð¸Ð½ Ð½Ðµ Ð²Ð²Ð¾Ð´Ð¸ÑÑ.
      </div>
    </div>
  );
}
