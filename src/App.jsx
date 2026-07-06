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
    r.onerror = () => rej(new Error("Не удалось прочитать файл"));
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
          reject(new Error("Ошибка обработки изображения: " + err.message));
        }
      };
      img.onerror = () => resolve(dataUrl.split(",")[1]);
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
}

// Вызов через собственную serverless-функцию /api/analyze — ключ хранится на сервере
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
    throw new Error("Сетевая ошибка: " + netErr.message);
  }

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error("Сервер вернул не JSON (статус " + res.status + "): " + rawText.slice(0, 150));
  }
  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error("Пустой ответ от сервера");
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
        {loading ? "⏳..." : label}
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
      const text = await callClaude(file, "This is a food nutrition label. Find carbohydrates, protein and fat per 100g. Reply ONLY with JSON like this: {\"name\":\"product name\",\"carbs\":45.2,\"protein\":10.5,\"fat\":8.3} — nothing else. If protein or fat not visible, use 0.");
      const clean = text.replace(/```[a-z]*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.name) setName(parsed.name);
      if (parsed.carbs !== undefined) setCarbs(String(parsed.carbs));
      if (parsed.protein !== undefined) setProtein(String(parsed.protein));
      if (parsed.fat !== undefined) setFat(String(parsed.fat));
      setStatus("✓ Распознано");
      setTimeout(() => setStatus(""), 2500);
    } catch(err) {
      setStatus("✗ " + err.message);
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
    if (!name) { alert("Введите название продукта"); return; }
    if (!grams || g <= 0) { alert("Введите количество (граммы порции)"); return; }
    if (!carbs && !protein && !fat) { alert("Введите хоть бы углеводы, белки или жиры на 100г"); return; }
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
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Название продукта"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 13, background: COLORS.card, minWidth: 0 }} />
        <PhotoButton label="📷 Этикетка" loading={loading} onChange={handlePhoto} />
      </div>
      {status && (
        <div style={{ fontSize: 11, color: status.startsWith("✓") ? COLORS.success : COLORS.danger, marginBottom: 8, wordBreak: "break-word" }}>
          {status}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>Углеводы /100г</div>
          <input value={carbs} onChange={e => setCarbs(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>Количество (г)</div>
          <input value={grams} onChange={e => setGrams(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>Белки /100г</div>
          <input value={protein} onChange={e => setProtein(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>Жиры /100г</div>
          <input value={fat} onChange={e => setFat(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid " + COLORS.border, fontSize: 15, fontWeight: 700, background: COLORS.card, boxSizing: "border-box" }} />
        </div>
      </div>
      {xe !== null && (
        <div style={{ fontSize: 13, color: COLORS.accent, fontWeight: 600, marginBottom: 6 }}>
          = {Math.round(totalCarbsExactPreview * 10) / 10}г углеводов · {xe} ХЕ
        </div>
      )}
      {isFatty && (
        <div style={{ fontSize: 12, color: COLORS.purple, fontWeight: 600, marginBottom: 8, background: COLORS.purpleLight, borderRadius: 8, padding: "6px 10px" }}>
          Жирный/белковый продукт → БЖЕ: {bje} БЖЕ (ориентировочно)
        </div>
      )}
      <button onClick={handleAdd} style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        + Добавить
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
    setDexStatus("Читаю фото...");
    try {
      const text = await callClaude(file, "This is a Dexcom CGM glucose monitor screen showing current glucose level and a trend arrow. Find the current glucose value in mmol/L. Reply with ONLY the number, for example: 8.4 or 15.4 — ignore the trend arrow, just give the number.");
      const num = parseFloat(text.trim().replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!isNaN(num) && num > 1 && num < 35) {
        setGlucoseStr(String(Math.round(num * 10) / 10));
        setDexStatus("Готово: " + Math.round(num * 10) / 10 + " ммоль/л");
        setTimeout(() => setDexStatus(""), 3000);
      } else {
        setDexStatus("Не распознал. Ответ: " + text.trim().slice(0, 50));
      }
    } catch(err) {
      setDexStatus("Ошибка: " + (err && err.message ? err.message : String(err)));
    }
    setDexLoading(false);
    e.target.value = "";
  };

  const tabs = [
    { id: "both", label: "Еда + коррекция" },
    { id: "meal", label: "Только еда" },
    { id: "correction", label: "Только коррекция" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "system-ui, -apple-system, sans-serif", padding: "20px 14px 40px", maxWidth: 420, margin: "0 auto", color: COLORS.text }}>

      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: COLORS.muted, textTransform: "uppercase", marginBottom: 4 }}>Фиаспр · Требиба</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Калькулятор дозы</h1>
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
          ↻ Сбросить всё
        </button>
      </div>

      <Card style={{ background: (hour >= 20 && hour < 21) ? COLORS.purpleLight : "#fafafe", border: "1px solid " + ((hour >= 20 && hour < 21) ? COLORS.purple : COLORS.border) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🩸</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple }}>{(hour >= 20 && hour < 21) ? "Время Требибы!" : "Требиба (базал)"}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>Ежедневно ~20:00</div>
            </div>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.purple }}>28 <span style={{ fontSize: 12 }}>ед.</span></span>
        </div>
      </Card>

      <Card style={{ background: COLORS.accentLight, border: "1px solid " + COLORS.accent + "33" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: COLORS.accent }}>УР по времени (ед. на 1 ХЕ)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {ICR_SCHEDULE.map(s => (
            <div key={s.label} style={{ background: s === activeICR ? COLORS.accent : COLORS.card, borderRadius: 10, padding: "8px 10px", border: "1px solid " + (s === activeICR ? COLORS.accent : COLORS.border) }}>
              <div style={{ fontSize: 10, color: s === activeICR ? "rgba(255,255,255,0.75)" : COLORS.muted }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: s === activeICR ? "#fff" : COLORS.text }}>{s.icr} ед./ХЕ</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.muted }}>ФЧ коррекции: 1 ед. снижает на 0.8 ммоль/л · 1 ХЕ = 10г углеводов</div>
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
            <span style={{ fontSize: 14, fontWeight: 700 }}>Текущий уровень</span>
          </div>
          <PhotoButton label="📸 Фото Dexcom" loading={dexLoading} onChange={handleDexPhoto} />
        </div>
        {dexStatus ? (
          <div style={{ background: dexStatus.startsWith("Готово") ? COLORS.successLight : COLORS.warningLight, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: dexStatus.startsWith("Готово") ? COLORS.success : COLORS.warning, marginBottom: 10, wordBreak: "break-all" }}>
            {dexStatus}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <input type="number" step="0.1" min="2" max="25" value={glucoseStr}
            onChange={e => setGlucoseStr(e.target.value)}
            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setGlucoseStr(String(Math.round(v * 10) / 10)); }}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "2px solid " + glucoseColor, fontSize: 24, fontWeight: 800, color: glucoseColor, background: COLORS.bg, textAlign: "center", outline: "none" }} />
          <span style={{ fontSize: 13, color: COLORS.muted }}>ммоль/л</span>
        </div>
        <input type="range" min={2} max={25} step={0.1} value={glucose}
          onChange={e => setGlucoseStr(e.target.value)}
          style={{ width: "100%", accentColor: glucoseColor, cursor: "pointer", marginBottom: 10 }} />
        <div style={{ background: glucose > 10 ? COLORS.warningLight : glucose < 4 ? COLORS.dangerLight : COLORS.successLight, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: glucoseColor, fontWeight: 500 }}>
          {glucose > 13 ? "Отягченная гипергликемия" : glucose > 10 ? "Повышен — нужна коррекция" : glucose > 7.8 ? "Немного выше норм" : glucose >= 4 ? "В целевом диапазоне" : "Гипогликемия — сначала куприте!"}
        </div>
      </Card>

      {tab !== "correction" && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Продукты</span>
            <span style={{ fontSize: 11, color: COLORS.muted }}>1 ХЕ = 10г углеводов</span>
          </div>
          <FoodEntry onAdd={f => setFoods(prev => [...prev, f])} />
          {foods.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: COLORS.accentLight, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{f.grams}г · {f.totalCarbs}г УЭ{f.totalBJE > 0 ? " · " + f.totalBJE + " БЖЕ" : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.accent }}>{f.totalXE} ХЕ</span>
                <button onClick={() => setFoods(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            </div>
          ))}
          {foods.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: COLORS.accent, color: "#fff", fontWeight: 700, marginTop: 4, marginBottom: 8 }}>
              <span>Итого</span>
              <span>{totalCarbs}г · {totalXE} ХЕ</span>
            </div>
          )}
          {foods.length > 0 && (
            <button onClick={() => setFoods([])} style={{
              width: "100%", padding: "8px", borderRadius: 10, border: "1px solid " + COLORS.danger,
              background: "transparent", color: COLORS.danger, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              × Сбросить все продукты
            </button>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Активный инсулин (IOB)</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>Последний болюс</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setLastDose(d => Math.max(0, Math.round((d - 0.5) * 10) / 10))} style={{ width: 36, height: 40, borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, fontSize: 18, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>-</button>
            <input type="number" step="0.5" min="0" value={lastDose}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setLastDose(Math.round(v * 2) / 2); }}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "2px solid " + COLORS.accent, fontSize: 18, fontWeight: 800, color: COLORS.accent, background: COLORS.bg, textAlign: "center", outline: "none", minWidth: 0 }} />
            <button onClick={() => setLastDose(d => Math.round((d + 0.5) * 10) / 10)} style={{ width: 36, height: 40, borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, fontSize: 18, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>+</button>
            <span style={{ fontSize: 12, color: COLORS.muted, flexShrink: 0 }}>ед.</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>Время введения</div>
          <input type="time" value={lastTime} onChange={e => setLastTime(e.target.value)}
            style={{ fontSize: 16, fontWeight: 700, border: "2px solid " + COLORS.accent, borderRadius: 10, padding: "10px 12px", width: "100%", background: COLORS.bg, color: COLORS.text, boxSizing: "border-box" }} />
        </div>
        <div style={{ background: iob > 0 ? COLORS.warningLight : COLORS.successLight, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Активный инсулин</div>
            {iobMins !== null && iob > 0 && <div style={{ fontSize: 11, color: COLORS.muted }}>{Math.floor(iobMins / 60)}ч {iobMins % 60}мин назад</div>}
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: iob > 0 ? COLORS.warning : COLORS.success }}>{iobDisplay} <span style={{ fontSize: 12 }}>ед.</span></span>
        </div>
        {iob > 0 && <div style={{ fontSize: 12, color: COLORS.warning, marginTop: 8, fontWeight: 500 }}>IOB будет вычтен из коррекции</div>}
        {iob > 0 && tab !== "correction" && totalXE > 0 && (
          <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 6, fontWeight: 500 }}>
            ⚠️ Фиаспр был менее {FIASP_DIA}ч назад — риск наложения доз, вводите новую дозу осторожно
          </div>
        )}
        {(lastDose > 0 || lastTime) && (
          <button onClick={() => { setLastDose(0); setLastTime(""); }} style={{
            width: "100%", marginTop: 10, padding: "8px", borderRadius: 10, border: "1px solid " + COLORS.danger,
            background: "transparent", color: COLORS.danger, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            × Сбросить IOB
          </button>
        )}
      </Card>

      <Card style={{ border: "2px solid " + COLORS.accent }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Расчётная доза Фиаспра</div>

        {tab !== "correction" && (totalXE > 0 ? (
          <div style={{ background: COLORS.accentLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: COLORS.muted }}>На еду (ХЕ)</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{totalXE} ХЕ x {activeICR.icr} ед.</div>
            </div>
            <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.accent }}>{mealDose} <span style={{ fontSize: 13 }}>ед.</span></span>
          </div>
        ) : (
          <div style={{ background: COLORS.bg, borderRadius: 12, padding: "10px 14px", fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>Добавьте продукты для расчёта дозы на еду</div>
        ))}

        {tab !== "correction" && totalBJE > 0 && (
          <div style={{ background: COLORS.purpleLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: COLORS.muted }}>БЖЕ (жир/белок)</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{totalBJE} БЖЕ x {BJU_COEF} ед. · ориентировочно</div>
              </div>
              <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.purple }}>{bjuDose} <span style={{ fontSize: 13 }}>ед.</span></span>
            </div>
            {glucose < TARGET && (
              <div style={{ fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 4 }}>
                ⚠️ Сахара в норме/ниже цели — БЖЕ-дозу лучше отложить и контролировать Dexcom
              </div>
            )}
            {iob > 0 && (
              <div style={{ fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 4 }}>
                ⚠️ Есть активный инсулин (IOB {iobDisplay} ед.) — риск наложения, вводите БЖЕ осторожно
              </div>
            )}
            {(hour >= 22 || hour < 6) && (
              <div style={{ fontSize: 12, color: COLORS.danger, fontWeight: 500 }}>
                🌙 Ночное время — повышен риск поздней гипогликемии от БЖЕ-дозы
              </div>
            )}
            {glucose >= TARGET && iob === 0 && hour >= 6 && hour < 22 && (
              <div style={{ fontSize: 12, color: COLORS.success, fontWeight: 500 }}>
                ✓ Сахара повышен, IOB нет — БЖЕ-дозу можно учитывать
              </div>
            )}
          </div>
        )}

        {tab !== "meal" && (rawCorr > 0 ? (
          <>
            {iob > 0 && (
              <div style={{ background: COLORS.warningLight, borderRadius: 12, padding: "8px 14px", fontSize: 12, color: COLORS.warning, fontWeight: 500, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>IOB вычтен из коррекции</span><span>-{iobDisplay} ед.</span>
              </div>
            )}
            {corrRounded > 0 ? (
              <div style={{ background: COLORS.warningLight, borderRadius: 14, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted }}>Коррекция</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{glucose} - {TARGET} ммоль / ФЧ {ISF}</div>
                </div>
                <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.warning }}>{corrRounded} <span style={{ fontSize: 13 }}>ед.</span></span>
              </div>
            ) : (
              <div style={{ background: COLORS.successLight, borderRadius: 14, padding: "12px 16px", fontSize: 13, color: COLORS.success, fontWeight: 500, marginBottom: 10 }}>IOB покрывает коррекцию</div>
            )}
          </>
        ) : (
          <div style={{ background: COLORS.successLight, borderRadius: 14, padding: "12px 16px", fontSize: 13, color: COLORS.success, fontWeight: 500, marginBottom: 10 }}>Коррекция не нужна — сахара в цели</div>
        ))}

        <div style={{ borderTop: "2px dashed " + COLORS.border, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Итого введите</span>
            {(mealDose > 0 || bjuDose > 0 || corrRounded > 0) && (
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                {mealDose > 0 ? "еда " + mealDose : ""}{bjuDose > 0 ? " + БЖЕ " + bjuDose : ""}{corrRounded > 0 ? " + коррекция " + corrRounded : ""}
              </div>
            )}
          </div>
          <span style={{ fontSize: 36, fontWeight: 800, color: COLORS.accent }}>{totalDose} <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>ед.</span></span>
        </div>
      </Card>

      <div style={{ background: COLORS.dangerLight, borderRadius: 12, padding: "12px 14px", fontSize: 12, color: COLORS.danger, lineHeight: 1.5 }}>
        Калькулятор носит информационный характер. Дозу согласовывайте с эндокринологом. При ГК ниже 4 ммоль/л инсулин не вводитьте.
      </div>
    </div>
  );
}
